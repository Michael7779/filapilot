import { Router } from "express";
import { z } from "zod";
import {
  createUserInputSchema,
  updateOwnThemeInputSchema,
  updateUserInputSchema
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import {
  requireAuth,
  requirePasswordAlreadyChanged,
  requireRole,
  getAuthenticatedUser
} from "../middleware/auth.js";
import { generateRandomPassword, hashPassword } from "../services/authService.js";
import { sendNewAccountEmail, sendPasswordResetByAdminEmail } from "../services/mailService.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { userSnapshot } from "../lib/auditSnapshots.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";
import { toPublicUser } from "../lib/mappers.js";

export const usersRouter = Router();

// SCOPE: self
usersRouter.get("/me", requireAuth, (req, res) => {
  sendData(res, toPublicUser(getAuthenticatedUser(req)));
});

// Threat-Model: Nutzer A koennte versuchen, die Akzentfarbe von Nutzer B zu setzen, indem er eine
// fremde userId im Body mitschickt. Serverseitig erzwungen: Update immer auf req.user.id, niemals
// auf eine Body-userId. Negativ-Test: Body mit fremder userId wird ignoriert, es aendert sich nur
// das eigene Konto.
// SCOPE: self
usersRouter.patch("/me/theme", requireAuth, requirePasswordAlreadyChanged, async (req, res, next) => {
  try {
    const input = updateOwnThemeInputSchema.parse(req.body);
    const current = getAuthenticatedUser(req);
    const updated = await prisma.user.update({
      where: { id: current.id },
      data: { themeAccentColor: input.themeAccentColor }
    });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "USER",
      entityId: current.id,
      description: `${current.username}: Akzentfarbe`,
      before: { themeAccentColor: current.themeAccentColor },
      after: { themeAccentColor: updated.themeAccentColor }
    });
    sendData(res, toPublicUser(updated));
  } catch (err) {
    next(err);
  }
});

// Threat-Model: Ein Nutzer ohne Admin-Rolle koennte versuchen, sich selbst oder andere als Admin
// anzulegen. Serverseitig erzwungen: requireRole("ADMIN") vor dem Handler. Negativ-Test: Nutzer
// mit Rolle USER erhaelt 403.
// SCOPE: global
usersRouter.post(
  "/",
  requireAuth,
  requirePasswordAlreadyChanged,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const input = createUserInputSchema.parse(req.body);
      const duplicate = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: input.username, mode: "insensitive" } },
            { email: { equals: input.email, mode: "insensitive" } }
          ]
        },
        select: { id: true }
      });
      if (duplicate) {
        throw new AppError(
          "CONFLICT",
          "Benutzername oder E-Mail-Adresse ist bereits vergeben."
        );
      }
      const temporaryPassword = generateRandomPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const created = await prisma.user.create({
        data: {
          username: input.username,
          email: input.email,
          role: input.role,
          mustChangePassword: input.forcePasswordChange,
          passwordHash
        }
      });
      await recordAudit({
        actor: actorFromRequest(req),
        action: "CREATE",
        area: "USER",
        entityId: created.id,
        description: created.username,
        after: userSnapshot(created)
      });
      const emailSent = await sendNewAccountEmail(created.email, created.username, temporaryPassword);
      sendData(
        res,
        {
          ...toPublicUser(created),
          ...(emailSent ? {} : { temporaryPassword })
        },
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

// SCOPE: global
usersRouter.get(
  "/",
  requireAuth,
  requirePasswordAlreadyChanged,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    sendData(
      res,
      users.map((user) => toPublicUser(user))
    );
  })
);

const idParamSchema = z.string().uuid();
const requireAdmin = [requireAuth, requirePasswordAlreadyChanged, requireRole("ADMIN")] as const;

async function findUserOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError("NOT_FOUND", "Benutzer wurde nicht gefunden.");
  }
  return user;
}

