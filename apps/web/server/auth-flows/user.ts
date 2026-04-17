import { createDatabaseClient } from "@website-signal-risk-scanner/db";

type ProfileRow = {
  auth_provider?: string;
  email: string;
  full_name: string | null;
  id: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findAppUserByEmail(email: string) {
  const db = createDatabaseClient();
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
