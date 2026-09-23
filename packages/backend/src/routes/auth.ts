import { Router } from "express";
import {
  loginInputSchema,
  changePasswordInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/apiResult.js";
import { sendData } from "../lib/apiResult.js";
import {
  createSession,
  hashPassword,
  revokeSession,
  verifyPassword
} from "../services/authService.js";
import { requireAuth, getAuthenticatedUser, SESSION_COOKIE_NAME } from "../middleware/auth.js";
import { createPasswordResetToken, consumePasswordResetToken } from "../services/passwordResetService.js";
import { sendPasswordResetEmail } from "../services/mailService.js";

export const authRouter = Router();

const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Threat-Model: Anonyme Requests versuchen sich mit erratenen/gestohlenen Zugangsdaten anzumelden.
// Serverseitig erzwungen: Passwort-Hash-Vergleich (bcrypt), generische Fehlermeldung (kein
// User-Enumeration-Leak). Negativ-Test: falsches Passwort -> 401, unbekannter User -> 401 (gleiche Meldung).
// SCOPE: global
authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginInputSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { username: { equals: input.username, mode: "insensitive" } }
    });
    const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      throw new AppError("UNAUTHORIZED", "Benutzername oder Passwort ist falsch.");
    }

    const rawToken = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE_MS
    });
    sendData(res, {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    });
  } catch (err) {
    next(err);
  }
});

// SCOPE: self
authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string;
    await revokeSession(rawToken);
    res.clearCookie(SESSION_COOKIE_NAME);
    sendData(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
});

// Threat-Model: Ein eingeloggter Nutzer koennte versuchen, das Passwort eines anderen zu aendern.
// Serverseitig erzwungen: currentPassword-Pruefung gegen req.user (nicht gegen Body-userId).
// Negativ-Test: falsches currentPassword -> 401.
// SCOPE: self
authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const input = changePasswordInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const currentOk = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new AppError("UNAUTHORIZED", "Aktuelles Passwort ist falsch.");
    }
    const newHash = await hashPassword(input.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false }
    });
    sendData(res, { changed: true });
  } catch (err) {
    next(err);
  }
});

// Gibt absichtlich immer Erfolg zurueck, unabhaengig davon ob die E-Mail existiert
// (kein User-Enumeration-Leak).
// SCOPE: global
authRouter.post("/request-password-reset", async (req, res, next) => {
  try {
    const input = requestPasswordResetInputSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" } }
    });
    if (user) {
      const rawToken = await createPasswordResetToken(user.id);
      await sendPasswordResetEmail(user.email, rawToken);
    }
    sendData(res, { requested: true });
  } catch (err) {
    next(err);
  }
});

// SCOPE: global (Token IST die Autorisierung, kein Login noetig)
authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const input = resetPasswordInputSchema.parse(req.body);
    const userId = await consumePasswordResetToken(input.token);
    if (!userId) {
      throw new AppError("UNAUTHORIZED", "Der Link ist ungueltig oder abgelaufen.");
    }
    const newHash = await hashPassword(input.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false }
    });
    sendData(res, { reset: true });
  } catch (err) {
    next(err);
  }
});
