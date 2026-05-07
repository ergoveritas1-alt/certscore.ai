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
    const requiredAuthTableValuesSql = REQUIRED_AUTH_TABLES.map((_, index) => `($${index + 1})`).join(", ");
    const health = await queryOne<{
      domains_count: string;
      organizations_count: string;
      present_auth_tables: string[] | null;
      scans_count: string;
    }>(
      `
        with required_auth_tables(table_name) as (
          values ${requiredAuthTableValuesSql}
        )
        select
          (select count(*)::text from public.organizations) as organizations_count,
          (select count(*)::text from public.domains) as domains_count,
          (select count(*)::text from public.scans) as scans_count,
          coalesce(
            (
              select array_agg(required_auth_tables.table_name order by required_auth_tables.table_name)
              from required_auth_tables
              where exists (
                select 1
                from information_schema.tables
                where table_schema = 'public'
                  and table_name = required_auth_tables.table_name
              )
            ),
            array[]::text[]
          ) as present_auth_tables
      `,
      [...REQUIRED_AUTH_TABLES],
      { readOnly: true }
    );

    const presentTableSet = new Set(health?.present_auth_tables ?? []);
    const presentTables = REQUIRED_AUTH_TABLES.filter((tableName) => presentTableSet.has(tableName));
    const missingTables = REQUIRED_AUTH_TABLES.filter((tableName) => !presentTableSet.has(tableName));

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
        organizations: Number(health?.organizations_count ?? 0),
        domains: Number(health?.domains_count ?? 0),
        scans: Number(health?.scans_count ?? 0)
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
