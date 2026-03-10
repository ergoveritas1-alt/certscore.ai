"use server";

import { hasSupabaseAdminEnv, hasSupabasePublicEnv } from "@website-signal-risk-scanner/db";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";

export type SupabaseHealthStatus = {
  checks: {
    adminEnv: boolean;
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
  timestamp: string;
};

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
        database: false
      },
      counts: {
        organizations: 0,
        domains: 0,
        scans: 0
      }
    };
  }

  try {
    const supabase = createAdminSupabaseClient();
    const [{ count: organizations, error: organizationsError }, { count: domains, error: domainsError }, { count: scans, error: scansError }] =
      await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("domains").select("id", { count: "exact", head: true }),
        supabase.from("scans").select("id", { count: "exact", head: true })
      ]);

    const firstError = organizationsError ?? domainsError ?? scansError;

    if (firstError) {
      throw new Error(firstError.message);
    }

    return {
      ok: true,
      timestamp,
      error: null,
      checks: {
        publicEnv: true,
        adminEnv: true,
        database: true
      },
      counts: {
        organizations: organizations ?? 0,
        domains: domains ?? 0,
        scans: scans ?? 0
      }
    };
  } catch (error) {
    return {
      ok: false,
      timestamp,
      error: error instanceof Error ? error.message : "Unknown Supabase connectivity error.",
      checks: {
        publicEnv: true,
        adminEnv: true,
        database: false
      },
      counts: {
        organizations: 0,
        domains: 0,
        scans: 0
      }
    };
  }
}
