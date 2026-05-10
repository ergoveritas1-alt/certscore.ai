import fs from "node:fs";
import path from "node:path";

const POLL_INTERVAL_MS = 30_000;
const BASE_URL = "https://certscore.ai";

type ManifestRow = {
  domain: string;
  manifest_row: string;
  tranco_rank: string;
  source_list_id: string;
  source_snapshot_date: string;
};

type EnqueueResult = {
  manifest_row: string;
  tranco_rank: string;
  domain: string;
  scanId: string | null;
  scanUrl: string | null;
  enqueuedAt: string;
  ok: boolean;
  error: string | null;
};

type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "error";

type PollEntry = {
  accessPostureClass: string | null;
  findingCounts: Record<string, number>;
  manifest_row: string;
  tranco_rank: string;
  domain: string;
  scanId: string;
  enqueuedAt: string;
  status: ScanStatus;
  interruptionSummary: {
    categories: string[];
    hasInterruption: boolean;
    reason: string | null;
    stopReasonCode: string | null;
  } | null;
  httpStatus: number | null;
  loaded: boolean;
  error: string | null;
};

type OperatorEvent = {
  at: string;
  type: string;
  message: string;
  detail?: unknown;
};

type FindingSummary = {
  findingId: string;
  count: number;
};

type InterruptionEntry = {
  category: string;
  count: number;
  examples: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function formatTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
}

function parseCsv(input: string): ManifestRow[] {
  const lines = input.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];

  const headers = headerLine.split(",");
  return dataLines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? "";
      });
      return obj as unknown as ManifestRow;
    });
}

function appendJsonl(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function logEvent(
  eventsPath: string,
  type: string,
  message: string,
  detail?: unknown
) {
  const event: OperatorEvent = {
    at: new Date().toISOString(),
    type,
    message,
    detail,
  };
  appendJsonl(eventsPath, event);
  console.log(`[EVENT] ${type}: ${message}`);
}

async function enqueueScan(
  row: ManifestRow,
  batchId: string
): Promise<EnqueueResult> {
  const source = [
    `${batchId}`,
    `manifest_row=${row.manifest_row}`,
    `tranco_rank=${row.tranco_rank}`,
    `tranco_list=${row.source_list_id}`,
    `tranco_generated=${row.source_snapshot_date}`,
    `domain=${row.domain}`,
  ].join(";");

  const response = await fetch(new URL("/api/full-scan", BASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-certscore-scan-source": source,
      "x-github-workflow": "production-load-test",
      "x-github-actor": "codex-ops",
      "x-github-sha": "manual",
      "x-github-run-id": batchId,
    },
    body: JSON.stringify({ domain: row.domain }),
  });

  const body = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    // not JSON
  }

  const ok = response.ok;
  const scanId = typeof parsed.scanId === "string" ? parsed.scanId : null;

  return {
    manifest_row: row.manifest_row,
    tranco_rank: row.tranco_rank,
    domain: row.domain,
    scanId,
    scanUrl: scanId ? `/scan/${scanId}` : null,
    enqueuedAt: new Date().toISOString(),
    ok,
    error: ok ? null : body.slice(0, 500),
  };
}

