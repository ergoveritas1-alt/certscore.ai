import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { getDatabaseEnv } from "./env";

let writePool: Pool | null = null;
let readPool: Pool | null = null;

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
  return pool.query<T>(text, values);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  options: { readOnly?: boolean } = {}
) {
  const result = await query<T>(text, values, options);
  return result.rows[0] ?? null;
}
