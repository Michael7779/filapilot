import { Router } from "express";
import { createUserInputSchema, updateOwnThemeInputSchema } from "@filapilot/shared";
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
import { sendNewAccountEmail } from "../services/mailService.js";
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
    const updated = await prisma.user.update({
      where: { id: getAuthenticatedUser(req).id },
      data: { themeAccentColor: input.themeAccentColor }
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
