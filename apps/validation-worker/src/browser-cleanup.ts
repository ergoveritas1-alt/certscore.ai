import { readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const PROFILE_PREFIXES = [
  "ws01-hybrid-cdp-worker-",
  "runtime-harness-cdp-worker-",
  "playwright_chromiumdev_profile-"
] as const;

const DEFAULT_STALE_AGE_MS = 20 * 60 * 1000;

type CleanupLogger = Pick<Console, "info" | "warn" | "error">;

type BrowserProcessRecord = {
  command: string;
  elapsedSec: number;
  pid: number;
  profileDir: string | null;
};

export type BrowserCleanupSummary = {
  removedProfileDirs: string[];
  scannedProfileDirs: number;
  stalePids: number[];
};

function extractProfileDir(command: string) {
  const explicitUserDataDirMatch = command.match(/--user-data-dir=([^\s]+)/);
  if (explicitUserDataDirMatch?.[1]) {
    return explicitUserDataDirMatch[1];
  }

  const inferredProfileMatch = command.match(
    /((?:\/[^\s]+\/)?(?:ws01-hybrid-cdp-worker-[^/\s]+|runtime-harness-cdp-worker-[^/\s]+|playwright_chromiumdev_profile-[^/\s]+))/
  );
  return inferredProfileMatch?.[1] ?? null;
}

function parseElapsedSeconds(value: string) {
  const trimmed = value.trim();
  const daySplit = trimmed.split("-");
  const dayCount = daySplit.length === 2 ? Number(daySplit[0]) : 0;
  const timePart = (daySplit.length === 2 ? daySplit[1] : daySplit[0]) ?? "";
  const pieces = timePart.split(":").map((piece) => Number(piece));
  if (pieces.some((piece) => !Number.isFinite(piece))) {
    return null;
  }

  let seconds = dayCount * 24 * 60 * 60;
  if (pieces.length === 3) {
    seconds += pieces[0]! * 60 * 60 + pieces[1]! * 60 + pieces[2]!;
    return seconds;
  }
  if (pieces.length === 2) {
    seconds += pieces[0]! * 60 + pieces[1]!;
    return seconds;
  }
  return null;
}

export function parseBrowserProcessTable(output: string): BrowserProcessRecord[] {
  const rows = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+([0-9:-]+)\s+(.*)$/);
      if (!match) {
        return null;
      }

      const pid = Number(match[1]);
      const elapsedSec = parseElapsedSeconds(match[2] ?? "");
      const command = match[3] ?? "";
      if (!Number.isFinite(pid) || !Number.isFinite(elapsedSec) || command.length === 0) {
        return null;
      }

      const profileDir = extractProfileDir(command);
      if (!profileDir) {
        return null;
      }

      return {
        command,
        elapsedSec,
        pid,
        profileDir
      } as BrowserProcessRecord;
    });

  return rows.filter((record): record is BrowserProcessRecord => record !== null);
}

async function readManagedProfileDirs(tmpRoot: string) {
  const entries = await readdir(tmpRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && PROFILE_PREFIXES.some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => path.join(tmpRoot, entry.name));
}

async function isDirectoryStale(profileDir: string, staleAgeMs: number, nowMs: number) {
  const details = await stat(profileDir).catch(() => null);
  if (!details) {
    return false;
  }
  return nowMs - details.mtimeMs >= staleAgeMs;
}

async function killPid(pid: number) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return;
    }
    throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, 250));

  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return;
    }
    throw error;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

export async function reapStaleBrowserArtifacts(input?: {
  logger?: CleanupLogger;
  staleAgeMs?: number;
  tmpRoot?: string;
}) {
  const logger = input?.logger ?? console;
  const staleAgeMs = input?.staleAgeMs ?? DEFAULT_STALE_AGE_MS;
  const tmpRoot = input?.tmpRoot ?? os.tmpdir();
  const nowMs = Date.now();

  const [{ stdout }, profileDirs] = await Promise.all([
    execFile("ps", ["-axo", "pid=,etime=,command="]),
    readManagedProfileDirs(tmpRoot)
  ]);

  const processRows = parseBrowserProcessTable(stdout);
  const staleProcesses = processRows.filter((row) => row.elapsedSec * 1000 >= staleAgeMs);
  const staleProfileDirs = (
    await Promise.all(
      profileDirs.map(async (profileDir) => ((await isDirectoryStale(profileDir, staleAgeMs, nowMs)) ? profileDir : null))
    )
  ).filter((value): value is string => typeof value === "string");

  const staleProfileDirSet = new Set([
    ...staleProfileDirs,
    ...staleProcesses.map((row) => row.profileDir).filter((value): value is string => typeof value === "string")
  ]);

  const stalePids = Array.from(
    new Set(
      processRows
        .filter((row) => row.profileDir && staleProfileDirSet.has(row.profileDir))
        .map((row) => row.pid)
    )
  );

  for (const pid of stalePids) {
    try {
      await killPid(pid);
    } catch (error) {
      logger.warn("[validation-worker] stale browser kill failed", {
        error: error instanceof Error ? error.message : String(error),
        pid
      });
    }
  }

  const removedProfileDirs: string[] = [];
  for (const profileDir of staleProfileDirSet) {
    await rm(profileDir, { force: true, recursive: true }).catch((error) => {
      logger.warn("[validation-worker] stale browser profile cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
        profileDir
      });
    });
    removedProfileDirs.push(profileDir);
  }

  return {
    removedProfileDirs,
    scannedProfileDirs: profileDirs.length,
    stalePids
  } satisfies BrowserCleanupSummary;
}

export function createBrowserCleanupScheduler(input?: {
  intervalMs?: number;
  logger?: CleanupLogger;
  staleAgeMs?: number;
  tmpRoot?: string;
}) {
  const logger = input?.logger ?? console;
  const intervalMs = input?.intervalMs ?? 5 * 60 * 1000;
  let inFlight: Promise<BrowserCleanupSummary> | null = null;
  let lastStartedAt = 0;

  const run = async (reason: string, force = false) => {
    if (inFlight) {
      return inFlight;
    }
    const now = Date.now();
    if (!force && now - lastStartedAt < intervalMs) {
      return null;
    }

    lastStartedAt = now;
    inFlight = reapStaleBrowserArtifacts({
      logger,
      staleAgeMs: input?.staleAgeMs,
      tmpRoot: input?.tmpRoot
    })
      .then((summary) => {
        if (summary.stalePids.length > 0 || summary.removedProfileDirs.length > 0) {
          logger.info("[validation-worker] stale browser cleanup completed", {
            reason,
            removedProfileDirCount: summary.removedProfileDirs.length,
            scannedProfileDirs: summary.scannedProfileDirs,
            stalePidCount: summary.stalePids.length
          });
        }
        return summary;
      })
      .catch((error) => {
        logger.warn("[validation-worker] stale browser cleanup failed", {
          error: error instanceof Error ? error.message : String(error),
          reason
        });
        return {
          removedProfileDirs: [],
          scannedProfileDirs: 0,
          stalePids: []
        } satisfies BrowserCleanupSummary;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };

  return {
    runNow(reason: string) {
      return run(reason, true);
    },
    schedule(reason: string) {
      return run(reason, false);
    }
  };
}