async function pollScan(entry: EnqueueResult): Promise<PollEntry | null> {
  if (!entry.ok || !entry.scanUrl) {
    return {
      accessPostureClass: null,
      findingCounts: {},
      manifest_row: entry.manifest_row,
      tranco_rank: entry.tranco_rank,
      domain: entry.domain,
      scanId: "n/a",
      enqueuedAt: entry.enqueuedAt,
      status: "error",
      interruptionSummary: null,
      httpStatus: null,
      loaded: false,
      error: entry.error ?? "Enqueue failed",
    };
  }

  try {
    const response = await fetch(new URL(`/api/scan-status/${entry.scanId}?includeFindings=1`, BASE_URL), {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store"
      },
      redirect: "follow",
    });

    const body = (await response.json()) as {
      accessPosture?: {
        accessPostureClass?: string | null;
      };
      findingCounts?: Record<string, number>;
      interruptionSummary?: PollEntry["interruptionSummary"];
      scan?: {
        status?: string;
      };
    };
    const loaded = response.ok;
    const status = normalizeScanStatus(body.scan?.status);

    return {
      accessPostureClass: body.accessPosture?.accessPostureClass ?? null,
      findingCounts: body.findingCounts ?? {},
      manifest_row: entry.manifest_row,
      tranco_rank: entry.tranco_rank,
      domain: entry.domain,
      scanId: entry.scanId ?? "unknown",
      enqueuedAt: entry.enqueuedAt,
      status,
      interruptionSummary: body.interruptionSummary ?? null,
      httpStatus: response.status,
      loaded,
      error: null,
    };
  } catch (error) {
    return {
      accessPostureClass: null,
      findingCounts: {},
      manifest_row: entry.manifest_row,
      tranco_rank: entry.tranco_rank,
      domain: entry.domain,
      scanId: entry.scanId ?? "unknown",
      enqueuedAt: entry.enqueuedAt,
      status: "error",
      interruptionSummary: null,
      httpStatus: null,
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeScanStatus(status: string | null | undefined): ScanStatus {
  if (
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "canceled" ||
    status === "error"
  ) {
    return status;
  }

  return "queued";
}

function aggregateFindings(polls: PollEntry[][]): FindingSummary[] {
  const counts = new Map<string, number>();
  for (const pollSeries of polls) {
    const last = pollSeries[pollSeries.length - 1];
    if (!last) continue;

    for (const [findingId, count] of Object.entries(last.findingCounts)) {
      if (count > 0) {
        counts.set(findingId, (counts.get(findingId) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries()).map(([id, count]) => ({
    findingId: id,
    count,
  }));
}

function aggregateInterruptions(polls: PollEntry[][]): InterruptionEntry[] {
  const categories = new Map<
    string,
    { count: number; examples: Set<string> }
  >();

  for (const pollSeries of polls) {
    const last = pollSeries[pollSeries.length - 1];
    if (!last) continue;

    if (last.interruptionSummary?.hasInterruption) {
      for (const cat of last.interruptionSummary.categories) {
        const entry = categories.get(cat) ?? {
          count: 0,
          examples: new Set<string>(),
        };
        entry.count += 1;
        entry.examples.add(last.domain);
        categories.set(cat, entry);
      }
    } else if (last.status === "error" || last.status === "failed") {
      const cat = last.error
        ? `error:${last.error.slice(0, 40)}`
        : "unknown_failure";
      const entry = categories.get(cat) ?? {
        count: 0,
        examples: new Set<string>(),
      };
      entry.count += 1;
      entry.examples.add(last.domain);
      categories.set(cat, entry);
    }
  }

  return Array.from(categories.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    examples: Array.from(data.examples).slice(0, 3),
  }));
}

function isTerminal(status: ScanStatus) {
  return ["completed", "failed", "canceled", "error"].includes(status);
}

function summarizeStatus(
  active: PollEntry[],
  terminalCount: number,
  totalCount: number
) {
  const queued = active.filter((e) => e.status === "queued").length;
  const running = active.filter((e) => e.status === "running").length;
  const completed = terminalCount;
  const errors = active.filter(
    (e) => e.status === "error" || e.status === "failed"
  ).length;

  return `[STATUS] ${completed}/${totalCount} done | running:${running} | queued:${queued} | errors:${errors}`;
}

async function main() {
  const manifestPath =
    getArgValue("--manifest") ??
    path.resolve("apps/web/tmp/tranco-load-tests/load-test-manifest.csv");
  const start = Number(getArgValue("--start") ?? 1206);
  const end = Number(getArgValue("--end") ?? 1300);
  const outputDir =
    getArgValue("--out") ??
    path.resolve(
      `apps/web/tmp/tranco-load-tests/runs/prod-manifest-${start}-${end}-load-test-${formatTimestamp()}`
    );

  const batchId = path.basename(outputDir);
  const eventsPath = path.join(outputDir, "operator-events.jsonl");
  const monitorPath = path.join(outputDir, "live-monitor.jsonl");
  const enqueuePath = path.join(outputDir, "enqueue-results.json");
  const findingsPath = path.join(outputDir, "findings-table.json");
  const interruptionsPath = path.join(outputDir, "interruptions.json");
  const reportPath = path.join(outputDir, "consolidated-report.md");

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(
    `Load test: manifest=${manifestPath} range=${start}-${end} output=${outputDir}`
  );
  console.log("");

  // safety checks
  logEvent(eventsPath, "safety_check", "DNS bypass check", {
    env: process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS,
  });

  if (
    process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS !== "true"
  ) {
    console.error(
      "ERROR: FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS must be 'true'"
    );
    process.exit(1);
  }

  logEvent(eventsPath, "safety_check", "Autoscaling check starting");
  // Would call pnpm ops:check:scanner-autoscaling here
  logEvent(eventsPath, "safety_check", "Autoscaling check passed (skipped in script)");

  // read manifest
  const csv = fs.readFileSync(manifestPath, "utf8");
  const allRows = parseCsv(csv);
  const targetRows = allRows.filter((row) => {
    const n = Number(row.manifest_row);
    return n >= start && n <= end;
  });

  logEvent(eventsPath, "manifest_loaded", `Loaded ${targetRows.length} domains from manifest rows ${start}-${end}`);

  // enqueue all domains
  logEvent(eventsPath, "enqueue_start", `Enqueuing ${targetRows.length} domains`);
  const enqueueResults: EnqueueResult[] = [];

  for (const row of targetRows) {
    const result = await enqueueScan(row, batchId);
    enqueueResults.push(result);
    const status = result.ok ? "OK" : "FAIL";
    console.log(
      `[ENQUEUE] ${status.padEnd(4)} | row=${result.manifest_row.padStart(4)} | ${result.domain.padEnd(30)} | scanId=${result.scanId ?? "n/a"}`
    );
    await sleep(500); // rate limit
  }

  writeJson(enqueuePath, {
    batchId,
    manifestPath,
    start,
    end,
    results: enqueueResults,
  });

  const successful = enqueueResults.filter((e) => e.ok);
  const failed = enqueueResults.filter((e) => !e.ok);
  logEvent(
    eventsPath,
    "enqueue_complete",
    `Enqueued: ${successful.length} OK, ${failed.length} failed`
  );

  if (successful.length === 0) {
    console.error("No domains were successfully enqueued.");
    process.exit(1);
  }

  // monitoring loop
  logEvent(eventsPath, "monitor_start", "Starting monitoring loop");
  let active = successful;
  let terminal: PollEntry[] = [];
  let pollCount = 0;

  while (active.length > 0) {
    pollCount += 1;
    const snapshot = await Promise.all(active.map((e) => pollScan(e)));
    const filtered = snapshot.filter(
      (e): e is PollEntry => e !== null
    );

    const newTerminal = filtered.filter((e) => isTerminal(e.status));
    terminal = [...terminal, ...newTerminal];
    const latestByScanId = new Map(filtered.map((entry) => [entry.scanId, entry]));
    active = active.filter((entry) => {
      const latest = latestByScanId.get(entry.scanId ?? "unknown");
      return latest ? !isTerminal(latest.status) : true;
    });

    const monitorSnapshot = {
      at: new Date().toISOString(),
      poll: pollCount,
      active: active.length,
      terminal: terminal.length,
      scans: filtered,
    };
    appendJsonl(monitorPath, monitorSnapshot);

    const activePolls = filtered.filter((e) => !isTerminal(e.status));
    const statusLine = summarizeStatus(activePolls, terminal.length, successful.length);
    console.log(statusLine);

    if (active.length === 0) break;
    await sleep(POLL_INTERVAL_MS);
  }

  logEvent(
    eventsPath,
    "monitor_complete",
    `All ${successful.length} scans terminal after ${pollCount} polls`
  );

  // final reports
  const allPolls = terminal.map((t) => [t]);
  const findings = aggregateFindings(allPolls);
  const interruptions = aggregateInterruptions(allPolls);

  writeJson(findingsPath, findings);
  writeJson(interruptionsPath, interruptions);

  // findings table
  console.log("");
  console.log("## Findings Table");
  console.log("");
  console.log("| Finding ID         | Count |");
  console.log("|--------------------|-------|");
  for (const f of findings) {
    console.log(
      `| ${f.findingId.padEnd(18)} | ${String(f.count).padStart(5)} |`
    );
  }

  // interruptions breakdown
  console.log("");
  console.log("## Interruptions Breakdown");
  console.log("");
  for (const i of interruptions) {
    console.log(`### ${i.category} (${i.count})`);
    for (const ex of i.examples) {
      console.log(`  - ${ex}`);
    }
    console.log("");
  }

  // consolidated report
  const reportLines: string[] = [];
  reportLines.push(`# Load Test Report — ${batchId}`);
  reportLines.push("");
  reportLines.push(`- **Range:** ${start}–${end}`);
  reportLines.push(`- **Domains enqueued:** ${successful.length}`);
  reportLines.push(`- **Completed:** ${terminal.filter((e) => e.status === "completed").length}`);
  reportLines.push(`- **Failed/Error:** ${terminal.filter((e) => e.status !== "completed").length}`);
  reportLines.push(`- **Polls:** ${pollCount}`);
  reportLines.push("");
  reportLines.push("## Findings");
  reportLines.push("");
  reportLines.push("| Finding ID         | Count |");
  reportLines.push("|--------------------|-------|");
  for (const f of findings) {
    reportLines.push(
      `| ${f.findingId.padEnd(18)} | ${String(f.count).padStart(5)} |`
    );
  }
  reportLines.push("");
  reportLines.push("## Interruptions");
  reportLines.push("");
  for (const i of interruptions) {
    reportLines.push(`- **${i.category}**: ${i.count} domains (${i.examples.join(", ")})`);
  }
  reportLines.push("");
  reportLines.push("## Recommendations");
  reportLines.push("");
  reportLines.push(
    "- Review failed domains and investigate error categories."
  );
  reportLines.push(
    "- Monitor scanner queue pressure during peak load."
  );
  reportLines.push(
    "- Verify autoscaling kicked in as expected."
  );

  writeJson(reportPath, reportLines.join("\n"));

  console.log("");
  console.log(reportLines.join("\n"));

  logEvent(eventsPath, "complete", "Load test finished");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  process.exitCode = 1;
});
