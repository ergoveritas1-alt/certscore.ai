import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { getDatabaseEnv } from "./env";

let writePool: Pool | null = null;
let readPool: Pool | null = null;

const DEFAULT_QUERY_LOG_THRESHOLD_MS = 250;

function getQueryLogThresholdMs() {
  const rawValue = process.env.DB_QUERY_LOG_THRESHOLD_MS?.trim();
  if (!rawValue) {
    return DEFAULT_QUERY_LOG_THRESHOLD_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUERY_LOG_THRESHOLD_MS;
}

function shouldLogQueries() {
  return process.env.DB_QUERY_LOG_ENABLED?.trim().toLowerCase() !== "false";
}

function summarizeQuery(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

function getSslConfig(mode: string | undefined): PoolConfig["ssl"] {
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

function createPool(connectionString: string) {
  const env = getDatabaseEnv();
  return new Pool({
    connectionString,
    max: 10,
    ssl: getSslConfig(env.DATABASE_SSL_MODE)
  });
}

export function getWritePool() {
  if (!writePool) {
    writePool = createPool(getDatabaseEnv().DATABASE_URL);
  }

  return writePool;
}

export function getReadPool() {
  if (!readPool) {
    const env = getDatabaseEnv();
    readPool = createPool(env.DATABASE_READ_URL ?? env.DATABASE_URL);
  }

  return readPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  options: { readOnly?: boolean } = {}
): Promise<QueryResult<T>> {
  const pool = options.readOnly ? getReadPool() : getWritePool();
  const startedAt = performance.now();

  try {
    const result = await pool.query<T>(text, values);
    const durationMs = Math.round(performance.now() - startedAt);
    if (shouldLogQueries() && durationMs >= getQueryLogThresholdMs()) {
      console.warn(
        JSON.stringify({
          durationMs,
          event: "db.slow_query",
          paramCount: values.length,
          readOnly: Boolean(options.readOnly),
          rowCount: result.rowCount,
          sql: summarizeQuery(text)
        })
      );
    }

    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (shouldLogQueries()) {
      console.warn(
        JSON.stringify({
          durationMs,
          error: error instanceof Error ? error.message : String(error),
          event: "db.query_error",
          paramCount: values.length,
          readOnly: Boolean(options.readOnly),
          sql: summarizeQuery(text)
        })
      );
    }

    throw error;
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  options: { readOnly?: boolean } = {}
) {
  const result = await query<T>(text, values, options);
  return result.rows[0] ?? null;
}

export async function closePools() {
  const pools = [writePool, readPool].filter((pool): pool is Pool => pool !== null);
  writePool = null;
  readPool = null;
  await Promise.all(pools.map((pool) => pool.end()));
}
