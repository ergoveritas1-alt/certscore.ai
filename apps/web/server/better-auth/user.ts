import "server-only";

import { createAdminClient } from "@website-signal-risk-scanner/db";

type BetterAuthUserRow = {
  email: string;
  email_verified: boolean;
};

type BetterAuthAccountRow = {
  id: string;
};

export async function getBetterAuthVerificationStatus(userId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("better_auth_users")
    .select("email, email_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Better Auth verification status: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    email: String((data as BetterAuthUserRow).email),
    isVerified: Boolean((data as BetterAuthUserRow).email_verified),
    verifiedAt: null
  };
}

export async function hasBetterAuthPasswordAccount(email: string) {
  const db = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  const { data: userRow, error: userError } = await db
    .from("better_auth_users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (userError) {
    throw new Error(`Failed to load Better Auth user: ${userError.message}`);
  }

  if (!userRow?.id) {
    return false;
  }

  const { data: accountRow, error: accountError } = await db
    .from("better_auth_accounts")
    .select("id")
    .eq("user_id", String(userRow.id))
    .eq("provider_id", "credential")
    .maybeSingle();

  if (accountError) {
    throw new Error(`Failed to load Better Auth password account: ${accountError.message}`);
  }

  return Boolean((accountRow as BetterAuthAccountRow | null)?.id);
}
