import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CohortRole = "fully_recovered" | "limited_partial" | "contract_fix" | "regression_retry";

type Target = {
  domain: string;
  role: CohortRole;
};

type ScanRecord = {
  completedAt?: string | null;
  coverageStatus?: string | null;
  domain: string;
  error?: string | null;
  httpStatus?: number;
  jobId?: string | null;
  requestedAt: string;
  responseStatus?: string | null;
  resultUrl?: string | null;
  limitedCoverage?: boolean | null;
  noGoReason?: string | null;
  resultDisposition?: string | null;
  riskLevel?: string | null;
  scanStatus?: string | null;
  score?: number | null;
  scanId?: string | null;
  status?: string | null;
  statusUrl?: string | null;
};

const FULLY_RECOVERED = [
  "singaporepools.com.sg",
  "smule.com",
  "telangana.gov.in",
  "cricketworld.com",
  "hexun.com",
  "ip138.com",
  "adjust.io",
  "xbanxia.cc",
  "jatimprov.go.id",
  "cubecraft.net",
  "freightpass.ca",
  "betmgm.com",
  "pmkisan.gov.in",
  "bsclink.cn",
  "pucp.edu.pe",
  "uncg.edu",
  "wampserver.com",
  "ranking-deli.jp",
  "182682.xyz",
  "dnsv5.com",
  "sexkomix2.com",
] as const;

const LIMITED_PARTIAL = [
  "mt98.ir",
  "uhaul.com",
  "ddnavi.com",
  "freemeteo.com",
  "slickdeals.net",
  "lookmovie2.to",
  "newspapers.com",
  "fontanka.ru",
  "adrtun.ru",
  "moe.gov.jo",
  "dns.id",
  "parktons.com",
] as const;

const TARGETS: Target[] = [
  ...FULLY_RECOVERED.map((domain) => ({ domain, role: "fully_recovered" as const })),
  ...LIMITED_PARTIAL.map((domain) => ({ domain, role: "limited_partial" as const })),
  { domain: "pitc.com.pk", role: "contract_fix" },
];

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_OUTPUT = "artifacts/limited-recovery-production-20260715/requeue.json";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CREATE_RETRIES = 2;
const MAX_POLL_SECONDS = 20 * 60;
const POLL_INTERVAL_MS = 10_000;
const POLL_CONCURRENCY = 4;

function parseArgs(argv: string[]) {
  let baseUrl = DEFAULT_BASE_URL;
  let output = DEFAULT_OUTPUT;
  let execute = false;
  let resume = false;
  let targetDomains: string[] | null = null;
  let scanFrom = "eu_ie";
  for (const arg of argv) {
    if (arg === "--execute") {
      execute = true;
    } else if (arg === "--resume") {
      resume = true;
    } else if (arg.startsWith("--targets=")) {
      targetDomains = arg.slice("--targets=".length).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    } else if (arg.startsWith("--scan-from=")) {
      scanFrom = arg.slice("--scan-from=".length).trim();
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).replace(/\/$/, "");
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { baseUrl, execute, output, resume, scanFrom, targetDomains };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "CertScore-limited-recovery-requeue/1.0",
      "x-certscore-client": "pulse",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { rawResponse: text.slice(0, 500) };
  }
  return { body, response };
}

function retryAfterMs(response: Response, body: Record<string, unknown>) {
  const headerSeconds = Number(response.headers.get("retry-after") ?? "0");
  const bodySeconds = Number(body.retryAfterSeconds ?? 0);
  const seconds = Math.max(headerSeconds, bodySeconds, 5);
  return Math.min(seconds * 1_000, 60_000);
}

function scanIdFrom(body: Record<string, unknown>) {
  const scan = typeof body.scan === "object" && body.scan !== null ? body.scan as Record<string, unknown> : null;
  return typeof body.scanId === "string" ? body.scanId : typeof scan?.scanId === "string" ? scan.scanId : null;
}

function jobIdFrom(body: Record<string, unknown>) {
  return typeof body.jobId === "string" ? body.jobId : null;
}

function statusUrlFrom(baseUrl: string, body: Record<string, unknown>) {
  return typeof body.statusUrl === "string"
    ? body.statusUrl
    : typeof body.nextCheckUrl === "string"
      ? new URL(body.nextCheckUrl, baseUrl).toString()
      : null;
}

function resultUrlFrom(baseUrl: string, body: Record<string, unknown>) {
  return typeof body.resultUrl === "string" ? new URL(body.resultUrl, baseUrl).toString() : null;
}

