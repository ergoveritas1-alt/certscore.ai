import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createComparisonReport, writeHybridAutoReportBundle } from "./core/report";
import type { RuntimeFactory } from "./core/capture";
import type {
  AutoDecisionSummary,
  BatchScoreboardRow,
  RuntimeLogger,
  RuntimeOptions,
  RuntimeRunResult
} from "./core/types";
import { PlaywrightCdpRuntime } from "./runtimes/playwrightCdp";
import { PlaywrightLocalRuntime } from "./runtimes/playwrightLocal";
import { applyHybridAutoRuntimeTiming } from "./hybrid-auto-browser-plan";
import { createHybridAutoBrowserPassRunner, runHybridAutoSession } from "./hybrid-auto-browser-pass";

type BatchArgs = {
  cdpRotateEvery: number;
  concurrency: number;
  domainsFile: string;
  outDir: string;
};

function parseArgs(argv: string[]): BatchArgs {
  const defaultConcurrency = Number.parseInt(process.env.BATCH_SCAN_CONCURRENCY ?? "3", 10);
  const defaultRotateEvery = Number.parseInt(process.env.BATCH_CDP_ROTATE_EVERY ?? "10", 10);
  let cdpRotateEvery = Number.isFinite(defaultRotateEvery) ? defaultRotateEvery : 10;
  let concurrency = Number.isFinite(defaultConcurrency) ? defaultConcurrency : 3;
  let domainsFile: string | null = null;
  let outDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--domains-file" && next) {
      domainsFile = next;
      index += 1;
      continue;
    }
    if (current === "--out-dir" && next) {
      outDir = next;
      index += 1;
      continue;
    }
    if (current === "--concurrency" && next) {
      concurrency = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (current === "--cdp-rotate-every" && next) {
      cdpRotateEvery = Number.parseInt(next, 10);
      index += 1;
    }
  }

  if (!domainsFile) {
    throw new Error(
      "Usage: pnpm --filter @website-signal-risk-scanner/runtime-harness batch -- --domains-file /path/to/difficult-domains.txt --out-dir /path/to/output [--concurrency 3] [--cdp-rotate-every 10]"
    );
  }

  return {
    cdpRotateEvery: Math.max(1, cdpRotateEvery),
    concurrency: Math.max(1, concurrency),
    domainsFile: path.resolve(domainsFile),
    outDir: outDir
      ? path.resolve(outDir)
      : path.resolve(process.cwd(), "tmp", "runtime-batch", new Date().toISOString().replace(/[:.]/g, "-"))
  };
}

function runtimeLogger(): RuntimeLogger {
  return {
    log(message) {
      console.info(`${new Date().toISOString()} ${message}`);
    }
  };
}

function modeFactories(): Record<"playwright-local" | "playwright-cdp", RuntimeFactory> {
  return {
    "playwright-cdp": ({ context, options }) => new PlaywrightCdpRuntime(context, options),
    "playwright-local": ({ context, options }) => new PlaywrightLocalRuntime(context, options)
  };
}

