import { getWritePool } from "@website-signal-risk-scanner/db";
import type { PoolClient } from "pg";

export const NANO_SIGNAL_NOTIFY_CHANNEL = "certscore_nano_signal_work";
export const NANO_SIGNAL_DURABLE_RECOVERY_SWEEP_MS = 2_000;
export const NANO_SIGNAL_BROAD_RECONCILIATION_SWEEP_MS = 5 * 60_000;
const LISTENER_RECONNECT_MAX_MS = 30_000;

export type NanoSignalWakeupPayload = {
  notBeforeEpochMs: number | null;
  scanId: string;
};

export function parseNanoSignalWakeupPayload(payload: string | undefined): NanoSignalWakeupPayload | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const scanId = typeof parsed.scanId === "string" ? parsed.scanId.trim() : "";
    if (!scanId) {
      return null;
    }

    const rawNotBefore = parsed.notBeforeEpochMs;
    const notBeforeEpochMs =
      typeof rawNotBefore === "number" && Number.isFinite(rawNotBefore)
        ? rawNotBefore
        : typeof rawNotBefore === "string" && rawNotBefore.trim() && Number.isFinite(Number(rawNotBefore))
          ? Number(rawNotBefore)
          : null;

    return { notBeforeEpochMs, scanId };
  } catch {
    return null;
  }
}

export class NanoSignalWakeupQueue {
  private readonly delayed = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Set<string>();
  private readonly waiters = new Set<() => void>();

  enqueue(payload: NanoSignalWakeupPayload, now = Date.now()) {
    const notBeforeEpochMs = payload.notBeforeEpochMs;
    if (notBeforeEpochMs !== null && notBeforeEpochMs > now) {
      if (this.pending.has(payload.scanId) || this.delayed.has(payload.scanId)) {
        return;
      }

      const timer = setTimeout(() => {
        this.delayed.delete(payload.scanId);
        this.enqueue({ notBeforeEpochMs: null, scanId: payload.scanId });
      }, Math.max(0, notBeforeEpochMs - now));
      timer.unref();
      this.delayed.set(payload.scanId, timer);
      return;
    }

    const delayedTimer = this.delayed.get(payload.scanId);
    if (delayedTimer) {
      clearTimeout(delayedTimer);
      this.delayed.delete(payload.scanId);
    }
    this.pending.add(payload.scanId);
    for (const resolve of this.waiters) {
      resolve();
    }
    this.waiters.clear();
  }

  take() {
    const scanId = this.pending.values().next().value as string | undefined;
    if (!scanId) {
      return null;
    }
    this.pending.delete(scanId);
    return scanId;
  }

  async wait(timeoutMs: number) {
    if (this.pending.size > 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.waiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref();
      this.waiters.add(finish);
    });
  }
}

export function startNanoSignalWakeupListener(input: {
  onWakeup(payload: NanoSignalWakeupPayload): void;
}) {
  let stopped = false;
  let activeClient: PoolClient | null = null;
  let forceReleasedClient: PoolClient | null = null;

  const run = async () => {
    let reconnectDelayMs = 1_000;

    while (!stopped) {
      let client: PoolClient | null = null;
      try {
        client = await getWritePool().connect();
        activeClient = client;

        const disconnected = new Promise<void>((resolve, reject) => {
          client?.once("end", resolve);
          client?.once("error", reject);
          client?.on("notification", (message: { channel: string; payload?: string }) => {
            if (message.channel === NANO_SIGNAL_NOTIFY_CHANNEL) {
              const payload = parseNanoSignalWakeupPayload(message.payload);
              if (payload) {
                input.onWakeup(payload);
              }
            }
          });
        });
        await client.query(`listen ${NANO_SIGNAL_NOTIFY_CHANNEL}`);
        reconnectDelayMs = 1_000;
        console.info("[validation-worker] nano signal wakeup listener connected", {
          channel: NANO_SIGNAL_NOTIFY_CHANNEL
        });
        await disconnected;
      } catch (error) {
        if (!stopped) {
          console.error("[validation-worker] nano signal wakeup listener disconnected", {
            error: error instanceof Error ? error.message : String(error),
            reconnectDelayMs
          });
        }
      } finally {
        if (client && forceReleasedClient !== client) {
          client.removeAllListeners("notification");
          client.removeAllListeners("error");
          client.removeAllListeners("end");
          client.release(true);
        }
        if (forceReleasedClient === client) {
          forceReleasedClient = null;
        }
        if (activeClient === client) {
          activeClient = null;
        }
      }

      if (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
        reconnectDelayMs = Math.min(LISTENER_RECONNECT_MAX_MS, reconnectDelayMs * 2);
      }
    }
  };

  void run();

  return () => {
    stopped = true;
    forceReleasedClient = activeClient;
    activeClient?.release(true);
    activeClient = null;
  };
}
