"use server";

import { hasDatabaseEnv, queryOne } from "@website-signal-risk-scanner/db";
import { BETTER_AUTH_REQUIRED_TABLES } from "../better-auth/constants";

export type DatabaseHealthStatus = {
  checks: {
    authSchema: boolean;
    database: boolean;
    env: boolean;
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

const REQUIRED_AUTH_TABLES = BETTER_AUTH_REQUIRED_TABLES;

export async function getDatabaseHealth(): Promise<DatabaseHealthStatus> {
  const databaseEnv = hasDatabaseEnv();
  const timestamp = new Date().toISOString();

  if (!databaseEnv) {
    return {
      ok: false,
      timestamp,
      error: "Missing required database environment variables.",
      checks: {
        env: false,
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
    const [organizationCount, domainCount, scanCount, ...tableChecks] = await Promise.all([
      queryOne<{ count: string }>("select count(*)::text as count from public.organizations", [], { readOnly: true }),
      queryOne<{ count: string }>("select count(*)::text as count from public.domains", [], { readOnly: true }),
      queryOne<{ count: string }>("select count(*)::text as count from public.scans", [], { readOnly: true }),
      ...REQUIRED_AUTH_TABLES.map((tableName) =>
        queryOne<{ exists: boolean }>(
          `
            select exists (
              select 1
              from information_schema.tables
              where table_schema = 'public'
                and table_name = $1
            ) as exists
          `,
          [tableName],
          { readOnly: true }
        )
      )
    ]);

    const presentTables = REQUIRED_AUTH_TABLES.filter((_, index) => tableChecks[index]?.exists === true);
    const missingTables = REQUIRED_AUTH_TABLES.filter((_, index) => tableChecks[index]?.exists !== true);

    return {
      ok: true,
      timestamp,
      error: null,
      checks: {
        env: true,
        authSchema: missingTables.length === 0,
        database: true
      },
      counts: {
        organizations: Number(organizationCount?.count ?? 0),
        domains: Number(domainCount?.count ?? 0),
        scans: Number(scanCount?.count ?? 0)
      },
      requiredTables: {
        missing: missingTables,
        present: [...presentTables]
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown database runtime error.";

    return {
      ok: false,
      timestamp,
      error: errorMessage,
      checks: {
        env: true,
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
}