function slugify(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function readDomains(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map(normalizeUrl)
    .filter((value): value is string => value !== null);
}

function defaultChromeExecutablePath() {
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "google-chrome";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChromeDebugEndpoint(endpoint: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for Chrome CDP endpoint at ${endpoint}.`);
}

class ManagedChromeInstance {
  private domainsSinceRestart = 0;
  private endpoint: string | null = null;
  private process: ChildProcess | null = null;
  private profileDir: string | null = null;

  constructor(
    private readonly workerId: number,
    private readonly rotateEvery: number,
    private readonly logger: RuntimeLogger,
    private readonly port: number
  ) {}

  async getEndpoint() {
    if (!this.process) {
      await this.start();
    }
    if (!this.endpoint) {
      throw new Error(`Worker ${this.workerId} Chrome endpoint was not initialized.`);
    }
    return this.endpoint;
  }

  async noteDomainComplete() {
    this.domainsSinceRestart += 1;
    if (this.domainsSinceRestart >= this.rotateEvery) {
      this.logger.log(`[worker ${this.workerId}] rotating managed CDP Chrome after ${this.domainsSinceRestart} escalated domains`);
      await this.restart();
    }
  }

  async close() {
    if (this.process) {
      this.process.kill("SIGTERM");
      await sleep(500);
      if (!this.process.killed) {
        this.process.kill("SIGKILL");
      }
    }
    if (this.profileDir) {
      await rm(this.profileDir, { force: true, recursive: true }).catch(() => undefined);
    }
    this.process = null;
    this.profileDir = null;
    this.endpoint = null;
    this.domainsSinceRestart = 0;
  }

  private async restart() {
    await this.close();
    await this.start();
  }

  private async start() {
    const executablePath = process.env.CHROME_EXECUTABLE_PATH ?? defaultChromeExecutablePath();
    this.profileDir = await mkdtemp(path.join(os.tmpdir(), `runtime-harness-cdp-worker-${this.workerId}-`));
    this.endpoint = `http://127.0.0.1:${this.port}`;
    this.logger.log(`[worker ${this.workerId}] starting managed CDP Chrome on port ${this.port}`);
    this.process = spawn(
      executablePath,
      [
        "--remote-debugging-address=127.0.0.1",
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
      ],
      {
        stdio: "ignore"
      }
    );
    await waitForChromeDebugEndpoint(this.endpoint, 15_000);
    this.domainsSinceRestart = 0;
  }
}

function buildSummaryRow(domain: string, mode: RuntimeRunResult) {
  const documentResponses = mode.responses
    .filter((response) => response.resourceType === "document")
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const initialStatus = documentResponses[0]?.status ?? mode.mainDocument.status ?? null;
  const finalStatus = documentResponses.at(-1)?.status ?? mode.mainDocument.status ?? null;
  const terminalKind = deriveTerminalKind(mode.classification.classification, finalStatus);
  const outcomeBucket = deriveOutcomeBucket(mode.classification.classification);

  return {
    challengeRecoveryTimeMs: mode.timings.challengeToRecoveryMs,
    challengeDetected: mode.classification.challengeDetected,
    classification: mode.classification.classification,
    consentUiDetected: mode.consentUi.detected,
    cookies: mode.cookieSnapshots.at(-1)?.cookieCount ?? 0,
    domain,
    finalStatus,
    initialStatus,
    mode: mode.mode,
    outcomeBucket,
    postRejectRequests: mode.postRejectPersistence?.thirdPartyRequestsAfterReject ?? 0,
    requests: mode.requests.length,
    responses: mode.responses.length,
    terminalKind,
    thirdPartyDomains: mode.thirdPartyDomainCount,
    title: mode.title,
    vendors: mode.vendorSummary.normalizedVendors
  };
}

function buildScoreboardRow(domain: string, mode: RuntimeRunResult): BatchScoreboardRow {
  const documentResponses = mode.responses
    .filter((response) => response.resourceType === "document")
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const initialStatus = documentResponses[0]?.status ?? mode.mainDocument.status ?? null;
  const finalStatus = documentResponses.at(-1)?.status ?? mode.mainDocument.status ?? null;
  const terminalKind = deriveTerminalKind(mode.classification.classification, finalStatus);
  const outcomeBucket = deriveOutcomeBucket(mode.classification.classification);

  return {
    blockerOutcome: mode.classification.blockerSummary.outcome,
    blockerVendorHint: mode.classification.blockerSummary.vendorHint,
    challengeDetected: mode.classification.challengeDetected,
    classification: mode.classification.classification,
    confirmedFindingCount: mode.findingPacket.summary.confirmed,
    cookieCount: mode.cookieSnapshots.at(-1)?.cookieCount ?? 0,
    domain,
    evidenceDepth: mode.runQualitySummary.evidenceDepth,
    finalStatus,
    highSignalCookieCount: mode.cookieRiskSummary.filter((item) => item.observed).length,
    initialStatus,
    mode: mode.mode,
    outcomeBucket,
    overallConfidence: mode.runQualitySummary.overallConfidence,
    terminalKind,
    thirdPartyDomains: mode.thirdPartyDomainCount,
    usedEscalation: mode.runtimeMetadata.autoEscalated,
    vendorCount: mode.preConsentVendorSummary.normalizedVendors.length
  };
}

function deriveTerminalKind(classification: RuntimeRunResult["classification"]["classification"], finalStatus: number | null) {
  if (classification === "dns_failure" || classification === "origin_timeout" || classification === "connection_closed") {
    return classification;
  }
  if (typeof finalStatus === "number") {
    if (finalStatus >= 200 && finalStatus < 300) {
      return `http_${finalStatus}_okish`;
    }
    if (finalStatus >= 300 && finalStatus < 400) {
      return `http_${finalStatus}_redirect`;
    }
    if (finalStatus >= 400 && finalStatus < 500) {
      return `http_${finalStatus}_client_error`;
    }
    if (finalStatus >= 500 && finalStatus < 600) {
      return `http_${finalStatus}_server_error`;
    }
    return `http_${finalStatus}`;
  }
  return "status_unavailable";
}

function deriveOutcomeBucket(
  classification: RuntimeRunResult["classification"]["classification"]
): "broken_or_nonusable" | "meaningfully_blocked" | "useful_signal" {
  if (classification === "full_runtime" || classification === "partial_html") {
    return "useful_signal";
  }
  if (classification === "verification_interstitial" || classification === "edge_block") {
    return "meaningfully_blocked";
  }
  return "broken_or_nonusable";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const domains = await readDomains(args.domainsFile);
  const logger = runtimeLogger();
  const factories = modeFactories();
  const hybridAutoBrowserPassRunner = createHybridAutoBrowserPassRunner();
  const observeMsOverride =
    process.env.BATCH_SCAN_OBSERVE_MS || process.env.SCAN_OBSERVE_MS
      ? Number.parseInt(process.env.BATCH_SCAN_OBSERVE_MS ?? process.env.SCAN_OBSERVE_MS ?? "", 10)
      : null;
  const timeoutMsOverride =
    process.env.BATCH_SCAN_TIMEOUT_MS || process.env.SCAN_TIMEOUT_MS
      ? Number.parseInt(process.env.BATCH_SCAN_TIMEOUT_MS ?? process.env.SCAN_TIMEOUT_MS ?? "", 10)
      : null;
  const cdpBasePort = Number.parseInt(process.env.BATCH_CDP_BASE_PORT ?? "9322", 10);

  await mkdir(args.outDir, { recursive: true });

  const summaryRows: ReturnType<typeof buildSummaryRow>[] = [];
  const scoreboardRows: BatchScoreboardRow[] = [];
  let nextDomainIndex = 0;

  async function runHybridDomain(domain: string, workerId: number, cdpChrome: ManagedChromeInstance) {
    const domainDir = path.join(args.outDir, slugify(domain));
    await mkdir(domainDir, { recursive: true });
    const baseOptions = {
      outputDir: domainDir,
      remoteCdpWsEndpoint: process.env.REMOTE_CDP_WS_ENDPOINT ?? null,
      userAgent: process.env.SCAN_USER_AGENT ?? null
    };
    logger.log(`[worker ${workerId}] hybrid auto start ${domain}`);
    const autoSession = await runHybridAutoSession({
      async buildOptions(mode) {
        return applyHybridAutoRuntimeTiming({
          ...baseOptions,
          chromeRemoteDebuggingUrl: mode === "playwright-cdp" ? await cdpChrome.getEndpoint() : null,
          mode,
          observeMsOverride,
          timeoutMsOverride
        });
      },
      logger: {
        log(message) {
          if (message.startsWith("[auto] escalating")) {
            logger.log(`[worker ${workerId}] ${message.replace("[auto] ", "")}`);
            return;
          }
          if (message.startsWith("[auto] staying")) {
            logger.log(`[worker ${workerId}] ${message.replace("[auto] ", "")} for ${domain}`);
            return;
          }
          logger.log(message);
        }
      },
      requestedUrl: domain,
      runner: hybridAutoBrowserPassRunner,
      runtimeFactories: {
        "playwright-cdp": factories["playwright-cdp"],
        "playwright-local": factories["playwright-local"]
      }
    });
    const results = autoSession.results;
    const autoDecisionSummary: AutoDecisionSummary = autoSession.autoDecisionSummary;

    for (const result of results) {
      summaryRows.push(buildSummaryRow(domain, result));
      scoreboardRows.push(buildScoreboardRow(domain, result));
    }
    if (results.some((result) => result.mode === "playwright-cdp")) {
      await cdpChrome.noteDomainComplete();
    }

    const comparison = createComparisonReport(domain, results);
    await writeHybridAutoReportBundle(domainDir, comparison, autoDecisionSummary);
  }

  await Promise.all(
    Array.from({ length: args.concurrency }, async (_, workerOffset) => {
      const workerId = workerOffset + 1;
      const cdpChrome = new ManagedChromeInstance(workerId, args.cdpRotateEvery, logger, cdpBasePort + workerOffset);
      try {
        while (nextDomainIndex < domains.length) {
          const domain = domains[nextDomainIndex];
          nextDomainIndex += 1;
          if (!domain) {
            continue;
          }
          await runHybridDomain(domain, workerId, cdpChrome);
        }
      } finally {
        await cdpChrome.close();
      }
    })
  );

  const summaryJsonPath = path.join(args.outDir, "batch-summary.json");
  const summaryCsvPath = path.join(args.outDir, "batch-summary.csv");
  const scoreboardJsonPath = path.join(args.outDir, "batch-scoreboard.json");
  const scoreboardCsvPath = path.join(args.outDir, "batch-scoreboard.csv");
  await writeFile(summaryJsonPath, `${JSON.stringify(summaryRows, null, 2)}\n`, "utf8");
  await writeFile(scoreboardJsonPath, `${JSON.stringify(scoreboardRows, null, 2)}\n`, "utf8");
  const header = [
    "domain",
    "mode",
    "classification",
    "outcomeBucket",
    "terminalKind",
    "challengeDetected",
    "consentUiDetected",
    "initialStatus",
    "finalStatus",
    "challengeRecoveryTimeMs",
    "postRejectRequests",
    "requests",
    "responses",
    "cookies",
    "thirdPartyDomains",
    "vendors",
    "title"
  ];
  const lines = [header.join(",")];
  for (const row of summaryRows) {
    lines.push(
      [
        row.domain,
        row.mode,
        row.classification,
        row.outcomeBucket,
        row.terminalKind,
        String(row.challengeDetected),
        String(row.consentUiDetected),
        String(row.initialStatus ?? ""),
        String(row.finalStatus ?? ""),
        String(row.challengeRecoveryTimeMs ?? ""),
        String(row.postRejectRequests),
        String(row.requests),
        String(row.responses),
        String(row.cookies),
        String(row.thirdPartyDomains),
        `"${row.vendors.join("|")}"`,
        `"${(row.title ?? "").replaceAll('"', '""')}"`
      ].join(",")
    );
  }
  await writeFile(summaryCsvPath, `${lines.join("\n")}\n`, "utf8");

  const scoreboardHeader = [
    "domain",
    "mode",
    "classification",
    "outcomeBucket",
    "terminalKind",
    "blockerOutcome",
    "blockerVendorHint",
    "challengeDetected",
    "initialStatus",
    "finalStatus",
    "thirdPartyDomains",
    "vendorCount",
    "cookieCount",
    "highSignalCookieCount",
    "confirmedFindingCount",
    "evidenceDepth",
    "overallConfidence",
    "usedEscalation"
  ];
  const scoreboardLines = [scoreboardHeader.join(",")];
  for (const row of scoreboardRows) {
    scoreboardLines.push(
      [
        row.domain,
        row.mode,
        row.classification,
        row.outcomeBucket,
        row.terminalKind,
        row.blockerOutcome,
        row.blockerVendorHint ?? "",
        String(row.challengeDetected),
        String(row.initialStatus ?? ""),
        String(row.finalStatus ?? ""),
        String(row.thirdPartyDomains),
        String(row.vendorCount),
        String(row.cookieCount),
        String(row.highSignalCookieCount),
        String(row.confirmedFindingCount),
        row.evidenceDepth,
        row.overallConfidence.toFixed(2),
        String(row.usedEscalation)
      ].join(",")
    );
  }
  await writeFile(scoreboardCsvPath, `${scoreboardLines.join("\n")}\n`, "utf8");

  console.info(`Batch summary json ${summaryJsonPath}`);
  console.info(`Batch summary csv ${summaryCsvPath}`);
  console.info(`Batch scoreboard json ${scoreboardJsonPath}`);
  console.info(`Batch scoreboard csv ${scoreboardCsvPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
