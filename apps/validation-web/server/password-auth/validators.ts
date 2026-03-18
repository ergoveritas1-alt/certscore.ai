import { z } from "zod";
import { PASSWORD_AUTH_MIN_PASSWORD_LENGTH } from "./constants";
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
    .transform((value) => (typeof value === "string" ? getSafeRedirectPath(value) : "/app")),
  password: z.string().min(PASSWORD_AUTH_MIN_PASSWORD_LENGTH, `Password must be at least ${PASSWORD_AUTH_MIN_PASSWORD_LENGTH} characters.`)
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
  password: z.string().min(PASSWORD_AUTH_MIN_PASSWORD_LENGTH, `Password must be at least ${PASSWORD_AUTH_MIN_PASSWORD_LENGTH} characters.`),
  token: z.string().trim().min(1, "That reset link is invalid or expired.")
});

export function getSafeRedirectPath(nextPath: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

export function getAuthMode(value: FormDataEntryValue | null): AuthMode {
  return value === "create_account" ? "create_account" : "sign_in";
}