// Ein Admin darf nur entfernt/herabgestuft werden, wenn danach noch ein anderer Admin existiert -
// sonst koennte sich die Instanz selbst aussperren.
async function assertAnotherAdminExists(userId: string): Promise<void> {
  const others = await prisma.user.count({ where: { role: "ADMIN", NOT: { id: userId } } });
  if (others === 0) {
    throw new AppError("CONFLICT", "Es muss mindestens ein Admin bestehen bleiben.");
  }
}

// Threat-Model: Ein normaler Benutzer koennte versuchen, fremde Konten zu aendern, zu loeschen oder deren
// Passwort zu setzen (Kontouebernahme); ein Admin koennte sich versehentlich aussperren. Serverseitig
// erzwungen: requireRole("ADMIN"); Benutzername/E-Mail bleiben ohne Gross-/Kleinschreibung eindeutig;
// der letzte Admin kann weder geloescht noch herabgestuft werden; das eigene Konto kann nicht geloescht
// werden und das Passwort nicht ueber "zuruecksetzen" (dafuer gibt es "Passwort aendern").
// Negativ-Tests: kein Cookie -> 401, USER -> 403, letzter Admin -> 409, Duplikat -> 409.
// SCOPE: global
usersRouter.patch("/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const input = updateUserInputSchema.parse(req.body);
  const target = await findUserOrThrow(id);

  if (input.role === "USER" && target.role === "ADMIN") {
    await assertAnotherAdminExists(id);
  }
  if (input.username !== undefined || input.email !== undefined) {
    const duplicate = await prisma.user.findFirst({
      where: {
        NOT: { id },
        OR: [
          ...(input.username !== undefined
            ? [{ username: { equals: input.username, mode: "insensitive" as const } }]
            : []),
          ...(input.email !== undefined
            ? [{ email: { equals: input.email, mode: "insensitive" as const } }]
            : [])
        ]
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new AppError("CONFLICT", "Benutzername oder E-Mail-Adresse ist bereits vergeben.");
    }
  }
  const updated = await prisma.user.update({ where: { id }, data: omitUndefined(input) });
  await recordUpdate({
    actor: actorFromRequest(req),
    area: "USER",
    entityId: id,
    description: updated.username,
    before: userSnapshot(target),
    after: userSnapshot(updated)
  });
  sendData(res, toPublicUser(updated));
}));

// SCOPE: global
usersRouter.delete("/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  if (id === getAuthenticatedUser(req).id) {
    throw new AppError("CONFLICT", "Das eigene Konto kann nicht geloescht werden.");
  }
  const target = await findUserOrThrow(id);
  if (target.role === "ADMIN") {
    await assertAnotherAdminExists(id);
  }
  await prisma.user.delete({ where: { id } });
  await recordAudit({
    actor: actorFromRequest(req),
    action: "DELETE",
    area: "USER",
    entityId: id,
    description: target.username,
    before: userSnapshot(target)
  });
  sendData(res, { deleted: true });
}));

// SCOPE: global
usersRouter.post("/:id/reset-password", ...requireAdmin, asyncHandler(async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  if (id === getAuthenticatedUser(req).id) {
    throw new AppError("CONFLICT", "Das eigene Passwort bitte ueber \"Passwort aendern\" setzen.");
  }
  const target = await findUserOrThrow(id);
  const temporaryPassword = generateRandomPassword();
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        resetToken: null,
        resetTokenExpiresAt: null
      }
    }),
    prisma.session.deleteMany({ where: { userId: id } })
  ]);
  await recordAudit({
    actor: actorFromRequest(req),
    action: "EVENT",
    area: "USER",
    entityId: id,
    description: `${target.username}: Passwort zurueckgesetzt`
  });
  const emailSent = await sendPasswordResetByAdminEmail(target.email, target.username, temporaryPassword);
  sendData(res, { username: target.username, ...(emailSent ? {} : { temporaryPassword }) });
}));
