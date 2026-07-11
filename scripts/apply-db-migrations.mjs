import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pg = require("pg");
const { Client } = pg;

const MIGRATIONS_DIR = path.resolve(process.cwd(), "packages/db/migrations");
const MIGRATIONS_TABLE = "schema_migrations";

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function getSslConfig(mode) {
  switch (mode) {
    case "disable":
      return false;
    case "prefer":
      return undefined;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return undefined;
  }
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists public.${MIGRATIONS_TABLE} (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`select name, checksum from public.${MIGRATIONS_TABLE}`);
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

async function getMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function requiresNonTransactionalMigration(sql) {
  return /\bcreate\s+index\s+concurrently(?:\s+if\s+not\s+exists)?\b/i.test(sql);
}

async function recordAppliedMigration(client, migrationName, checksum) {
  await client.query(
    `
      insert into public.${MIGRATIONS_TABLE} (name, checksum)
      values ($1, $2)
      on conflict (name) do update
      set checksum = excluded.checksum,
          applied_at = now()
    `,
    [migrationName, checksum]
  );
}

async function applyMigration(client, migrationName, sql, checksum) {
  if (requiresNonTransactionalMigration(sql)) {
    try {
      const statements = sql
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await client.query(statement);
      }
      await recordAppliedMigration(client, migrationName, checksum);
    } catch (error) {
      throw new Error(`Failed applying ${migrationName}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }

  await client.query("begin");

  try {
    await client.query(sql);
    await recordAppliedMigration(client, migrationName, checksum);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw new Error(`Failed applying ${migrationName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const connectionString = getRequiredEnv("DATABASE_URL");
  const sslMode = process.env.DATABASE_SSL_MODE?.trim();
  const client = new Client({
    connectionString,
    ssl: getSslConfig(sslMode)
  });

  await client.connect();

  try {
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const files = await getMigrationFiles();
    const latestMigration = files.at(-1) ?? null;
    const expectedLatestMigration = process.env.EXPECTED_LATEST_MIGRATION?.trim() || null;
    if (expectedLatestMigration && latestMigration !== expectedLatestMigration) {
      throw new Error(
        `Target image migration mismatch: expected newest migration ${expectedLatestMigration}, found ${latestMigration ?? "none"}.`
      );
    }
    let appliedCount = 0;
    const appliedMigrations = [];

    for (const migrationName of files) {
      const fullPath = path.join(MIGRATIONS_DIR, migrationName);
      const sql = await readFile(fullPath, "utf8");
      const checksum = sha256(sql);
      const existingChecksum = applied.get(migrationName);

      if (existingChecksum === checksum) {
        console.info(`SKIP ${migrationName}`);
        continue;
      }

      if (existingChecksum && existingChecksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migrationName}. Existing checksum ${existingChecksum} does not match ${checksum}.`
        );
      }

      await applyMigration(client, migrationName, sql, checksum);
      console.info(`APPLY ${migrationName} ${checksum}`);
      appliedCount += 1;
      appliedMigrations.push(migrationName);
    }

    console.info(
      JSON.stringify(
        {
          appliedCount,
          appliedMigrations,
          imageTag: process.env.BUILD_IMAGE_TAG?.trim() || process.env.DEPLOY_TARGET_GIT_SHA?.trim() || null,
          latestMigration,
          migrationsDir: MIGRATIONS_DIR,
          status: "ok",
          targetGitSha: process.env.DEPLOY_TARGET_GIT_SHA?.trim() || null,
          totalMigrations: files.length
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
