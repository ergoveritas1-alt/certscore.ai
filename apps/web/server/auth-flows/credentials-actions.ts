"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "../better-auth/auth";
import { bootstrapAppUserSession } from "../bootstrap-user";
import { initialCredentialsActionState, type CredentialsActionState } from "./action-state";
import { findAppUserByEmail, normalizeEmail } from "./user";
import { credentialsSchema, getAuthMode } from "./validators";

function deriveDisplayName(email: string) {
  const localPart = email.split("@")[0]?.trim();

  if (!localPart) {
    return "CertScore user";
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getBetterAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    body?: { code?: string; message?: string };
    code?: string;
    message?: string;
  };

  return candidate.body?.code ?? candidate.code ?? null;
}

function mapFriendlyError(error: unknown, mode: CredentialsActionState["mode"]) {
  const code = getBetterAuthErrorCode(error);

  switch (code) {
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email before signing in.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Invalid email or password.";
    case "PASSWORD_TOO_LONG":
      return "Password is too long.";
    case "PASSWORD_TOO_SHORT":
      return "Password must be at least 8 characters.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return mode === "create_account"
        ? "An account already exists for this email. Sign in or reset your password."
        : "Invalid email or password.";
    default:
      return mode === "create_account" ? "Could not create your account right now." : "Invalid email or password.";
  }
}

export async function submitCredentialsAction(
  _previousState: CredentialsActionState = initialCredentialsActionState,
  formData: FormData
): Promise<CredentialsActionState> {
  const mode = getAuthMode(formData.get("mode"));
  try {
    const parsed = credentialsSchema.safeParse({
      email: formData.get("email"),
      next: formData.get("next"),
      password: formData.get("password")
    });

    if (!parsed.success) {
      return {
        accountRecovery: null,
        error: null,
        fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])),
        mode
      };
    }

    const values = parsed.data;
    const normalizedEmail = normalizeEmail(values.email);
    const headerStore = await headers();

    if (mode === "create_account") {
      const existingAppUser = await findAppUserByEmail(normalizedEmail);

      if (existingAppUser) {
        return {
          accountRecovery: {
            email: normalizedEmail,
            hint: "An account already exists for this email. Use password reset to set up access.",
            kind: "create_password"
          },
          error: "An account already exists for this email. Use password reset to set up access.",
          fieldErrors: {},
          mode
        };
      }

      const response = await auth.api.signUpEmail({
        body: {
          callbackURL: values.next,
          email: normalizedEmail,
          name: deriveDisplayName(normalizedEmail),
          password: values.password
        },
        headers: headerStore
      });

      await bootstrapAppUserSession({
        authProvider: "password",
        email: response.user.email,
        fullName: response.user.name ?? null,
        id: response.user.id
      });
      redirect(values.next);
    }

    const response = await auth.api.signInEmail({
      body: {
        callbackURL: values.next,
        email: normalizedEmail,
        password: values.password
      },
      headers: headerStore
    });

    await bootstrapAppUserSession({
      authProvider: "password",
      email: response.user.email,
      fullName: response.user.name ?? null,
      id: response.user.id
    });

    redirect(values.next);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("submitCredentialsAction failed", {
      code: getBetterAuthErrorCode(error),
      error: message,
      mode
    });

    return {
      accountRecovery: null,
      error: mapFriendlyError(error, mode),
      fieldErrors: {},
      mode
    };
  }
}
