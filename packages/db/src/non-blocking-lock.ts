import { getWritePool } from "./postgres";

type LockClient = {
  query(text: string, values: unknown[]): Promise<{ rows: Array<{ locked?: boolean }> }>;
  release(error?: Error): void;
};

// The write pool has ten connections. Reserve at most two for long operations
// so their evidence reads/writes cannot deadlock behind their own lock holders.
const MAX_ACTIVE_LOCK_CONNECTIONS = 2;
let activeLockConnections = 0;

/** A session-scoped lock shared by processes, with no queue or polling wait. */
export async function withNonBlockingDatabaseLock<T>(
  key: string,
  operation: () => Promise<T>,
  connect: () => Promise<LockClient> = () => getWritePool().connect(),
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  if (activeLockConnections >= MAX_ACTIVE_LOCK_CONNECTIONS) return { acquired: false };
  activeLockConnections += 1;
  let client: LockClient;
  try {
    client = await connect();
  } catch (error) {
    activeLockConnections -= 1;
    throw error;
  }
  let acquired = false;
  let releaseError: Error | undefined;
  try {
    const result = await client.query(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as locked", [key],
    );
    acquired = result.rows[0]?.locked === true;
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await operation() };
  } finally {
    if (acquired) {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [key]);
      } catch (error) {
        // Never return a possibly locked session to the pool.
        releaseError = error instanceof Error ? error : new Error(String(error));
      }
    }
    try {
      client.release(releaseError);
    } finally {
      activeLockConnections -= 1;
    }
  }
}
