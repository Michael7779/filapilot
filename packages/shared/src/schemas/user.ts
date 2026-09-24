import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "USER"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Muss ein Hex-Farbwert sein, z.B. #2F6FED");

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(32),
  email: z.string().email(),
  role: userRoleSchema,
  mustChangePassword: z.boolean(),
  themeAccentColor: hexColorSchema.nullable(),
  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date()
});
export type UserPublic = z.infer<typeof userPublicSchema>;

// Nur bei Neuanlage: das Start-Passwort ist NUR gesetzt, wenn kein SMTP konfiguriert ist und die
// Zugangsdaten deshalb sonst niemanden erreichen wuerden (siehe routes/users.ts).
export type CreateUserResult = UserPublic & { temporaryPassword?: string };

export const createUserInputSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email(),
  role: userRoleSchema,
  forcePasswordChange: z.boolean().default(true)
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    username: z.string().min(3).max(32),
    email: z.string().email(),
    role: userRoleSchema
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const setupInputSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email(),
  password: z.string().min(10).max(200)
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200)
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const requestPasswordResetInputSchema = z.object({
  email: z.string().email()
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

export const resetPasswordInputSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(10).max(200)
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const updateOwnThemeInputSchema = z.object({
  themeAccentColor: hexColorSchema.nullable()
});
export type UpdateOwnThemeInput = z.infer<typeof updateOwnThemeInputSchema>;
