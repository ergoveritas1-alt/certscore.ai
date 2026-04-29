import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DEFAULT_DOMAINS = [
  "bestforex-signals.com",
  "www.acorns.com",
  "www.betterment.com",
  "ftmo.com",
  "www.shopify.com",
  "forexroboteasy.com",
  "signal2forex.com",
  "empireofforex.com",
  "stripe.com",
  "www.ally.com",
  "www.blackrock.com",
  "robinhood.com"
];

const DEFAULT_TARGET_FINDINGS = [
  "policy_clarity_risk",
  "privacy_contact_channel_missing",
  "cookie_disclosure_gap",
  "missing_dsar_mechanism",
  "missing_transfer_disclosure"
];

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/noisy-finding-postdeploy");
const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_POLL_MS = 10_000;

type SurfacedFinding = {
  decision?: string | null;
  id: string;
  status?: string | null;
  summary?: string | null;
  url?: string | null;
};

type ScanBatchRow = {
  domain: string;
  pendingReason?: string | null;
  scan?: {
    completedAt?: string | null;
    createdAt?: string | null;
    status?: string | null;
  };
  scanId: string | null;
  scanOutcome?: string | null;
  stopReason?: string | null;
  surfaced?: SurfacedFinding[];
};

type PublicScanQueueResponse = {
  scanId: string | null;
  scanUrl: string | null;
};

type PublicCalibrationSummary = {
  domain: string | null;
  scanId: string | null;
  status: string | null;
  topFindings?: Array<{
    confidence?: string | null;
    id: string;
    label?: string | null;
    severity?: string | null;
    shortSummary?: string | null;
  }>;
};

type StageName = "scanner" | "nanoDocRetrieval" | "mergedSignals" | "findings";

type PollSnapshot = Record<StageName, string | null> & {
  calibrationSummary: PublicCalibrationSummary | null;
  fetchedAt: string;
  targetFindingPackets: SurfacedFinding[];
  targetFindingIdsPresent: string[];
};

type FindingState = {
  decision: string | null;
  status: string | null;
  summary: string | null;
  url: string | null;
};

