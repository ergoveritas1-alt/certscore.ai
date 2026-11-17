import { z } from "zod";
import { safeAuthReturnPath } from "../../lib/auth-return-path";
import { AUTH_MIN_PASSWORD_LENGTH } from "./constants";
import type { AuthMode } from "./types";

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  next: z
    .string()
    .optional()
    .transform(safeAuthReturnPath),
  password: z.string().min(AUTH_MIN_PASSWORD_LENGTH, `Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters.`)
});

export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase())
});

export const passwordResetSchema = z.object({
  password: z.string().min(AUTH_MIN_PASSWORD_LENGTH, `Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters.`),
  token: z.string().trim().min(1, "That reset link is invalid or expired.")
});

export function getAuthMode(value: FormDataEntryValue | null): AuthMode {
  return value === "create_account" ? "create_account" : "sign_in";
}
