import { createAdminClient } from "@website-signal-risk-scanner/db";
import { randomUUID } from "node:crypto";
import type { AuthenticatedAppUser, PasswordAuthUserRecord } from "./types";

type ProfileRow = {
  auth_provider?: string;
  email: string;
  full_name: string | null;
  id: string;
};

function isMissingPasswordAuthTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("password_auth_users") ||
      normalized.includes("password_auth_sessions") ||
      normalized.includes("password_auth_rate_limits") ||
      normalized.includes("password_auth_verification_tokens") ||
      normalized.includes("password_auth_reset_tokens")) &&
    normalized.includes("schema cache")
  );
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || error?.message?.toLowerCase().includes("duplicate") === true;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mergeAuthProviders(existingProvider: string | null | undefined, nextProvider: string) {
  const providers = new Set(
    [existingProvider, nextProvider]
      .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return Array.from(providers).sort().join(",");
}

export async function findAppUserByEmail(email: string) {
  const db = createAdminClient();
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await db
    .from("users")
    .select("id, email, full_name, auth_provider")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load app user: ${error.message}`);
  }

  return (data as ProfileRow | null) ?? null;
}

export async function findPasswordAuthUserByEmail(email: string) {
  const db = createAdminClient();
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await db
    .from("password_auth_users")
    .select("id, email, password_hash, email_verified_at, created_at, updated_at, last_login_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    if (isMissingPasswordAuthTableError(error.message)) {
      console.warn("Password auth users table unavailable via schema cache; treating as no password account", {
        email: normalizedEmail
      });
      return null;
    }

    throw new Error(`Failed to load password user: ${error.message}`);
  }

  return (data as PasswordAuthUserRecord | null) ?? null;
}

export async function getAuthProvidersByUserId(userId: string) {
  const db = createAdminClient();
  const [appUserResult, passwordUserResult] = await Promise.all([
    db.from("users").select("auth_provider").eq("id", userId).maybeSingle(),
    db.from("password_auth_users").select("id").eq("id", userId).maybeSingle()
  ]);

  if (appUserResult.error) {
    throw new Error(`Failed to load auth user: ${appUserResult.error.message}`);
  }

  if (passwordUserResult.error && !isMissingPasswordAuthTableError(passwordUserResult.error.message)) {
    throw new Error(`Failed to load password auth provider: ${passwordUserResult.error.message}`);
  }

  const providers = new Set<string>();
  const authProviderValue = appUserResult.data?.auth_provider;

  if (typeof authProviderValue === "string") {
    authProviderValue
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean)
      .forEach((provider) => providers.add(provider));
  }

  if (passwordUserResult.data?.id) {
    providers.add("password");
  }

  return Array.from(providers);
}

export async function createPasswordAuthUser(input: { email: string; passwordHash: string }) {
  const db = createAdminClient();
  const normalizedEmail = normalizeEmail(input.email);
  const existingAppUser = await findAppUserByEmail(normalizedEmail);
  const userId = existingAppUser?.id ?? randomUUID();

  if (!existingAppUser) {
    const { error: profileError } = await db.from("users").insert({
      auth_provider: "password",
      email: normalizedEmail,
      full_name: null,
      id: userId
    });

    if (profileError) {
      if (isUniqueViolation(profileError)) {
        return null;
      }

      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }
  }

  const { data, error } = await db
    .from("password_auth_users")
    .insert({
      email: normalizedEmail,
      id: userId,
      password_hash: input.passwordHash
    })
    .select("id, email, password_hash, email_verified_at, created_at, updated_at, last_login_at")
    .single();

  if (error || !data) {
    if (!existingAppUser) {
      await db.from("users").delete().eq("id", userId);
    }

    if (isUniqueViolation(error)) {
      return null;
    }

    throw new Error(`Failed to create password user: ${error?.message ?? "Unknown error"}`);
  }

  if (existingAppUser) {
    const mergedProvider = mergeAuthProviders(existingAppUser.auth_provider, "password");
    const { error: updateProfileError } = await db
      .from("users")
      .update({
        auth_provider: mergedProvider
      })
      .eq("id", existingAppUser.id);

    if (updateProfileError) {
      throw new Error(`Failed to update user auth provider: ${updateProfileError.message}`);
    }
  }

  return data as PasswordAuthUserRecord;
}

export async function markPasswordUserLogin(userId: string) {
  const db = createAdminClient();
  const { error } = await db
    .from("password_auth_users")
    .update({
      last_login_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to update password login timestamp: ${error.message}`);
  }
}

export async function updatePasswordAuthUserPassword(input: { passwordHash: string; userId: string }) {
  const db = createAdminClient();
  const { error } = await db
    .from("password_auth_users")
    .update({
      password_hash: input.passwordHash,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.userId);

  if (error) {
    throw new Error(`Failed to update password hash: ${error.message}`);
  }
}

export async function getAuthenticatedProfile(userId: string): Promise<AuthenticatedAppUser | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("users").select("id, email, full_name").eq("id", userId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load authenticated profile: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const profile = data as ProfileRow;
  return {
    authProvider: "password",
    email: profile.email,
    fullName: profile.full_name,
    id: profile.id
  };
}

export async function getPasswordAuthVerificationStatus(userId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("password_auth_users")
    .select("email, email_verified_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load password verification status: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    email: String(data.email),
    verifiedAt: (data.email_verified_at as string | null) ?? null
  };
}
