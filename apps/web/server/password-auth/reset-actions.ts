"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../better-auth/auth";
import { normalizeEmail } from "./user";
import {
  initialPasswordResetRequestState,
  initialPasswordResetConfirmState,
  type PasswordResetConfirmState,
  type PasswordResetRequestState
} from "./reset-action-state";
import { passwordResetRequestSchema, passwordResetSchema } from "./validators";

function getClientIp(headerStore: Headers) {
  const forwardedFor = headerStore.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

function getRequestOrigin(headerStore: Headers) {
  const forwardedHost = headerStore.get("x-forwarded-host")?.trim();
  const host = forwardedHost || headerStore.get("host")?.trim();

  if (!host) {
    return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  }

  const protocol = headerStore.get("x-forwarded-proto")?.trim() || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function isMissingPasswordUserError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("user not found");
}

function getBetterAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    body?: { code?: string; message?: string };
    code?: string;
  };

  return candidate.body?.code ?? candidate.code ?? null;
}

export async function requestPasswordResetAction(
  _previousState: PasswordResetRequestState = initialPasswordResetRequestState,
  formData: FormData
): Promise<PasswordResetRequestState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])),
      message: null
    };
  }

  const values = parsed.data;
  const headerStore = await headers();
  const requestOrigin = getRequestOrigin(headerStore);

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: values.email,
        redirectTo: `${requestOrigin}/reset-password/update`
      },
      headers: headerStore
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!isMissingPasswordUserError(message) && getBetterAuthErrorCode(error) !== "USER_NOT_FOUND") {
      console.error("requestPasswordResetAction failed", {
        email: normalizeEmail(values.email),
        error: message
      });

      return {
        error: "Could not send reset email right now. Try again.",
        fieldErrors: {},
        message: null
      };
    }
  }

  return {
    error: null,
    fieldErrors: {},
    message: "If an account exists for that email, we sent a reset link."
  };
}

export async function confirmPasswordResetAction(
  _previousState: PasswordResetConfirmState = initialPasswordResetConfirmState,
  formData: FormData
): Promise<PasswordResetConfirmState> {
  const parsed = passwordResetSchema.safeParse({
    password: formData.get("password"),
    token: formData.get("token")
  });

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])),
      message: null
    };
  }

  try {
    await auth.api.resetPassword({
      body: {
        newPassword: parsed.data.password,
        token: parsed.data.token
      },
      headers: await headers()
    });
  } catch (error) {
    if (getBetterAuthErrorCode(error) === "INVALID_TOKEN") {
      return {
        error: "This reset link is invalid or expired.",
        fieldErrors: {},
        message: null
      };
    }

    return {
      error: error instanceof Error ? error.message : "Could not reset password right now.",
      fieldErrors: {},
      message: null
    };
  }

  redirect("/login?message=password_reset");
}