type FindingDiff = {
  after: FindingState | null;
  before: FindingState | null;
  findingId: string;
  transition: string;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseListArg(flag: string, fallback: string[]) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function runScanBatchEval(input: {
  domains: string[];
  extraArgs: string[];
}) {
  const scanScriptPath = path.resolve(process.cwd(), "scripts/scan-batch-eval.ts");
  const result = spawnSync(
    "node",
    [
      "--env-file=.env.local",
      "--enable-source-maps",
      "--import",
      "tsx",
      scanScriptPath,
      "--domains",
      input.domains.join(" "),
      ...input.extraArgs
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "scan-batch-eval failed.");
  }

  return JSON.parse(result.stdout) as ScanBatchRow[];
}

function runScanBatchEvalForScanIds(scanIds: string[]) {
  const scanScriptPath = path.resolve(process.cwd(), "scripts/scan-batch-eval.ts");
  const result = spawnSync(
    "node",
    [
      "--env-file=.env.local",
      "--enable-source-maps",
      "--import",
      "tsx",
      scanScriptPath,
      "--summarize-only",
      "--scan-ids",
      scanIds.join(" ")
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "scan-batch-eval scan-id summary failed.");
  }

  return JSON.parse(result.stdout) as ScanBatchRow[];
}

async function queuePublicScan(input: { baseUrl: string; domain: string }) {
  const response = await fetch(new URL("/api/full-scan", input.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ domain: input.domain })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to queue public scan for ${input.domain}: HTTP ${response.status} ${body}`);
  }

  const payload = (await response.json()) as PublicScanQueueResponse;
  if (!payload.scanId || !payload.scanUrl) {
    throw new Error(`Public scan queue response for ${input.domain} did not include scanId and scanUrl.`);
  }

  return {
    scanId: payload.scanId,
    scanUrl: new URL(payload.scanUrl, input.baseUrl).toString()
  };
}

function extractStageStatus(html: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escapedLabel}</p><span[^>]*>([^<]+)</span>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractPollSnapshot(html: string): PollSnapshot {
  const targetFindingPackets = extractTargetFindingPacketsFromHtml(html);

  return {
    calibrationSummary: parseCalibrationSummaryFromHtml(html),
    fetchedAt: new Date().toISOString(),
    findings: extractStageStatus(html, "Unified Findings"),
    mergedSignals: extractStageStatus(html, "Merged Signals"),
    nanoDocRetrieval: extractStageStatus(html, "Nano Doc Retrieval"),
    scanner: extractStageStatus(html, "Scanner"),
    targetFindingIdsPresent: [...new Set(targetFindingPackets.map((packet) => packet.id))],
    targetFindingPackets
  };
}

function parseCalibrationSummaryFromHtml(html: string) {
  const match = html.match(/<script[^>]*data-testid="scan-calibration-summary"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return null;
  }

  return JSON.parse(match[1]) as PublicCalibrationSummary;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractTargetFindingPacketsFromHtml(html: string) {
  const packets: SurfacedFinding[] = [];
  const preBlockPattern = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
  let match: RegExpExecArray | null;

  while ((match = preBlockPattern.exec(html)) !== null) {
    const rawJson = decodeHtmlEntities(match[1] ?? "");
    if (!DEFAULT_TARGET_FINDINGS.some((findingId) => rawJson.includes(`"unifiedFindingId": "${findingId}"`))) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson) as {
        presentationDecision?: { status?: string | null };
        summary?: string | null;
        surfacingDecision?: { decisionState?: string | null };
        unifiedFindingId?: string;
      };
      const findingId = parsed.unifiedFindingId;
      if (!findingId || !DEFAULT_TARGET_FINDINGS.includes(findingId)) {
        continue;
      }

      packets.push({
        decision: parsed.surfacingDecision?.decisionState ?? null,
        id: findingId,
        status: parsed.presentationDecision?.status ?? null,
        summary: parsed.summary ?? null,
        url: null
      });
    } catch {
      continue;
    }
  }

  return packets;
}

function isTerminalStage(status: string | null) {
  return status === "Completed" || status === "Failed" || status === "Blocked";
}

function isTerminalSnapshot(snapshot: PollSnapshot) {
  return (["scanner", "nanoDocRetrieval", "mergedSignals", "findings"] as StageName[]).every((stage) =>
    isTerminalStage(snapshot[stage])
  );
}

async function waitForPublicScan(input: {
  scanUrl: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  const polls: PollSnapshot[] = [];

  while (Date.now() - startedAt < input.timeoutMs) {
    const response = await fetch(input.scanUrl, {
      headers: {
        "Cache-Control": "no-store"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${input.scanUrl}: HTTP ${response.status}`);
    }

    const snapshot = extractPollSnapshot(await response.text());
    polls.push(snapshot);

    if (isTerminalSnapshot(snapshot)) {
      return polls;
    }

    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_MS));
  }

  throw new Error(`Timed out waiting for public scan ${input.scanUrl} after ${input.timeoutMs}ms.`);
}

function indexFindings(row: ScanBatchRow | undefined, targetFindings: string[]) {
  const surfaced = row?.surfaced ?? [];
  const byFinding = new Map<string, FindingState>();
  for (const finding of surfaced) {
    if (!targetFindings.includes(finding.id)) {
      continue;
    }

    byFinding.set(finding.id, {
      decision: finding.decision ?? null,
      status: finding.status ?? null,
      summary: finding.summary ?? null,
      url: finding.url ?? null
    });
  }
  return byFinding;
}