async function queueTarget(baseUrl: string, target: Target, scanFrom: string): Promise<ScanRecord> {
  const requestedAt = new Date().toISOString();
  const url = new URL("/api/v1/pulse", baseUrl);
  url.searchParams.set("url", `https://${target.domain}/`);
  url.searchParams.set("forceNewScan", "true");
  url.searchParams.set("wait", "0");
  url.searchParams.set("detail", "summary");
  url.searchParams.set("scanFrom", scanFrom);

  for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt += 1) {
    try {
      const { body, response } = await fetchJson(url.toString());
      const status = typeof body.status === "string" ? body.status : null;
      const record: ScanRecord = {
        domain: target.domain,
        httpStatus: response.status,
        jobId: jobIdFrom(body),
        requestedAt,
        responseStatus: status,
        resultUrl: resultUrlFrom(baseUrl, body),
        scanId: scanIdFrom(body),
        status,
        statusUrl: statusUrlFrom(baseUrl, body),
      };
      if (response.ok || response.status === 202) {
        return record;
      }
      if (response.status === 429 && attempt < MAX_CREATE_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, body)));
        continue;
      }
      return { ...record, error: JSON.stringify(body).slice(0, 1_000) };
    } catch (error) {
      if (attempt >= MAX_CREATE_RETRIES) {
        return {
          domain: target.domain,
          error: error instanceof Error ? error.message : String(error),
          requestedAt,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(`Unreachable queue state for ${target.domain}`);
}

async function enrichResult(record: ScanRecord) {
  if (!record.resultUrl) return record;
  try {
    const result = await fetchJson(record.resultUrl);
    const summary = typeof result.body.summary === "object" && result.body.summary !== null
      ? result.body.summary as Record<string, unknown>
      : null;
    const machineSummary = typeof summary?.machineSummary === "object" && summary.machineSummary !== null
      ? summary.machineSummary as Record<string, unknown>
      : null;
    const coverage = typeof result.body.coverage === "object" && result.body.coverage !== null
      ? result.body.coverage as Record<string, unknown>
      : null;
    const noGo = typeof result.body.noGo === "object" && result.body.noGo !== null
      ? result.body.noGo as Record<string, unknown>
      : null;
    return {
      ...record,
      coverageStatus: typeof coverage?.status === "string" ? coverage.status : record.coverageStatus,
      limitedCoverage: typeof machineSummary?.limitedCoverage === "boolean" ? machineSummary.limitedCoverage : record.limitedCoverage,
      noGoReason: typeof noGo?.reasonCode === "string" ? noGo.reasonCode : record.noGoReason,
      resultDisposition: typeof result.body.resultDisposition === "string" ? result.body.resultDisposition : record.resultDisposition,
      riskLevel: typeof summary?.riskLevel === "string" ? summary.riskLevel : record.riskLevel,
      scanStatus: typeof result.body.scanStatus === "string" ? result.body.scanStatus : record.scanStatus,
      score: typeof summary?.score === "number" ? summary.score : record.score,
    };
  } catch (error) {
    return { ...record, error: error instanceof Error ? error.message : String(error) };
  }
}

async function pollTarget(record: ScanRecord) {
  if (!record.statusUrl || !record.jobId) return record;
  if (["completed", "completed_limited", "failed", "error"].includes(record.status ?? "") && record.resultUrl) {
    return enrichResult(record);
  }
  const deadline = Date.now() + MAX_POLL_SECONDS * 1_000;
  let current = record;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const { body, response } = await fetchJson(record.statusUrl);
      const scan = typeof body.scan === "object" && body.scan !== null ? body.scan as Record<string, unknown> : null;
      const status = typeof body.status === "string" ? body.status : typeof scan?.status === "string" ? scan.status : null;
      current = {
        ...current,
        completedAt: typeof body.completedAt === "string" ? body.completedAt : current.completedAt,
        coverageStatus: typeof body.coverageStatus === "string" ? body.coverageStatus : current.coverageStatus,
        httpStatus: response.status,
        resultUrl: resultUrlFrom(record.statusUrl, body) ?? current.resultUrl,
        scanId: scanIdFrom(body) ?? current.scanId,
        status,
      };
      if (status === "completed" || status === "completed_limited" || status === "failed" || status === "error") {
        return enrichResult(current);
      }
    } catch (error) {
      current = { ...current, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { ...current, error: current.error ?? `Polling exceeded ${MAX_POLL_SECONDS} seconds.` };
}

async function writeOutput(outputPath: string, payload: unknown) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets: Target[] = args.targetDomains
    ? args.targetDomains.map((domain) => ({ domain, role: "regression_retry" as const }))
    : TARGETS;
  const manifest = {
    cohort: args.targetDomains ? "limited-recovery-regression-retry-20260715" : "limited-recovery-production-20260715",
    targetCount: targets.length,
    targets,
    scanFrom: args.scanFrom,
  };
  if (!args.execute) {
    console.log(JSON.stringify({ ...manifest, mode: "dry_run", executeHint: "Pass --execute to queue fresh production scans." }, null, 2));
    return;
  }

  const outputPath = path.resolve(args.output);
  let records: ScanRecord[] = [];
  if (args.resume) {
    const saved = JSON.parse(await readFile(outputPath, "utf8")) as { records?: ScanRecord[] };
    records = Array.isArray(saved.records) ? saved.records : [];
    if (records.length !== targets.length) {
      throw new Error(`Resume manifest has ${records.length} records; expected ${targets.length}.`);
    }
  } else {
    await writeOutput(outputPath, { ...manifest, baseUrl: args.baseUrl, phase: "queueing", records });
    for (const target of targets) {
      const record = await queueTarget(args.baseUrl, target, args.scanFrom);
      records.push(record);
      console.log(`${target.domain}: ${record.httpStatus ?? "error"} ${record.status ?? record.error ?? "unknown"} ${record.scanId ?? record.jobId ?? ""}`);
      await writeOutput(outputPath, { ...manifest, baseUrl: args.baseUrl, phase: "queueing", records });
    }
  }

  const pending = records.filter((record) => record.statusUrl && record.jobId);
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const record = pending[cursor];
      cursor += 1;
      const completed = await pollTarget(record);
      const index = records.indexOf(record);
      if (index >= 0) records[index] = completed;
      console.log(`${completed.domain}: ${completed.status ?? completed.error ?? "unknown"} ${completed.scanId ?? ""}`);
      await writeOutput(outputPath, { ...manifest, baseUrl: args.baseUrl, phase: "polling", records });
    }
  }
  await Promise.all(Array.from({ length: Math.min(POLL_CONCURRENCY, pending.length) }, () => worker()));
  await writeOutput(outputPath, { ...manifest, baseUrl: args.baseUrl, phase: "complete", records });
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
