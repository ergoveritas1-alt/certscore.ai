"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { revokeCurrentPasswordSession } from "./session";
import { findAppUserByEmail, findPasswordAuthUserByEmail, getSupabaseAuthProvidersByUserId, normalizeEmail } from "./user";
import { credentialsSchema, getAuthMode } from "./validators";
import { bootstrapUserFromSession } from "../bootstrap-user";
import { initialCredentialsActionState, type CredentialsActionState } from "./action-state";
import type { AuthMode } from "./types";

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

async function createSupabasePasswordSessionClient() {
  const cookieStore = await cookies();

  return createServerSupabaseClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });
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
    const headerStore = await headers();
    const ipAddress = getClientIp(headerStore);
    const { enforcePasswordAuthRateLimit } = await import("./rate-limit");
    const rateLimitMessage = await enforcePasswordAuthRateLimit({
      email: normalizeEmail(values.email),
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

    const supabase = await createSupabasePasswordSessionClient();

    if (mode === "create_account") {
      const adminSupabase = createAdminClient();
      const existingAccount = await findAppUserByEmail(values.email);

      if (existingAccount) {
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(existingAccount.id, {
          password: values.password
        });

        if (updateError) {
          return {
            accountRecovery: null,
            error: `Could not set a password for this account. ${updateError.message}`,
            fieldErrors: {},
            mode
          };
        }
      } else {
        const { error: createError, data } = await adminSupabase.auth.admin.createUser({
          email: values.email,
          email_confirm: true,
          password: values.password
        });

        if (createError || !data.user) {
          return {
            accountRecovery: null,
            error: `Could not create account right now. ${createError?.message ?? "Try again."}`,
            fieldErrors: {},
            mode
          };
        }
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password
      });

      if (signInError || !signInData.user) {
        return {
          accountRecovery: null,
          error: `Account created, but sign in failed. ${signInError?.message ?? "Try signing in."}`,
          fieldErrors: {},
          mode
        };
      }

      await bootstrapUserFromSession(signInData.user);
      redirect(values.next);
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password
    });

    if (signInError || !signInData.user) {
      const [existingAccount, passwordAccount] = await Promise.all([
        findAppUserByEmail(values.email),
        findPasswordAuthUserByEmail(values.email)
      ]);

      const authProviders = existingAccount ? await getSupabaseAuthProvidersByUserId(existingAccount.id) : [];
      const hasSupabasePasswordProvider =
        authProviders.includes("email") || authProviders.includes("password");

      if (existingAccount && !passwordAccount && !hasSupabasePasswordProvider) {
        return {
          accountRecovery: {
            email: normalizeEmail(values.email),
            hint: "This account exists, but email/password sign-in is not set up yet. Create a password to use either sign-in method.",
            kind: "create_password"
          },
          error: "This account does not have a password yet.",
          fieldErrors: {},
          mode
        };
      }

      return {
        accountRecovery: null,
        error: mapFriendlyError(),
        fieldErrors: {},
        mode
      };
    }

    await bootstrapUserFromSession(signInData.user);
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
