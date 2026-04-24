import { queryOne } from "../packages/db/src/postgres";

const DEFAULT_LIVE_BASE_URL = "https://certscore.ai";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 5_000;

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function redactDatabaseUrl(value: string | null) {
  if (!value) {
    return null;
  }

  return value.replace(/:[^:@/]+@/, ":***@");
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  return JSON.parse(body) as Record<string, unknown>;
}

async function findScan(scanId: string) {
  return queryOne<{ id: string; status: string }>(
    `
      select id, status
      from scans
      where id = $1
    `,
    [scanId],
    { readOnly: true }
  );
}

async function waitForScanVisibility(scanId: string, timeoutMs: number, pollMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const row = await findScan(scanId);
    if (row) {
      return row;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return null;
}

async function main() {
  const liveBaseUrl = (getEnv("LIVE_BASE_URL") ?? DEFAULT_LIVE_BASE_URL).replace(/\/+$/, "");
  const expectedRuntimeTarget = getEnv("EXPECTED_LIVE_RUNTIME_TARGET") ?? "ecs-fargate";
  const expectedGitSha = getEnv("EXPECTED_GIT_SHA");
  const probeDomain = getEnv("LIVE_DB_PROBE_DOMAIN");
  const recentScanId = getEnv("LIVE_DB_SCAN_ID") ?? getEnv("RECENT_SCAN_ID");
  const timeoutMs = Number(getEnv("LIVE_DB_PROBE_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS);
  const pollMs = Number(getEnv("LIVE_DB_PROBE_POLL_MS") ?? DEFAULT_POLL_MS);
  const databaseUrl = getEnv("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL to the database you expect to back the live host.");
  }

  const version = await fetchJson(`${liveBaseUrl}/api/version`);
  if (version.runtimeTarget !== expectedRuntimeTarget) {
    throw new Error(`Live runtime target is ${String(version.runtimeTarget)}, expected ${expectedRuntimeTarget}.`);
  }
  if (expectedGitSha && version.gitSha !== expectedGitSha) {
    throw new Error(`Live gitSha is ${String(version.gitSha)}, expected ${expectedGitSha}.`);
  }

  const checks: Record<string, unknown> = {
    databaseUrl: redactDatabaseUrl(databaseUrl),
    liveBaseUrl,
    liveGitSha: version.gitSha ?? null,
    liveRuntimeTarget: version.runtimeTarget ?? null
  };

  if (recentScanId) {
    const row = await findScan(recentScanId);
    if (!row) {
      throw new Error(`DATABASE_URL cannot see live scan ${recentScanId}. Check that local env points at the live writer/read replica.`);
    }
    checks.recentScan = row;
  }

  if (probeDomain) {
    const response = await fetchJson(`${liveBaseUrl}/api/full-scan`, {
      body: JSON.stringify({ domain: probeDomain }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const scanId = typeof response.scanId === "string" ? response.scanId : null;
    if (!scanId) {
      throw new Error(`Live full-scan probe did not return scanId: ${JSON.stringify(response)}`);
    }

    const row = await waitForScanVisibility(scanId, timeoutMs, pollMs);
    if (!row) {
      throw new Error(
        `Live host queued scan ${scanId}, but DATABASE_URL did not see it within ${Math.round(timeoutMs / 1000)}s.`
      );
    }
    checks.probeScan = row;
  }

  console.log(JSON.stringify({ checks, status: "ok" }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
