import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ScanCalibrationSummary } from "../lib/scans/calibration-summary";
import { getLastScannerServiceHeartbeat, getFullScanQueueAvailabilityFromHeartbeat } from "../server/queue/full-scan-queue";

const DEFAULT_DOMAINS = ["shopify.com", "nih.gov", "mit.edu", "booking.com", "paypal.com"];
const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_PROD_BASE_URL = "https://certscore.ai";
const DEFAULT_TIMEOUT_MS = 8 * 60_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration");

type LocalBatchRow = {
  blocked?: boolean | null;
  calibrationSummary?: ScanCalibrationSummary | null;
  domain: string;
  homepageStatus?: number | null;
  scanId: string | null;
  scanOutcome?: string | null;
  stopReason?: string | null;
};

type PublicScanQueueResponse = {
  scanId: string | null;
  scanUrl: string | null;
};

type ComparisonBucket =
  | "aligned"
  | "same_site_alias"
  | "off_origin_landing"
  | "browser_error_surface"
  | "thin_or_blocked_scan"
  | "true_detection_gap";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDomains() {
  const explicit = getArgValue("--domains");
  if (!explicit) {
    return DEFAULT_DOMAINS;
  }

  return explicit
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseCalibrationSummaryFromHtml(html: string) {
  const match = html.match(/<script[^>]*data-testid="scan-calibration-summary"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return null;
  }

  return JSON.parse(match[1]) as ScanCalibrationSummary;
}

async function fetchPublicScanSummary(scanUrl: string) {
  const response = await fetch(scanUrl, {
    headers: {
      "Cache-Control": "no-store"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${scanUrl}: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseCalibrationSummaryFromHtml(html);
}

async function queueAnonymousScan(baseUrl: string, domain: string) {
  const response = await fetch(new URL("/api/full-scan", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ domain })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to queue prod scan for ${domain}: HTTP ${response.status} ${body}`);
  }

  const payload = (await response.json()) as PublicScanQueueResponse;
  if (!payload.scanId || !payload.scanUrl) {
    throw new Error(`Prod scan queue response for ${domain} did not include scanId and scanUrl.`);
  }

  return {
    scanId: payload.scanId,
    scanUrl: new URL(payload.scanUrl, baseUrl).toString()
  };
}

async function waitForPublicScanSummary(input: {
  domain: string;
  scanUrl: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const summary = await fetchPublicScanSummary(input.scanUrl).catch(() => null);
    if (summary && summary.status && !["queued", "running"].includes(summary.status)) {
      return summary;
    }

    await sleep(DEFAULT_POLL_MS);
  }

  throw new Error(`Timed out waiting for prod scan for ${input.domain} after ${input.timeoutMs}ms.`);
}

function runLocalBatch(input: { domains: string[]; orgId: string | null }) {
  const scanScriptPath = path.resolve(process.cwd(), "scripts/scan-batch-eval.ts");
  const args = [
    "--env-file=.env.local",
    "--enable-source-maps",
    "--import",
    "tsx",
    scanScriptPath,
    "--domains",
    input.domains.join(" ")
  ];

  if (input.orgId) {
    args.push("--org", input.orgId);
  }

  const result = spawnSync("node", args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "Local scan batch failed.");
  }

  return JSON.parse(result.stdout) as LocalBatchRow[];
}

function summarizeExistingLocalBatch(input: { domains: string[]; orgId: string | null }) {
  const scanScriptPath = path.resolve(process.cwd(), "scripts/scan-batch-eval.ts");
  const args = [
    "--env-file=.env.local",
    "--enable-source-maps",
    "--import",
    "tsx",
    scanScriptPath,
    "--domains",
    input.domains.join(" "),
    "--summarize-only"
  ];

  if (input.orgId) {
    args.push("--org", input.orgId);
  }

  const result = spawnSync("node", args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "Local summarize-only batch failed.");
  }

  return JSON.parse(result.stdout) as LocalBatchRow[];
}

function classifyBrowserError(localRow: LocalBatchRow) {
  const stopReason = localRow.stopReason?.toLowerCase() ?? "";
  return /dns|tls|ssl|certificate|chrome-error|timed out|timeout|transport|unreachable/.test(stopReason);
}

function classifyThinOrBlocked(localRow: LocalBatchRow) {
  const summary = localRow.calibrationSummary;
  return Boolean(
    localRow.blocked === true ||
      summary?.executive.limitedCoverage === true ||
      ((summary?.coverage.pagesScanned ?? null) !== null &&
        (summary?.coverage.pagesScanned ?? 0) <= 1 &&
        (summary?.coverage.verifiedPublicSurfacesCount ?? 0) <= 0)
  );
}

function classifyMismatch(input: {
  localRow: LocalBatchRow;
  prodSummary: ScanCalibrationSummary | null;
}) {
  const localSummary = input.localRow.calibrationSummary;
  const prodSummary = input.prodSummary;

  if (!localSummary || !prodSummary) {
    return {
      bucket: "true_detection_gap" as ComparisonBucket,
      notes: ["A comparable calibration summary was not available from one side of the comparison."]
    };
  }

  const notes: string[] = [];
  const localHostCategory = localSummary.executive.hostResolutionCategory;
  const prodHostCategory = prodSummary.executive.hostResolutionCategory;

  if (localHostCategory === "same_site_alias" && prodHostCategory !== "same_site_alias") {
    notes.push("Local review treated the landing as a same-site alias, but prod still framed it as a host mismatch.");
    return { bucket: "same_site_alias" as ComparisonBucket, notes };
  }

  if (localHostCategory === "off_origin_landing" && prodHostCategory !== "off_origin_landing") {
    notes.push("Local review classified the landing as off-origin, but prod did not preserve a scope-warning posture.");
    return { bucket: "off_origin_landing" as ComparisonBucket, notes };
  }

  if (classifyBrowserError(input.localRow) && prodSummary.executive.summaryLabel !== "Scan limitation:") {
    notes.push("Local review treated the run as browser-error-driven, but prod did not collapse the narrative into a limitation state.");
    return { bucket: "browser_error_surface" as ComparisonBucket, notes };
  }

  if (
    classifyThinOrBlocked(input.localRow) &&
    prodSummary.executive.summaryLabel !== "Scan limitation:" &&
    prodSummary.executive.limitedCoverage !== true
  ) {
    notes.push("Local review marked the run as thin or blocked, but prod still presented a normal-confidence narrative.");
    return { bucket: "thin_or_blocked_scan" as ComparisonBucket, notes };
  }

  const localTopIds = localSummary.topFindings.map((finding) => finding.id);
  const prodTopIds = prodSummary.topFindings.map((finding) => finding.id);
  const sharedIds = localTopIds.filter((id) => prodTopIds.includes(id));

  if (localTopIds[0] !== prodTopIds[0] || (localTopIds.length > 0 && prodTopIds.length > 0 && sharedIds.length === 0)) {
    notes.push("Top finding selection diverged after narrative calibration; this looks like an underlying detection or ranking gap.");
    return { bucket: "true_detection_gap" as ComparisonBucket, notes };
  }

  notes.push("Prod and local narrative posture align for this scan.");
  return { bucket: "aligned" as ComparisonBucket, notes };
}

async function main() {
  const domains = parseDomains();
  const localBaseUrl = getArgValue("--local-url") ?? DEFAULT_LOCAL_BASE_URL;
  const prodBaseUrl = getArgValue("--prod-url") ?? DEFAULT_PROD_BASE_URL;
  const orgId = getArgValue("--org");
  const reuseLocal = hasFlag("--reuse-local");
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const outputPath =
    getArgValue("--out") ??
    path.join(DEFAULT_OUTPUT_DIR, `prod-local-tranco-comparison-${new Date().toISOString().replaceAll(":", "-")}.json`);

  const scannerHeartbeat = await getLastScannerServiceHeartbeat();
  const localQueueAvailability = getFullScanQueueAvailabilityFromHeartbeat(scannerHeartbeat.lastHeartbeatAt);
  if (!localQueueAvailability.enabled) {
    const heartbeatNote = scannerHeartbeat.lastHeartbeatAt
      ? ` Last heartbeat: ${scannerHeartbeat.lastHeartbeatAt}${scannerHeartbeat.host ? ` on ${scannerHeartbeat.host}` : ""}.`
      : "";
    throw new Error(`${localQueueAvailability.reason}${heartbeatNote}`);
  }

  const localRows = reuseLocal
    ? summarizeExistingLocalBatch({
        domains,
        orgId
      })
    : runLocalBatch({
        domains,
        orgId
      });
  const localByDomain = new Map(localRows.map((row) => [row.domain, row] as const));
  const prodResults: Array<{ domain: string; queuedScanId: string; scanUrl: string; summary: ScanCalibrationSummary | null }> = [];

  for (const domain of domains) {
    const queued = await queueAnonymousScan(prodBaseUrl, domain);
    const summary = await waitForPublicScanSummary({
      domain,
      scanUrl: queued.scanUrl,
      timeoutMs
    });

    prodResults.push({
      domain,
      queuedScanId: queued.scanId,
      scanUrl: queued.scanUrl,
      summary
    });
  }

  const prodByDomain = new Map(prodResults.map((row) => [row.domain, row] as const));
  const comparisons = domains.map((domain) => {
    const localRow = localByDomain.get(domain) ?? null;
    const prodRow = prodByDomain.get(domain) ?? null;
    const mismatch = classifyMismatch({
      localRow: localRow ?? { domain, scanId: null },
      prodSummary: prodRow?.summary ?? null
    });

    return {
      domain,
      local: localRow,
      mismatchBucket: mismatch.bucket,
      notes: mismatch.notes,
      prod: prodRow
        ? {
            calibrationSummary: prodRow.summary,
            queuedScanId: prodRow.queuedScanId,
            scanUrl: prodRow.scanUrl
          }
        : null
    };
  });

  const aggregate = comparisons.reduce<Record<ComparisonBucket, number>>(
    (acc, row) => {
      acc[row.mismatchBucket] += 1;
      return acc;
    },
    {
      aligned: 0,
      browser_error_surface: 0,
      off_origin_landing: 0,
      same_site_alias: 0,
      thin_or_blocked_scan: 0,
      true_detection_gap: 0
    }
  );

  const payload = {
    comparedAt: new Date().toISOString(),
    domains,
    environments: {
      localBaseUrl,
      prodBaseUrl
    },
    aggregate,
    comparisons
  };

  writeJsonFile(outputPath, payload);
  console.log(JSON.stringify({ ...payload, outputPath }, null, 2));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
