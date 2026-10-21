import { Router } from "express";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import {
  SUPER_ADMIN_ONLY_USER_FIELDS,
  createUserInputSchema,
  updateOwnPreferencesInputSchema,
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
import { refreshSocketAccess } from "../socket.js";

export const usersRouter = Router();

// Freigaben und Super-Admin-Status setzt nur ein Super-Admin - ein normaler Admin koennte sich sonst selbst alles freigeben.
function assertMaySetAccess(actor: User, input: Partial<Record<(typeof SUPER_ADMIN_ONLY_USER_FIELDS)[number], unknown>>): void {
  if (!actor.isSuperAdmin && SUPER_ADMIN_ONLY_USER_FIELDS.some((field) => input[field] !== undefined)) {
    throw new AppError("FORBIDDEN", "Freigaben und Super-Admin-Status kann nur ein Super-Admin aendern.");
  }
}

// Ein Super-Admin-Konto (aendern, loeschen, Passwort zuruecksetzen) darf nur ein Super-Admin anfassen - sonst liesse es sich
// ueber "Passwort zuruecksetzen" uebernehmen.
function assertMayManage(actor: User, target: User): void {
  if (target.isSuperAdmin && !actor.isSuperAdmin) {
    throw new AppError("FORBIDDEN", "Ein Super-Admin-Konto kann nur ein Super-Admin verwalten.");
  }
}

// Es muss immer mindestens ein Super-Admin bleiben; in der Transaktion, in der es entfernt wird, aufgerufen.
async function assertAnotherSuperAdminExists(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const others = await tx.user.count({ where: { isSuperAdmin: true, NOT: { id: userId } } });
  if (others === 0) {
    throw new AppError("CONFLICT", "Es muss mindestens ein Super-Admin bestehen bleiben.");
  }
}

// Fuehrt eine Aktion aus, die einen Super-Admin entfernt oder herabstuft, atomar mit der Pruefung "es bleibt einer" -
// Serializable, damit zwei Super-Admins sich nicht gleichzeitig gegenseitig entfernen.
async function removingSuperAdmin<T>(userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await assertAnotherSuperAdminExists(tx, userId);
      return action(tx);
    },
    { isolationLevel: "Serializable" }
  );
}

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

// Threat-Model: Nutzer A koennte die Ansicht/Seitengroesse/den gesehenen Verlauf von Nutzer B aendern oder ungueltige
// Werte speichern. Serverseitig erzwungen: Update immer auf req.user.id (nie eine Body-userId), Werte nur aus fester
// Liste bzw. Laenge begrenzt (Zod). Negativ-Tests: anonym 401, fremde userId im Body wird ignoriert, ungueltige
// Ansicht/Seitengroesse 400.
// SCOPE: self
usersRouter.patch(
  "/me/preferences",
  requireAuth,
  requirePasswordAlreadyChanged,
  asyncHandler(async (req, res) => {
    const input = updateOwnPreferencesInputSchema.parse(req.body);
    const current = getAuthenticatedUser(req);
    const updated = await prisma.user.update({
      where: { id: current.id },
      data: omitUndefined({
        spoolView: input.spoolView,
        spoolPageSize: input.spoolPageSize,
        lastSeenChangelogVersion: input.lastSeenChangelogVersion
      })
    });
    sendData(res, toPublicUser(updated));
  })
);

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
      assertMaySetAccess(getAuthenticatedUser(req), input);
      if (input.isSuperAdmin && input.role !== "ADMIN") {
        throw new AppError("VALIDATION_ERROR", "Ein Super-Admin muss die Rolle Admin haben.");
      }
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
          isSuperAdmin: input.isSuperAdmin ?? false,
          canUseFilament: input.canUseFilament ?? true,
          canUseSizzle: input.canUseSizzle ?? false,
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
// Freigaben/Super-Admin (docs/requirements/sizzle.md, Z2-Z5): setzen nur Super-Admins (403), ein Super-Admin-Konto fasst nur ein
// Super-Admin an (403), der letzte Super-Admin bleibt (409), ein Super-Admin ist immer Admin (400).
// Negativ-Tests: tests/security/userAccess.test.ts.
// SCOPE: global
usersRouter.patch("/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const input = updateUserInputSchema.parse(req.body);
  const actor = getAuthenticatedUser(req);
  assertMaySetAccess(actor, input);
  const target = await findUserOrThrow(id);
  assertMayManage(actor, target);

  const finalSuperAdmin = input.isSuperAdmin ?? target.isSuperAdmin;
  if (finalSuperAdmin && (input.role ?? target.role) !== "ADMIN") {
    throw new AppError("VALIDATION_ERROR", "Ein Super-Admin muss die Rolle Admin haben.");
  }
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
  const data = omitUndefined(input);
  const updated =
    target.isSuperAdmin && !finalSuperAdmin
      ? await removingSuperAdmin(id, (tx) => tx.user.update({ where: { id }, data }))
      : await prisma.user.update({ where: { id }, data });
  await recordUpdate({
    actor: actorFromRequest(req),
    area: "USER",
    entityId: id,
    description: updated.username,
    before: userSnapshot(target),
    after: userSnapshot(updated)
  });
  // Eine entzogene Filament-Freigabe gilt sofort auch fuer den Live-Druckerstatus
  void refreshSocketAccess();
  sendData(res, toPublicUser(updated));
}));

// SCOPE: global
usersRouter.delete("/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  if (id === getAuthenticatedUser(req).id) {
    throw new AppError("CONFLICT", "Das eigene Konto kann nicht geloescht werden.");
  }
  const target = await findUserOrThrow(id);
  assertMayManage(getAuthenticatedUser(req), target);
  if (target.role === "ADMIN") {
    await assertAnotherAdminExists(id);
  }
  if (target.isSuperAdmin) {
    await removingSuperAdmin(id, (tx) => tx.user.delete({ where: { id } }));
  } else {
    await prisma.user.delete({ where: { id } });
  }
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
  assertMayManage(getAuthenticatedUser(req), target);
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
