"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeEmail } from "./user";
import {
  initialPasswordResetRequestState,
  initialPasswordResetConfirmState,
  type PasswordResetConfirmState,
  type PasswordResetRequestState
} from "./reset-action-state";
import { passwordResetRequestSchema, passwordResetSchema } from "./validators";
import { enforcePasswordResetRequestRateLimit } from "./rate-limit";
import { resetPasswordWithToken, sendPasswordResetEmail } from "./reset";

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

function isMissingSupabaseUserError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("user not found");
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
  const ipAddress = getClientIp(headerStore);
  const requestOrigin = getRequestOrigin(headerStore);
  const rateLimitMessage = await enforcePasswordResetRequestRateLimit({
    email: normalizeEmail(values.email),
    ipAddress
  });

  if (rateLimitMessage) {
    return {
      error: rateLimitMessage,
      fieldErrors: {},
      message: null
    };
  }

  try {
    await sendPasswordResetEmail({
      email: values.email,
      redirectTo: `${requestOrigin}/reset-password/update`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!isMissingSupabaseUserError(message)) {
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
    const updated = await resetPasswordWithToken(parsed.data);

    if (!updated) {
      return {
        error: "This reset link is invalid or expired.",
        fieldErrors: {},
        message: null
      };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not reset password right now.",
      fieldErrors: {},
      message: null
    };
  }

  redirect("/login?message=password_reset");
}
