"use server";

import { createAdminClient, hasSupabaseAdminEnv, hasSupabasePublicEnv } from "@website-signal-risk-scanner/db";

export type SupabaseHealthStatus = {
  checks: {
    adminEnv: boolean;
    authSchema: boolean;
    database: boolean;
    publicEnv: boolean;
  };
  counts: {
    domains: number;
    organizations: number;
    scans: number;
  };
  error: string | null;
  ok: boolean;
  requiredTables: {
    missing: string[];
    present: string[];
  };
  timestamp: string;
};

const REQUIRED_AUTH_TABLES = [
  "password_auth_rate_limits",
  "password_auth_reset_tokens",
  "password_auth_sessions",
  "password_auth_users",
  "password_auth_verification_tokens"
] as const;

export async function getSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const publicEnv = hasSupabasePublicEnv();
  const adminEnv = hasSupabaseAdminEnv();
  const timestamp = new Date().toISOString();

  if (!publicEnv || !adminEnv) {
    return {
      ok: false,
      timestamp,
      error: "Missing required Supabase environment variables.",
      checks: {
        publicEnv,
        adminEnv,
        authSchema: false,
        database: false
      },
      counts: {
        organizations: 0,
        domains: 0,
        scans: 0
      },
      requiredTables: {
        missing: [...REQUIRED_AUTH_TABLES],
        present: []
      }
    };
  }

  try {
    const supabase = createAdminClient();
    const [
      { count: organizations, error: organizationsError },
      { count: domains, error: domainsError },
      { count: scans, error: scansError },
      ...authTableChecks
    ] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("domains").select("id", { count: "exact", head: true }),
        supabase.from("scans").select("id", { count: "exact", head: true })
          ,
        ...REQUIRED_AUTH_TABLES.map((tableName) => supabase.from(tableName).select("id", { count: "exact", head: true }))
      ]);

    const firstError =
      organizationsError ?? domainsError ?? scansError ?? authTableChecks.find((result) => result.error)?.error ?? null;

    if (firstError) {
      throw new Error(firstError.message);
    }

    const presentTables = REQUIRED_AUTH_TABLES.filter((_, index) => !authTableChecks[index]?.error);

    return {
      ok: true,
      timestamp,
      error: null,
      checks: {
        publicEnv: true,
        adminEnv: true,
        authSchema: true,
        database: true
      },
      counts: {
        organizations: organizations ?? 0,
        domains: domains ?? 0,
        scans: scans ?? 0
      },
      requiredTables: {
        missing: [],
        present: [...presentTables]
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Supabase connectivity error.";
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeCode =
      typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
        ? cause.code
        : null;
    const causeHostname =
      typeof cause === "object" && cause !== null && "hostname" in cause && typeof cause.hostname === "string"
        ? cause.hostname
        : null;
    const actionableError =
      causeCode === "ENOTFOUND" && causeHostname
        ? `Unable to resolve ${causeHostname}. Check NEXT_PUBLIC_SUPABASE_URL in the active environment.`
        : errorMessage;
    const missingTables = REQUIRED_AUTH_TABLES.filter((tableName) => errorMessage.includes(tableName));

    return {
      ok: false,
      timestamp,
      error: actionableError,
      checks: {
        publicEnv: true,
        adminEnv: true,
        authSchema: missingTables.length === 0,
        database: false
      },
      counts: {
        organizations: 0,
        domains: 0,
        scans: 0
      },
      requiredTables: {
        missing: missingTables,
        present: REQUIRED_AUTH_TABLES.filter((tableName) => !missingTables.includes(tableName))
      }
    };
  }
}
