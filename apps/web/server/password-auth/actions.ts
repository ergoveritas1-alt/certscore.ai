"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { bootstrapAppUserSession } from "../bootstrap-user";
import { initialCredentialsActionState, type CredentialsActionState } from "./action-state";
import { verifyPassword } from "./password";
import { createPasswordSession, revokeCurrentPasswordSession } from "./session";
import { findPasswordAuthUserByEmail, markPasswordUserLogin, normalizeEmail } from "./user";
import { credentialsSchema, getAuthMode } from "./validators";

function getClientIp(headerStore: Headers) {
  const forwardedFor = headerStore.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

function mapFriendlyError() {
  return "Invalid email or password.";
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
    const ipAddress = getClientIp(headerStore);
    const { enforcePasswordAuthRateLimit } = await import("./rate-limit");
    const rateLimitMessage = await enforcePasswordAuthRateLimit({
      email: normalizedEmail,
      ipAddress,
      mode
    });

    if (rateLimitMessage) {
      return {
        accountRecovery: null,
        error: rateLimitMessage,
        fieldErrors: {},
        mode
      };
    }

    if (mode === "create_account") {
      return {
        accountRecovery: null,
        error: "Account creation is disabled. Contact us if you need access.",
        fieldErrors: {},
        mode: "sign_in"
      };
    }

    const passwordAccount = await findPasswordAuthUserByEmail(values.email);
    const isValidPassword = await verifyPassword(values.password, passwordAccount?.password_hash ?? null);

    if (!passwordAccount || !isValidPassword) {
      return {
        accountRecovery: null,
        error: mapFriendlyError(),
        fieldErrors: {},
        mode
      };
    }

    await createPasswordSession({
      ipAddress,
      userAgent: headerStore.get("user-agent"),
      userId: passwordAccount.id
    });
    await markPasswordUserLogin(passwordAccount.id);
    await bootstrapAppUserSession({
      authProvider: "password",
      email: passwordAccount.email,
      fullName: null,
      id: passwordAccount.id
    });

    redirect(values.next);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("submitCredentialsAction failed", {
      error: message,
      mode
    });

    return {
      accountRecovery: null,
      error: mode === "create_account" ? `Create account failed: ${message}` : `Sign in failed: ${message}`,
      fieldErrors: {},
      mode
    };
  }
}

export async function logoutPasswordSessionAction() {
  await revokeCurrentPasswordSession();
}
