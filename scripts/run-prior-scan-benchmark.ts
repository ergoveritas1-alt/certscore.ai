type QueuedScan = {
  domain: string;
  scanId: string;
  scanUrl: string | null;
};

type ScanStatusPayload = {
  domain?: string | null;
  reportReadiness?: {
    findingsReady?: boolean | null;
    mergedSignalsReady?: boolean | null;
    status?: string | null;
  };
  scan?: {
    completedAt?: string | null;
    createdAt?: string | null;
    errorMessage?: string | null;
    id?: string | null;
    pagesRequested?: number | null;
    pagesScanned?: number | null;
    startedAt?: string | null;
    status?: string | null;
  };
  snapshot?: {
    reportFindingCount?: number | null;
    totalSignals?: number | null;
  };
  workflow?: {
    latestFindingCount?: number | null;
    latestFindingStageAt?: string | null;
  };
};

type BenchmarkRow = {
  completedAt: string | null;
  createdAt: string | null;
  domain: string;
  errorMessage: string | null;
  findingsReady: boolean | null;
  latestFindingCount: number | null;
  latestFindingStageAt: string | null;
  pagesRequested: number | null;
  pagesScanned: number | null;
  queueToCompletedMs: number | null;
  queueToFindingsMs: number | null;
  queueToStartedMs: number | null;
  reportFindingCount: number | null;
  scanId: string;
  status: string | null;
  totalSignals: number | null;
};

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_DOMAINS = ["kbdlab.io"];
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

function getArgValue(flag: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseDomains() {
  const values = [
    ...process.argv
      .filter((arg) => arg.startsWith("--domain="))
      .map((arg) => arg.slice("--domain=".length)),
    ...(getArgValue("--domains")?.split(",") ?? []),
    ...process.argv.flatMap((arg, index) => (arg === "--domain" && process.argv[index + 1] ? [process.argv[index + 1]!] : []))
  ]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? [...new Set(values)] : DEFAULT_DOMAINS;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseIsoMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function diffMs(left: string | null | undefined, right: string | null | undefined) {
  const leftMs = parseIsoMs(left);
  const rightMs = parseIsoMs(right);
  return leftMs === null || rightMs === null ? null : Math.max(0, leftMs - rightMs);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function queueScan(input: { baseUrl: string; domain: string; dryRun: boolean; source: string }) {
  if (input.dryRun) {
    return {
      domain: input.domain,
      scanId: "dry-run",
      scanUrl: null
    } satisfies QueuedScan;
  }

  const body = await fetchJson(new URL("/api/full-scan", input.baseUrl), {
    body: JSON.stringify({ domain: input.domain }),
    headers: {
      "Content-Type": "application/json",
      "X-CertScore-Scan-Source": input.source
    },
    method: "POST"
  });
  const scanId = typeof body.scanId === "string" ? body.scanId : null;
  if (!scanId) {
    throw new Error(`Full-scan queue response did not include scanId for ${input.domain}.`);
  }

  return {
    domain: input.domain,
    scanId,
    scanUrl: typeof body.scanUrl === "string" ? body.scanUrl : null
  } satisfies QueuedScan;
}

async function loadScanStatus(input: { baseUrl: string; includeFindings: boolean; scanId: string }) {
  const url = new URL(`/api/scan-status/${input.scanId}`, input.baseUrl);
  if (input.includeFindings) {
    url.searchParams.set("includeFindings", "1");
  }
  return (await fetchJson(url)) as ScanStatusPayload;
}

async function waitForScan(input: {
  baseUrl: string;
  domain: string;
  pollMs: number;
  scanId: string;
  timeoutMs: number;
}) {
  const deadline = Date.now() + input.timeoutMs;
  let latest: ScanStatusPayload | null = null;

  while (Date.now() <= deadline) {
    latest = await loadScanStatus({
      baseUrl: input.baseUrl,
      includeFindings: true,
      scanId: input.scanId
    });
    const status = latest.scan?.status ?? null;
    if (status === "completed" || status === "failed") {
      return latest;
    }
    await sleep(input.pollMs);
  }

  throw new Error(`Timed out waiting for ${input.domain} scan ${input.scanId}. Latest status: ${latest?.scan?.status ?? "unknown"}.`);
}

function summarizeRow(input: { domain: string; scanId: string; status: ScanStatusPayload }): BenchmarkRow {
  const scan = input.status.scan ?? {};
  const createdAt = scan.createdAt ?? null;
  const startedAt = scan.startedAt ?? null;
  const completedAt = scan.completedAt ?? null;
  const latestFindingStageAt = input.status.workflow?.latestFindingStageAt ?? null;

  return {
    completedAt,
    createdAt,
    domain: input.domain,
    errorMessage: scan.errorMessage ?? null,
    findingsReady: input.status.reportReadiness?.findingsReady ?? null,
    latestFindingCount: input.status.workflow?.latestFindingCount ?? null,
    latestFindingStageAt,
    pagesRequested: scan.pagesRequested ?? null,
    pagesScanned: scan.pagesScanned ?? null,
    queueToCompletedMs: diffMs(completedAt, createdAt),
    queueToFindingsMs: diffMs(latestFindingStageAt, createdAt),
    queueToStartedMs: diffMs(startedAt, createdAt),
    reportFindingCount: input.status.snapshot?.reportFindingCount ?? null,
    scanId: input.scanId,
    status: scan.status ?? null,
    totalSignals: input.status.snapshot?.totalSignals ?? null
  };
}

async function main() {
  const baseUrl = (getArgValue("--base-url") ?? process.env.LIVE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const domains = parseDomains();
  const dryRun = hasFlag("--dry-run");
  const pollMs = parsePositiveInt(getArgValue("--poll-ms"), DEFAULT_POLL_MS);
  const timeoutMs = parsePositiveInt(getArgValue("--timeout-ms"), DEFAULT_TIMEOUT_MS);
  const source = getArgValue("--source") ?? "ops-prior-scan-benchmark";

  const queued: QueuedScan[] = [];
  for (const domain of domains) {
    queued.push(await queueScan({ baseUrl, domain, dryRun, source }));
  }

  if (dryRun) {
    console.log(JSON.stringify({ baseUrl, domains, dryRun, queued, status: "dry_run" }, null, 2));
    return;
  }

  const rows: BenchmarkRow[] = [];
  for (const scan of queued) {
    const status = await waitForScan({
      baseUrl,
      domain: scan.domain,
      pollMs,
      scanId: scan.scanId,
      timeoutMs
    });
    rows.push(summarizeRow({ domain: scan.domain, scanId: scan.scanId, status }));
  }

  console.log(JSON.stringify({
    auditInput: {
      notes: `prior-scan benchmark queued through ${source}`,
      scans: rows.map((row) => ({
        batch: source,
        domain: row.domain,
        scanId: row.scanId
      }))
    },
    baseUrl,
    generatedAt: new Date().toISOString(),
    queued,
    rows,
    status: rows.every((row) => row.status === "completed") ? "completed" : "incomplete"
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
