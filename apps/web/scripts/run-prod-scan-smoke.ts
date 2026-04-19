import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_DOMAIN = "princeton.edu";
const DEFAULT_TIMEOUT_MS = 8 * 60_000;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration");

type PublicScanQueueResponse = {
  scanId: string | null;
  scanUrl: string | null;
};

type StageName = "scanner" | "nanoDocRetrieval" | "mergedSignals" | "findings";

type PollSnapshot = {
  fetchedAt: string;
  findings: string | null;
  mergedSignals: string | null;
  nanoDocRetrieval: string | null;
  scanner: string | null;
};

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

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function extractStageStatus(html: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escapedLabel}</p><span[^>]*>([^<]+)</span>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractPollSnapshot(html: string): PollSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    findings: extractStageStatus(html, "Unified Findings"),
    mergedSignals: extractStageStatus(html, "Merged Signals"),
    nanoDocRetrieval: extractStageStatus(html, "Nano Doc Retrieval"),
    scanner: extractStageStatus(html, "Scanner")
  };
}

function isTerminalStage(status: string | null) {
  return status === "Completed" || status === "Failed" || status === "Blocked";
}

function isTerminalSnapshot(snapshot: PollSnapshot) {
  return (["scanner", "nanoDocRetrieval", "mergedSignals", "findings"] as StageName[]).every((stage) =>
    isTerminalStage(snapshot[stage])
  );
}

async function fetchScanPage(scanUrl: string) {
  const response = await fetch(scanUrl, {
    headers: {
      "Cache-Control": "no-store"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${scanUrl}: HTTP ${response.status}`);
  }

  return response.text();
}

async function waitForCompletion(input: {
  outputPath: string;
  scanId: string;
  scanUrl: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  const polls: PollSnapshot[] = [];

  while (Date.now() - startedAt < input.timeoutMs) {
    const html = await fetchScanPage(input.scanUrl);
    const snapshot = extractPollSnapshot(html);
    polls.push(snapshot);

    writeJsonFile(input.outputPath, {
      completed: isTerminalSnapshot(snapshot),
      polls,
      scanId: input.scanId,
      scanUrl: input.scanUrl
    });

    console.log(JSON.stringify(snapshot));

    if (isTerminalSnapshot(snapshot)) {
      return polls;
    }

    await sleep(DEFAULT_POLL_MS);
  }

  throw new Error(`Timed out waiting for prod scan ${input.scanId} after ${input.timeoutMs}ms.`);
}

async function main() {
  const baseUrl = getArgValue("--base-url") ?? DEFAULT_BASE_URL;
  const domain = getArgValue("--domain") ?? DEFAULT_DOMAIN;
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const outputPath =
    getArgValue("--out") ??
    path.join(
      DEFAULT_OUTPUT_DIR,
      `prod-scan-smoke-${domain.replace(/[^a-z0-9.-]+/gi, "-")}-${new Date().toISOString().replaceAll(":", "-")}.json`
    );

  const queued = await queueAnonymousScan(baseUrl, domain);
  console.log(JSON.stringify({ domain, queuedAt: new Date().toISOString(), ...queued }));
  const polls = await waitForCompletion({
    outputPath,
    scanId: queued.scanId,
    scanUrl: queued.scanUrl,
    timeoutMs
  });

  console.log(
    JSON.stringify({
      completedAt: new Date().toISOString(),
      domain,
      final: polls[polls.length - 1] ?? null,
      outputPath,
      scanId: queued.scanId,
      scanUrl: queued.scanUrl
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