function diffRows(input: {
  after: ScanBatchRow;
  before: ScanBatchRow | undefined;
  targetFindings: string[];
}) {
  const beforeFindings = indexFindings(input.before, input.targetFindings);
  const afterFindings = indexFindings(input.after, input.targetFindings);
  const diffs: FindingDiff[] = [];

  for (const findingId of input.targetFindings) {
    const before = beforeFindings.get(findingId) ?? null;
    const after = afterFindings.get(findingId) ?? null;
    const beforeState = before ? `${before.status ?? "unknown"}/${before.decision ?? "unknown"}` : "absent";
    const afterState = after ? `${after.status ?? "unknown"}/${after.decision ?? "unknown"}` : "absent";
    if (beforeState === afterState) {
      continue;
    }

    diffs.push({
      after,
      before,
      findingId,
      transition: `${beforeState} -> ${afterState}`
    });
  }

  return diffs;
}

function renderMarkdown(input: {
  after: ScanBatchRow[];
  before: ScanBatchRow[];
  diffsByDomain: Array<{ diffs: FindingDiff[]; domain: string }>;
  domains: string[];
  generatedAt: string;
  targetFindings: string[];
}) {
  const lines = [
    "# Noisy Finding Post-Deploy Validation",
    "",
    `Generated: ${input.generatedAt}`,
    `Domains: ${input.domains.length}`,
    `Target findings: ${input.targetFindings.map((findingId) => `\`${findingId}\``).join(", ")}`,
    "",
    "## Fresh Scan Summary",
    "",
    "| Domain | New scan | Status | Completed | Target findings after |",
    "|---|---|---|---|---|"
  ];

  for (const row of input.after) {
    const targetFindings = (row.surfaced ?? [])
      .filter((finding) => input.targetFindings.includes(finding.id))
      .map((finding) => `\`${finding.id}\` ${finding.status ?? ""}/${finding.decision ?? ""}`.trim());
    lines.push(
      `| ${row.domain} | \`${row.scanId ?? ""}\` | ${row.scan?.status ?? row.pendingReason ?? ""} | ${row.scan?.completedAt ?? ""} | ${targetFindings.join("<br>") || "none"} |`
    );
  }

  lines.push("", "## Finding State Deltas", "", "| Domain | Finding | Transition | Before URL | After URL |", "|---|---|---|---|---|");

  for (const entry of input.diffsByDomain) {
    if (entry.diffs.length === 0) {
      lines.push(`| ${entry.domain} | none | unchanged |  |  |`);
      continue;
    }

    for (const diff of entry.diffs) {
      lines.push(
        `| ${entry.domain} | \`${diff.findingId}\` | ${diff.transition} | ${diff.before?.url ?? ""} | ${diff.after?.url ?? ""} |`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildPublicSummaryRow(input: {
  domain: string;
  publicSummary: PublicCalibrationSummary | null;
  scanId: string;
  targetFindingPackets: SurfacedFinding[];
  targetFindingIdsPresent: string[];
  targetFindings: string[];
}) {
  const surfaced: SurfacedFinding[] = (input.publicSummary?.topFindings ?? []).map((finding) => ({
    decision: "public_top_finding",
    id: finding.id,
    status: "surface",
    summary: finding.shortSummary ?? finding.label ?? null,
    url: null
  }));

  for (const packet of input.targetFindingPackets) {
    if (!input.targetFindings.includes(packet.id) || surfaced.some((finding) => finding.id === packet.id)) {
      continue;
    }

    surfaced.push(packet);
  }

  for (const findingId of input.targetFindingIdsPresent) {
    if (!input.targetFindings.includes(findingId) || surfaced.some((finding) => finding.id === findingId)) {
      continue;
    }

    surfaced.push({
      decision: "public_result_packet_present",
      id: findingId,
      status: "present",
      summary: "Finding packet was present in the public production scan result.",
      url: null
    });
  }

  return {
    domain: input.publicSummary?.domain ?? input.domain,
    scan: {
      completedAt: null,
      createdAt: null,
      status: input.publicSummary?.status ?? null
    },
    scanId: input.publicSummary?.scanId ?? input.scanId,
    surfaced: surfaced.filter((finding) => input.targetFindings.includes(finding.id))
  } satisfies ScanBatchRow;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function main() {
  const domains = parseListArg("--domains", DEFAULT_DOMAINS);
  const targetFindings = parseListArg("--findings", DEFAULT_TARGET_FINDINGS);
  const generatedAt = new Date().toISOString();
  const runId = generatedAt.replaceAll(":", "-").replaceAll(".", "-");
  const outDir = path.resolve(getArgValue("--out-dir") ?? DEFAULT_OUTPUT_DIR, runId);
  const timeoutMs = getArgValue("--timeout-ms") ?? "1200000";
  const baseUrl = getArgValue("--base-url") ?? DEFAULT_BASE_URL;
  const org = getArgValue("--org");
  const reusePublicScansPath = getArgValue("--reuse-public-scans");

  const sharedArgs = [...(org ? ["--org", org] : [])];

  const before = runScanBatchEval({
    domains,
    extraArgs: ["--summarize-only", ...sharedArgs]
  });
  writeFile(path.join(outDir, "baseline.json"), `${JSON.stringify(before, null, 2)}\n`);

  const queuedScans = [];
  if (reusePublicScansPath) {
    const reused = JSON.parse(fs.readFileSync(path.resolve(reusePublicScansPath), "utf8")) as Array<{
      domain: string;
      scanId: string;
      scanUrl: string;
    }>;
    for (const scan of reused) {
      const response = await fetch(scan.scanUrl, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch reused public scan ${scan.scanUrl}: HTTP ${response.status}`);
      }
      const final = extractPollSnapshot(await response.text());
      queuedScans.push({
        ...scan,
        final,
        polls: [final]
      });
    }
  } else {
    for (const domain of domains) {
      const queued = await queuePublicScan({ baseUrl, domain });
      const polls = await waitForPublicScan({
        scanUrl: queued.scanUrl,
        timeoutMs: Number(timeoutMs)
      });
      queuedScans.push({
        domain,
        ...queued,
        final: polls[polls.length - 1] ?? null,
        polls
      });
      writeFile(path.join(outDir, "public-scan-progress.json"), `${JSON.stringify(queuedScans, null, 2)}\n`);
    }
  }

  const scanIdSummaries = runScanBatchEvalForScanIds(queuedScans.map((scan) => scan.scanId));
  const publicByScanId = new Map(queuedScans.map((scan) => [scan.scanId, scan]));
  const after = scanIdSummaries.map((row) => {
    if (row.pendingReason !== "scan_not_found" || !row.scanId) {
      return row;
    }

    const publicScan = publicByScanId.get(row.scanId);
    return buildPublicSummaryRow({
      domain: publicScan?.domain ?? row.scanId,
      publicSummary: publicScan?.final?.calibrationSummary ?? null,
      targetFindingPackets: publicScan?.final?.targetFindingPackets ?? [],
      targetFindingIdsPresent: publicScan?.final?.targetFindingIdsPresent ?? [],
      scanId: row.scanId,
      targetFindings
    });
  });
  writeFile(path.join(outDir, "fresh-scans.json"), `${JSON.stringify(after, null, 2)}\n`);
  writeFile(path.join(outDir, "public-scans.json"), `${JSON.stringify(queuedScans, null, 2)}\n`);

  const beforeByDomain = new Map(before.map((row) => [row.domain, row]));
  const diffsByDomain = after.map((row) => ({
    diffs: diffRows({
      after: row,
      before: beforeByDomain.get(row.domain),
      targetFindings
    }),
    domain: row.domain
  }));

  const report = {
    after,
    before,
    diffsByDomain,
    domains,
    generatedAt,
    targetFindings
  };
  writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFile(path.join(outDir, "report.md"), renderMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        changedDomains: diffsByDomain.filter((entry) => entry.diffs.length > 0).length,
        domains: domains.length,
        outDir,
        targetFindings
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
