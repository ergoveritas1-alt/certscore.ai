import "server-only";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import { headers } from "next/headers";
import type { AuthenticatedAppUser } from "../auth-flows/types";
import { auth } from "./auth";

type BetterAuthAccountRow = {
  provider_id: string;
};

function normalizeProvider(providerId: string) {
  return providerId === "credential" ? "password" : providerId;
}

function normalizeProviderList(rows: BetterAuthAccountRow[]) {
  const providers = rows
    .map((row) => row.provider_id?.trim().toLowerCase())
    .map((value) => (value ? normalizeProvider(value) : value))
    .filter((value): value is string => Boolean(value));

  return providers.length > 0 ? Array.from(new Set(providers)).sort().join(",") : "better-auth";
}

export async function getBetterAuthSessionUser(): Promise<AuthenticatedAppUser | null> {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return null;
  }

  const db = createDatabaseClient();
  const { data, error } = await db
    .from("better_auth_accounts")
    .select("provider_id")
    .eq("user_id", session.user.id);

  if (error) {
    throw new Error(`Failed to load Better Auth providers: ${error.message}`);
  }

  return {
    authProvider: normalizeProviderList((data as BetterAuthAccountRow[] | null) ?? []),
    email: session.user.email,
    fullName: session.user.name ?? null,
    id: session.user.id
  };
}
