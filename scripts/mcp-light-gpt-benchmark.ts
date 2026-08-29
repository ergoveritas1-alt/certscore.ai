import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_ENDPOINT = "https://mcp.certscore.ai/mcp/light";
const DEFAULT_TARGETS = "scripts/fixtures/mcp-light-gpt-benchmark-targets.json";
const ACTIVE_STATUSES = new Set(["queued", "running", "finalizing"]);
const USABLE_STATUSES = new Set(["completed", "completed_limited"]);
const TERMINAL_STATUSES = new Set(["completed", "completed_limited", "failed", "expired", "rate_limited"]);

export type BenchmarkTarget = {
  id: string;
  target?: string;
  omitTarget?: boolean;
  category: string;
  legacyWait?: boolean;
  freshness?: "latest" | "refresh";
  scanFrom?: "eu_de" | "eu_ie" | "california";
};

type HttpObservation = {
  operation: string;
  method: string;
  startedAt: string;
  durationMs: number;
  status: number | null;
  errorName: string | null;
  requestId: string | null;
  expectedAbortOnClose: boolean;
};

type PollObservation = {
  index: number;
  scheduledWaitSeconds: number;
  actualWaitMs: number;
  startedAt: string;
  latencyMs: number;
  spacingFromPreviousPollStartMs: number | null;
  status: string | null;
  retryAfterSeconds: number | null;
  isError: boolean;
};

export type BenchmarkCaseResult = {
  id: string;
  category: string;
  target: string | null;
  clientIdentifier: string;
  mcpSessionId: string | null;
  startedAt: string;
  completedAt: string;
  initializationSuccess: boolean;
  initializationLatencyMs: number | null;
  toolDiscoverySuccess: boolean;
  toolDiscoveryLatencyMs: number | null;
  discoveredTools: string[];
  contractChecks: Record<string, boolean>;
  scanSiteCallCount: number;
  scanSiteStartedAt: string | null;
  initialResponseLatencyMs: number | null;
  initialClassification: string;
  initialStatus: string | null;
  initialPreConsentPreviewReturned: boolean;
  initialPreviewCoverageStatus: string | null;
  initialPreviewCookieCount: number | null;
  initialPreviewTrackerCount: number | null;
  initialTextContent: string | null;
  scanId: string | null;
  retryAfterSeconds: number | null;
  legacyWaitParametersSent: boolean;
  statusPolls: PollObservation[];
  parallelPollCount: number;
  accidentalDuplicateScanCount: number;
  terminalStatus: string | null;
  terminalReached: boolean;
  scanCompletionTimeMs: number | null;
  bundleAttempted: boolean;
  bundleRetrieved: boolean;
  bundleLatencyMs: number | null;
  bundleScanIdMatched: boolean | null;
  bundleTargetMatched: boolean | null;
  totalEndToEndMs: number;
  finalResult: string;
  httpObservations: HttpObservation[];
  httpErrorCount: number;
  mcpErrorCount: number;
  timeout: boolean;
  disconnect: boolean;
  telemetryRecorded: "not_client_observable";
  telemetryCorrelation: {
    clientIdentifier: string;
    sessionId: string | null;
    timeWindowStart: string;
    timeWindowEnd: string;
  };
  error: { name: string; message: string; code: string | number | null } | null;
};

type Percentiles = {
  count: number;
  min: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
};

export type BenchmarkReport = {
  schemaVersion: "certscore.mcp-light-gpt-benchmark.v1";
  runId: string;
  endpoint: string;
  startedAt: string;
  completedAt: string;
  configuration: {
    caseCount: number;
    concurrency: number;
    interCaseDelaySeconds: number;
    pollFallbackSeconds: number;
    timeoutSeconds: number;
    targetsPath: string;
  };
  deployedContract: {
    toolNames: string[];
    descriptions: Record<string, string | null>;
    asyncSequenceUnambiguous: boolean;
    discrepancies: string[];
  };
  latencyMs: {
    initialScanSite: Percentiles;
    statusCalls: Percentiles;
    bundleCalls: Percentiles;
    scanCompletion: Percentiles;
    endToEnd: Percentiles;
  };
  reliability: Record<string, number | null>;
  assessment: {
    passed: boolean;
    asyncArchitecturePassed: boolean;
    initialHoldEliminated: boolean;
    readyForBroaderTraffic: boolean;
    issues: string[];
  };
  cases: BenchmarkCaseResult[];
};

type Args = {
  endpoint: string;
  targetsPath: string;
  count: number | null;
  caseIds: string[];
  concurrency: number;
  timeoutSeconds: number;
  pollFallbackSeconds: number;
  interCaseDelaySeconds: number;
  outputJson: string;
  outputMarkdown: string;
  runId: string;
  dryRun: boolean;
  analyzeJson: string | null;
};

function numberArg(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--") continue;
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [inlineName, inlineValue] = token.split("=", 2);
    const name = inlineName.slice(2);
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}.`);
    values.set(name, value);
  }
  const runId = values.get("run-id") ?? new Date().toISOString().replace(/[:.]/g, "-");
  const outputJson = values.get("output-json") ?? `artifacts/mcp-light-gpt-benchmark/${runId}.json`;
  return {
    endpoint: values.get("endpoint") ?? DEFAULT_ENDPOINT,
    targetsPath: values.get("targets") ?? DEFAULT_TARGETS,
    count: values.has("count") ? Math.floor(numberArg(values.get("count"), 0, "count")) : null,
    caseIds: (values.get("case-ids") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    concurrency: Math.floor(numberArg(values.get("concurrency"), 1, "concurrency")),
    timeoutSeconds: numberArg(values.get("timeout-seconds"), 600, "timeout-seconds"),
    pollFallbackSeconds: numberArg(values.get("poll-fallback-seconds"), 5, "poll-fallback-seconds"),
    interCaseDelaySeconds: numberArg(values.get("inter-case-delay-seconds"), 2, "inter-case-delay-seconds"),
    outputJson,
    outputMarkdown: values.get("output-markdown") ?? outputJson.replace(/\.json$/i, ".md"),
    runId,
    dryRun,
    analyzeJson: values.get("analyze-json") ?? null,
  };
}

function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toolPayload(value: Record<string, any>) {
  const structured = record(value.structuredContent);
  if (Object.keys(structured).length > 0) return structured;
  const text = Array.isArray(value.content)
    ? value.content.find((item: unknown) => record(item).type === "text" && typeof record(item).text === "string")
    : null;
  try {
    return text ? record(JSON.parse(record(text).text)) : {};
  } catch {
    return {};
  }
}

function toolTextContent(value: Record<string, any>) {
  if (!Array.isArray(value.content)) return null;
  const block = value.content.find((item: unknown) => record(item).type === "text" && typeof record(item).text === "string");
  return block ? text(record(block).text) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function retryDelaySeconds(payload: Record<string, any>, fallback: number) {
  const candidate = numeric(payload.retryAfterSeconds) ?? numeric(record(payload.error).retryAfterSeconds);
  return candidate === null ? fallback : Math.min(120, Math.max(1, Math.ceil(candidate)));
}

function errorDetails(error: unknown) {
  const value = record(error);
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    code: typeof value.code === "string" || typeof value.code === "number" ? value.code : null,
  };
}

export function percentile(values: number[], rank: number): number | null {
  const usable = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (usable.length === 0) return null;
  const index = Math.min(usable.length - 1, Math.max(0, Math.ceil((rank / 100) * usable.length) - 1));
  return usable[index]!;
}

export function summarizeLatency(values: Array<number | null>): Percentiles {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    count: usable.length,
    min: percentile(usable, 0),
    p50: percentile(usable, 50),
    p90: percentile(usable, 90),
    p95: percentile(usable, 95),
    p99: percentile(usable, 99),
    max: percentile(usable, 100),
  };
}

export function classifyInitial(payload: Record<string, any>, isError: boolean) {
  const status = text(payload.status);
  const code = text(record(payload.error).code) ?? text(payload.code);
  if (status === "invalid_arguments" || code?.includes("invalid") || code === "unsupported_scheme" || code === "private_target") return "invalid_error";
  if (status === "rate_limited" || code?.includes("quota") || code?.includes("rate") || code?.includes("capacity")) return "admission_limited";
  if (isError) return "mcp_tool_error";
  if (USABLE_STATUSES.has(status ?? "") && (payload.reused === true || payload.executionMode === "reused_scan" || record(payload.provenance).creationDecision === "reused_recent_scan")) return "immediate_completed_reuse";
  if (USABLE_STATUSES.has(status ?? "")) return "immediate_completed";
  if (ACTIVE_STATUSES.has(status ?? "")) return "new_pending_scan";
  return "unexpected_result";
}

function normalizedHost(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^www\./, "");
  }
}

export function bundleMatchesTarget(bundle: Record<string, any>, initial: Record<string, any>, target: BenchmarkTarget) {
  const bundleScanId = text(bundle.scanId) ?? text(bundle.scan_id);
  const initialScanId = text(initial.scanId) ?? text(initial.scan_id);
  const scanIdMatched = Boolean(bundleScanId && initialScanId && bundleScanId === initialScanId);
  const expectedHost = normalizedHost(initial.domain)
    ?? normalizedHost(record(initial.demoSubstitution).effectiveUrl)
    ?? normalizedHost(target.target);
  const bundleHost = normalizedHost(bundle.domain) ?? normalizedHost(bundle.url);
  return {
    scanIdMatched,
    targetMatched: Boolean(expectedHost && bundleHost && expectedHost === bundleHost),
  };
}

function guidanceChecks(tools: Array<Record<string, any>>) {
  const byName = new Map(tools.map((tool) => [String(tool.name), tool]));
  const scan = text(byName.get("certscore_scan_site")?.description) ?? "";
  const status = text(byName.get("certscore_get_scan_status")?.description) ?? "";
  const bundle = text(byName.get("certscore_get_scan_bundle")?.description) ?? "";
  return {
    toolSet: ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"].every((name) => byName.has(name)),
    scanReturnsBoundedPreview: /runtime lane completes or reaches its six-second checkpoint/i.test(scan) &&
      /trackingVendorCount excludes infrastructure, security, and consent-management vendors/i.test(scan) &&
      /capped at approximately 9–11 seconds total/i.test(scan) &&
      /falls back to the stable scanId without a preview/i.test(scan),
    scanDirectsStatus: /retryAfterSeconds/.test(scan) && /certscore_get_scan_status/.test(scan),
    noResubmit: /do not resubmit certscore_scan_site/i.test(scan) && /never resubmit certscore_scan_site/i.test(status),
    noParallelPolling: /never poll in parallel/i.test(status),
    statusDirectsBundle: /completed or completed_limited, call certscore_get_scan_bundle/i.test(status),
    bundleRequiresCompletion: /after completed or completed_limited/i.test(bundle),
  };
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runCase(input: {
  endpoint: string;
  runId: string;
  target: BenchmarkTarget;
  timeoutSeconds: number;
  pollFallbackSeconds: number;
}): Promise<{ result: BenchmarkCaseResult; tools: Array<Record<string, any>> }> {
  const caseStarted = Date.now();
  const startedAt = new Date(caseStarted).toISOString();
  const clientIdentifier = `certscore-mcp-light-benchmark-${input.target.id}`.slice(0, 100);
  const httpObservations: HttpObservation[] = [];
  let currentOperation = "initialize";
  let closing = false;
  let disconnect = false;
  let mcpErrorCount = 0;
  let scanSiteCallCount = 0;
  const observedFetch = async (url: string | URL, init?: RequestInit) => {
    const requestStarted = Date.now();
    try {
      const response = await fetch(url, init);
      httpObservations.push({
        operation: currentOperation,
        method: init?.method ?? "GET",
        startedAt: new Date(requestStarted).toISOString(),
        durationMs: Date.now() - requestStarted,
        status: response.status,
        errorName: null,
        requestId: response.headers.get("x-request-id") ?? response.headers.get("x-amzn-trace-id") ?? response.headers.get("traceparent"),
        expectedAbortOnClose: false,
      });
      return response;
    } catch (error) {
      httpObservations.push({
        operation: currentOperation,
        method: init?.method ?? "GET",
        startedAt: new Date(requestStarted).toISOString(),
        durationMs: Date.now() - requestStarted,
        status: null,
        errorName: error instanceof Error ? error.name : "UnknownError",
        requestId: null,
        expectedAbortOnClose: closing && error instanceof Error && error.name === "AbortError",
      });
      throw error;
    }
  };
  const transport = new StreamableHTTPClientTransport(new URL(input.endpoint), { fetch: observedFetch });
  let observedSessionId: string | null = null;
  transport.onclose = () => { if (!closing) disconnect = true; };
  const client = new Client({ name: clientIdentifier, version: input.runId.slice(0, 40) });
  let initializationSuccess = false;
  let initializationLatencyMs: number | null = null;
  let toolDiscoverySuccess = false;
  let toolDiscoveryLatencyMs: number | null = null;
  let tools: Array<Record<string, any>> = [];
  let initial: Record<string, any> = {};
  let initialRaw: Record<string, any> = {};
  let scanSiteStartedAt: string | null = null;
  let initialResponseLatencyMs: number | null = null;
  let initialClassification = "not_attempted";
  let initialStatus: string | null = null;
  let initialPreConsentPreviewReturned = false;
  let initialPreviewCoverageStatus: string | null = null;
  let initialPreviewCookieCount: number | null = null;
  let initialPreviewTrackerCount: number | null = null;
  let initialTextContent: string | null = null;
  let scanId: string | null = null;
  let retryAfterSeconds: number | null = null;
  const statusPolls: PollObservation[] = [];
  let terminalStatus: string | null = null;
  let terminalReached = false;
  let scanCompletionTimeMs: number | null = null;
  let bundleAttempted = false;
  let bundleRetrieved = false;
  let bundleLatencyMs: number | null = null;
  let bundleScanIdMatched: boolean | null = null;
  let bundleTargetMatched: boolean | null = null;
  let finalResult = "not_started";
  let timeout = false;
  let caughtError: ReturnType<typeof errorDetails> | null = null;
  const deadline = caseStarted + input.timeoutSeconds * 1_000;

  try {
    const initializationStarted = Date.now();
    currentOperation = "initialize";
    await client.connect(transport);
    initializationLatencyMs = Date.now() - initializationStarted;
    initializationSuccess = true;
    observedSessionId = transport.sessionId ?? null;

    const discoveryStarted = Date.now();
    currentOperation = "tools/list";
    const discovered = await client.listTools(undefined, { timeout: 30_000 });
    toolDiscoveryLatencyMs = Date.now() - discoveryStarted;
    toolDiscoverySuccess = true;
    tools = discovered.tools.map((tool) => record(tool));

    const scanArguments: Record<string, unknown> = {};
    if (!input.target.omitTarget) scanArguments.url = input.target.target;
    if (input.target.freshness) scanArguments.freshness = input.target.freshness;
    if (input.target.scanFrom) scanArguments.scanFrom = input.target.scanFrom;
    if (input.target.legacyWait) {
      scanArguments.waitForCompletion = true;
      scanArguments.maxWaitSeconds = 45;
    }
    scanSiteCallCount += 1;
    const scanStarted = Date.now();
    scanSiteStartedAt = new Date(scanStarted).toISOString();
    currentOperation = "certscore_scan_site";
    try {
      initialRaw = record(await client.callTool(
        { name: "certscore_scan_site", arguments: scanArguments },
        undefined,
        { timeout: 60_000 },
      ));
      initialResponseLatencyMs = Date.now() - scanStarted;
      initial = toolPayload(initialRaw);
      initialTextContent = toolTextContent(initialRaw);
      initialClassification = classifyInitial(initial, initialRaw.isError === true);
      if (initialRaw.isError === true) mcpErrorCount += 1;
    } catch (error) {
      initialResponseLatencyMs = Date.now() - scanStarted;
      mcpErrorCount += 1;
      caughtError = errorDetails(error);
      initialClassification = caughtError.code === -32602 ? "invalid_error" : "mcp_protocol_error";
    }

    initialStatus = text(initial.status);
    const initialPreview = record(initial.preConsentPreview);
    const initialPreviewSummary = record(initialPreview.summary);
    initialPreConsentPreviewReturned = Object.keys(initialPreview).length > 0;
    initialPreviewCoverageStatus = text(record(initialPreview.runtimeCoverage).status);
    initialPreviewCookieCount = numeric(initialPreviewSummary.cookieCount);
    initialPreviewTrackerCount = numeric(initialPreviewSummary.trackerCount);
    scanId = text(initial.scanId) ?? text(initial.scan_id);
    retryAfterSeconds = numeric(initial.retryAfterSeconds) ?? numeric(record(initial.error).retryAfterSeconds);

    if (initialClassification === "invalid_error" || initialClassification === "admission_limited" || initialClassification.includes("error")) {
      finalResult = initialClassification;
    } else if (!scanId) {
      finalResult = "missing_scan_id";
    } else {
      let current = initial;
      let status = initialStatus;
      let nextDelay = retryDelaySeconds(current, input.pollFallbackSeconds);
      let previousPollStarted: number | null = null;
      while (status && ACTIVE_STATUSES.has(status)) {
        if (Date.now() + nextDelay * 1_000 > deadline) {
          timeout = true;
          finalResult = "benchmark_timeout";
          break;
        }
        const waitStarted = Date.now();
        await sleep(nextDelay * 1_000);
        const pollStarted = Date.now();
        currentOperation = "certscore_get_scan_status";
        const raw = record(await client.callTool(
          { name: "certscore_get_scan_status", arguments: { scanId } },
          undefined,
          { timeout: 60_000 },
        ));
        const latencyMs = Date.now() - pollStarted;
        const payload = toolPayload(raw);
        if (raw.isError === true) mcpErrorCount += 1;
        status = text(payload.status);
        statusPolls.push({
          index: statusPolls.length + 1,
          scheduledWaitSeconds: nextDelay,
          actualWaitMs: pollStarted - waitStarted,
          startedAt: new Date(pollStarted).toISOString(),
          latencyMs,
          spacingFromPreviousPollStartMs: previousPollStarted === null ? null : pollStarted - previousPollStarted,
          status,
          retryAfterSeconds: numeric(payload.retryAfterSeconds) ?? numeric(record(payload.error).retryAfterSeconds),
          isError: raw.isError === true,
        });
        previousPollStarted = pollStarted;
        current = payload;
        nextDelay = retryDelaySeconds(current, input.pollFallbackSeconds);
        if (raw.isError === true && status !== "rate_limited") {
          finalResult = "status_tool_error";
          break;
        }
      }
      terminalStatus = status;
      terminalReached = Boolean(status && TERMINAL_STATUSES.has(status));
      if (terminalReached) scanCompletionTimeMs = Date.now() - scanStarted;
      if (status && USABLE_STATUSES.has(status)) {
        bundleAttempted = true;
        const bundleStarted = Date.now();
        currentOperation = "certscore_get_scan_bundle";
        const bundleRaw = record(await client.callTool(
          { name: "certscore_get_scan_bundle", arguments: { scanId, detail: "summary" } },
          undefined,
          { timeout: 60_000 },
        ));
        bundleLatencyMs = Date.now() - bundleStarted;
        if (bundleRaw.isError === true) mcpErrorCount += 1;
        const bundle = toolPayload(bundleRaw);
        bundleRetrieved = bundleRaw.isError !== true && text(bundle.type) === "certscore_scan_bundle";
        const matches = bundleMatchesTarget(bundle, initial, input.target);
        bundleScanIdMatched = matches.scanIdMatched;
        bundleTargetMatched = matches.targetMatched;
        finalResult = bundleRetrieved && bundleScanIdMatched && bundleTargetMatched ? "success" : "bundle_validation_failed";
      } else if (terminalReached) {
        finalResult = `terminal_${status}`;
      } else if (!timeout && finalResult === "not_started") {
        finalResult = "non_terminal_unexpected_status";
      }
    }
  } catch (error) {
    caughtError = errorDetails(error);
    if (/timeout/i.test(caughtError.name) || /timed out/i.test(caughtError.message)) timeout = true;
    mcpErrorCount += 1;
    finalResult = timeout ? "benchmark_timeout" : "unhandled_mcp_error";
  } finally {
    currentOperation = "session_close";
    closing = true;
    try {
      if (transport.sessionId) await transport.terminateSession();
      await client.close();
    } catch {
      disconnect = true;
    }
  }

  const completedAt = new Date().toISOString();
  const checks = guidanceChecks(tools);
  const result: BenchmarkCaseResult = {
    id: input.target.id,
    category: input.target.category,
    target: input.target.omitTarget ? null : input.target.target ?? null,
    clientIdentifier,
    mcpSessionId: observedSessionId,
    startedAt,
    completedAt,
    initializationSuccess,
    initializationLatencyMs,
    toolDiscoverySuccess,
    toolDiscoveryLatencyMs,
    discoveredTools: tools.map((tool) => String(tool.name)).sort(),
    contractChecks: checks,
    scanSiteCallCount,
    scanSiteStartedAt,
    initialResponseLatencyMs,
    initialClassification,
    initialStatus,
    initialPreConsentPreviewReturned,
    initialPreviewCoverageStatus,
    initialPreviewCookieCount,
    initialPreviewTrackerCount,
    initialTextContent,
    scanId,
    retryAfterSeconds,
    legacyWaitParametersSent: input.target.legacyWait === true,
    statusPolls,
    parallelPollCount: 0,
    accidentalDuplicateScanCount: Math.max(0, scanSiteCallCount - 1),
    terminalStatus,
    terminalReached,
    scanCompletionTimeMs,
    bundleAttempted,
    bundleRetrieved,
    bundleLatencyMs,
    bundleScanIdMatched,
    bundleTargetMatched,
    totalEndToEndMs: Date.now() - caseStarted,
    finalResult,
    httpObservations,
    httpErrorCount: httpObservations.filter((observation) => !observation.expectedAbortOnClose && (observation.status === null || observation.status >= 400)).length,
    mcpErrorCount,
    timeout,
    disconnect,
    telemetryRecorded: "not_client_observable",
    telemetryCorrelation: { clientIdentifier, sessionId: observedSessionId, timeWindowStart: startedAt, timeWindowEnd: completedAt },
    error: caughtError,
  };
  return { result, tools };
}

function count(results: BenchmarkCaseResult[], predicate: (result: BenchmarkCaseResult) => boolean) {
  return results.filter(predicate).length;
}

export function buildReport(input: {
  runId: string;
  endpoint: string;
  startedAt: string;
  completedAt: string;
  targetsPath: string;
  concurrency: number;
  timeoutSeconds: number;
  pollFallbackSeconds: number;
  interCaseDelaySeconds: number;
  results: BenchmarkCaseResult[];
  tools: Array<Record<string, any>>;
}): BenchmarkReport {
  const checks = guidanceChecks(input.tools);
  const descriptions = Object.fromEntries(["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"].map((name) => {
    const tool = input.tools.find((candidate) => candidate.name === name);
    return [name, text(tool?.description)];
  }));
  const discrepancies: string[] = [];
  for (const [name, passed] of Object.entries(checks)) if (!passed) discrepancies.push(`Deployed guidance check failed: ${name}.`);
  const initialLatencies = input.results.map((result) => result.initialResponseLatencyMs);
  const pendingCases = input.results.filter((result) => result.initialClassification === "new_pending_scan");
  const reuseCases = input.results.filter((result) => result.initialClassification === "immediate_completed_reuse");
  const legacyCases = input.results.filter((result) => result.legacyWaitParametersSent);
  const pendingInitialP95 = summarizeLatency(pendingCases.map((result) => result.initialResponseLatencyMs)).p95;
  const unexpectedLongHolds = input.results.filter((result) => result.initialClassification === "new_pending_scan" && (result.initialResponseLatencyMs ?? 0) >= 20_000);
  const validCases = input.results.filter((result) => !result.category.includes("invalid") && result.category !== "problematic_input");
  const architectureIssues = [...discrepancies];
  if (pendingCases.length === 0) architectureIssues.push("No newly accepted pending scan was observed, so async creation was not exercised.");
  if (reuseCases.length === 0) architectureIssues.push("No immediate completed reuse was observed.");
  if (legacyCases.length === 0) architectureIssues.push("No legacy wait-parameter case was exercised.");
  if (legacyCases.some((result) => (result.initialResponseLatencyMs ?? Number.POSITIVE_INFINITY) >= 20_000)) architectureIssues.push("A legacy wait-parameter case held the initial tool call for at least 20 seconds.");
  if (unexpectedLongHolds.length > 0) architectureIssues.push(`${unexpectedLongHolds.length} pending scan-site calls took at least 20 seconds.`);
  if (input.results.some((result) => result.accidentalDuplicateScanCount > 0)) architectureIssues.push("The harness made an accidental duplicate scan submission.");
  if (input.results.some((result) => result.parallelPollCount > 0)) architectureIssues.push("The harness made parallel status polls.");
  if (!validCases.every((result) => result.finalResult === "success")) architectureIssues.push("One or more valid benchmark cases did not complete with a verified bundle.");
  const pollWaitViolationCount = input.results.flatMap((result) => result.statusPolls).filter((poll) => poll.actualWaitMs + 5 < poll.scheduledWaitSeconds * 1_000).length;
  if (pollWaitViolationCount > 0) architectureIssues.push(`${pollWaitViolationCount} status polls started before the instructed retry delay.`);
  const readinessIssues = [...architectureIssues];
  const acceptedProblematicInputs = input.results.filter((result) => result.category === "problematic_input" && Boolean(result.scanId));
  if (acceptedProblematicInputs.length > 0) readinessIssues.push(`${acceptedProblematicInputs.length} problematic input was accepted for scanning instead of being rejected before admission.`);
  return {
    schemaVersion: "certscore.mcp-light-gpt-benchmark.v1",
    runId: input.runId,
    endpoint: input.endpoint,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    configuration: {
      caseCount: input.results.length,
      concurrency: input.concurrency,
      interCaseDelaySeconds: input.interCaseDelaySeconds,
      pollFallbackSeconds: input.pollFallbackSeconds,
      timeoutSeconds: input.timeoutSeconds,
      targetsPath: input.targetsPath,
    },
    deployedContract: {
      toolNames: input.tools.map((tool) => String(tool.name)).sort(),
      descriptions,
      asyncSequenceUnambiguous: Object.values(checks).every(Boolean),
      discrepancies,
    },
    latencyMs: {
      initialScanSite: summarizeLatency(initialLatencies),
      statusCalls: summarizeLatency(input.results.flatMap((result) => result.statusPolls.map((poll) => poll.latencyMs))),
      bundleCalls: summarizeLatency(input.results.map((result) => result.bundleLatencyMs)),
      scanCompletion: summarizeLatency(input.results.map((result) => result.scanCompletionTimeMs)),
      endToEnd: summarizeLatency(input.results.map((result) => result.totalEndToEndMs)),
    },
    reliability: {
      caseCount: input.results.length,
      benchmarkSuccessCount: count(input.results, (result) => result.finalResult === "success" || result.initialClassification === "invalid_error"),
      initializationSuccessCount: count(input.results, (result) => result.initializationSuccess),
      toolDiscoverySuccessCount: count(input.results, (result) => result.toolDiscoverySuccess),
      scanCreationOrReuseSuccessCount: count(input.results, (result) => Boolean(result.scanId)),
      terminalCompletionCount: count(input.results, (result) => result.terminalReached),
      bundleRetrievalCount: count(input.results, (result) => result.bundleRetrieved),
      httpFailureCount: input.results.reduce((sum, result) => sum + result.httpErrorCount, 0),
      mcpFailureCount: input.results.reduce((sum, result) => sum + result.mcpErrorCount, 0),
      admissionRejectionCount: count(input.results, (result) => result.initialClassification === "admission_limited"),
      invalidInputCount: count(input.results, (result) => result.initialClassification === "invalid_error"),
      problematicInputAcceptedCount: acceptedProblematicInputs.length,
      immediateReuseCount: count(input.results, (result) => result.initialClassification === "immediate_completed_reuse"),
      pendingScanCount: count(input.results, (result) => result.initialClassification === "new_pending_scan"),
      initialPreConsentPreviewCount: count(input.results, (result) => result.initialPreConsentPreviewReturned),
      timeoutCount: count(input.results, (result) => result.timeout),
      disconnectCount: count(input.results, (result) => result.disconnect),
      accidentalDuplicateScanCount: input.results.reduce((sum, result) => sum + result.accidentalDuplicateScanCount, 0),
      parallelPollCount: input.results.reduce((sum, result) => sum + result.parallelPollCount, 0),
      pollWaitViolationCount,
      expectedValidationMcpErrorCount: input.results.reduce((sum, result) => sum + (result.initialClassification === "invalid_error" ? result.mcpErrorCount : 0), 0),
      unexpectedMcpFailureCount: input.results.reduce((sum, result) => sum + (result.initialClassification === "invalid_error" ? 0 : result.mcpErrorCount), 0),
      telemetryDeliveryFailureCount: null,
      telemetryClientObservableCount: 0,
      validCaseCount: validCases.length,
      validCaseSuccessCount: count(validCases, (result) => result.finalResult === "success"),
    },
    assessment: {
      passed: architectureIssues.length === 0,
      asyncArchitecturePassed: architectureIssues.length === 0,
      initialHoldEliminated: pendingInitialP95 !== null && pendingInitialP95 < 20_000 && unexpectedLongHolds.length === 0,
      readyForBroaderTraffic: readinessIssues.length === 0,
      issues: readinessIssues,
    },
    cases: input.results,
  };
}

function percent(value: number, total: number) {
  return total === 0 ? "n/a" : `${((value / total) * 100).toFixed(1)}%`;
}

function ms(value: number | null) {
  return value === null ? "n/a" : `${Math.round(value)}`;
}

function markdownCell(value: unknown) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderMarkdown(report: BenchmarkReport) {
  const reliability = report.reliability;
  const latencyRows = Object.entries(report.latencyMs).map(([name, values]) =>
    `| ${name} | ${values.count} | ${ms(values.min)} | ${ms(values.p50)} | ${ms(values.p90)} | ${ms(values.p95)} | ${ms(values.p99)} | ${ms(values.max)} |`
  );
  const caseRows = report.cases.map((row) => `| ${markdownCell(row.id)} | ${markdownCell(row.category)} | ${markdownCell(row.target)} | ${markdownCell(row.initialClassification)} | ${ms(row.initialResponseLatencyMs)} | ${row.initialPreConsentPreviewReturned ? `yes (${row.initialPreviewCookieCount ?? 0} cookies; ${row.initialPreviewTrackerCount ?? 0} trackers)` : "no"} | ${markdownCell(row.scanId)} | ${row.statusPolls.length} | ${ms(row.scanCompletionTimeMs)} | ${ms(row.bundleLatencyMs)} | ${markdownCell(row.finalResult)} |`);
  return [
    "# CertScore MCP Light GPT compatibility benchmark",
    "",
    `- Run: \`${report.runId}\``,
    `- Endpoint: ${report.endpoint}`,
    `- Window: ${report.startedAt} to ${report.completedAt}`,
    `- Cases: ${report.configuration.caseCount}; concurrency: ${report.configuration.concurrency}`,
    `- Assessment: **${report.assessment.passed ? "PASS" : "FAIL"}**`,
    `- Async initial hold eliminated: **${report.assessment.initialHoldEliminated ? "yes" : "no"}**`,
    `- Ready for broader traffic: **${report.assessment.readyForBroaderTraffic ? "yes" : "no"}**`,
    "",
    "## Executive summary",
    "",
    `Initialization succeeded for ${reliability.initializationSuccessCount}/${reliability.caseCount} cases (${percent(reliability.initializationSuccessCount, reliability.caseCount)}). Tool discovery succeeded for ${reliability.toolDiscoverySuccessCount}/${reliability.caseCount}. Valid cases completed with verified bundles in ${reliability.validCaseSuccessCount}/${reliability.validCaseCount} cases. Initial certscore_scan_site p95 was ${ms(report.latencyMs.initialScanSite.p95)} ms versus the previous roughly 40–44 second hold.`,
    "",
    "## Latency percentiles (milliseconds)",
    "",
    "| Metric | N | Min | P50 | P90 | P95 | P99 | Max |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...latencyRows,
    "",
    "## Reliability",
    "",
    ...Object.entries(reliability).map(([name, value]) => `- ${name}: ${value === null ? "not client-observable" : value}`),
    "",
    "## Deployed LLM guidance",
    "",
    `- Async sequence unambiguous: ${report.deployedContract.asyncSequenceUnambiguous ? "yes" : "no"}`,
    ...report.deployedContract.discrepancies.map((issue) => `- Discrepancy: ${issue}`),
    "",
    "## Cases",
    "",
    "| Case | Category | Target | Initial result | Initial ms | Preview | Scan ID | Polls | Completion ms | Bundle ms | Final |",
    "| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- |",
    ...caseRows,
    "",
    "## Exact initial MCP TextContent",
    "",
    ...report.cases.flatMap((row) => [
      `### ${row.id}`,
      "",
      `Target: ${row.target ?? "not supplied"}`,
      "",
      "```text",
      row.initialTextContent ?? "No initial TextContent returned.",
      "```",
      "",
    ]),
    "",
    "## Issues",
    "",
    ...(report.assessment.issues.length ? report.assessment.issues.map((issue) => `- ${issue}`) : ["- None detected by the benchmark."]),
    "",
    "## Telemetry correlation",
    "",
    "Telemetry ingestion is intentionally not exposed to MCP clients. Each case records a unique clientIdentifier, MCP session ID, exact time window, HTTP statuses, and any request/trace header returned by the endpoint. Server-side telemetry delivery must be verified separately from retained logs; the benchmark does not claim delivery success without that evidence.",
    "",
  ].join("\n");
}

async function loadTargets(args: Args) {
  const parsed = JSON.parse(await readFile(args.targetsPath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Target configuration must be a JSON array.");
  const targets = parsed as BenchmarkTarget[];
  for (const target of targets) {
    if (!target.id || !target.category) throw new Error("Every target requires id and category.");
    if (!target.omitTarget && !target.target) throw new Error(`Target ${target.id} requires target or omitTarget=true.`);
  }
  const selected = args.caseIds.length === 0 ? targets : targets.filter((target) => args.caseIds.includes(target.id));
  if (args.caseIds.length > 0 && selected.length !== new Set(args.caseIds).size) {
    throw new Error("One or more --case-ids values were not found in the target configuration.");
  }
  return args.count === null ? selected : selected.slice(0, args.count);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.concurrency < 1 || args.concurrency > 2) throw new Error("concurrency must be 1 or 2; the benchmark intentionally refuses higher production load.");
  if (args.analyzeJson) {
    const previous = JSON.parse(await readFile(args.analyzeJson, "utf8")) as BenchmarkReport;
    const tools = Object.entries(previous.deployedContract.descriptions).map(([name, description]) => ({ name, description }));
    const report = buildReport({
      runId: previous.runId,
      endpoint: previous.endpoint,
      startedAt: previous.startedAt,
      completedAt: previous.completedAt,
      targetsPath: previous.configuration.targetsPath,
      concurrency: previous.configuration.concurrency,
      timeoutSeconds: previous.configuration.timeoutSeconds,
      pollFallbackSeconds: previous.configuration.pollFallbackSeconds,
      interCaseDelaySeconds: previous.configuration.interCaseDelaySeconds,
      results: previous.cases,
      tools,
    });
    await mkdir(path.dirname(args.outputJson), { recursive: true });
    await mkdir(path.dirname(args.outputMarkdown), { recursive: true });
    await writeFile(args.outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(args.outputMarkdown, renderMarkdown(report), "utf8");
    console.log(JSON.stringify({ assessment: report.assessment, outputJson: args.outputJson, outputMarkdown: args.outputMarkdown }, null, 2));
    return;
  }
  const targets = await loadTargets(args);
  if (args.dryRun) {
    console.log(JSON.stringify({ ...args, targets }, null, 2));
    return;
  }
  const startedAt = new Date().toISOString();
  const results: BenchmarkCaseResult[] = [];
  let deployedTools: Array<Record<string, any>> = [];
  let cursor = 0;
  const workers = Array.from({ length: args.concurrency }, async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++]!;
      console.error(`[mcp-light-benchmark] starting ${target.id} (${target.category})`);
      const outcome = await runCase({
        endpoint: args.endpoint,
        runId: args.runId,
        target,
        timeoutSeconds: args.timeoutSeconds,
        pollFallbackSeconds: args.pollFallbackSeconds,
      });
      results.push(outcome.result);
      if (deployedTools.length === 0 && outcome.tools.length > 0) deployedTools = outcome.tools;
      console.error(`[mcp-light-benchmark] ${target.id}: ${outcome.result.finalResult}; initial=${outcome.result.initialResponseLatencyMs ?? "n/a"}ms; polls=${outcome.result.statusPolls.length}`);
      if (cursor < targets.length) await sleep(args.interCaseDelaySeconds * 1_000);
    }
  });
  await Promise.all(workers);
  results.sort((left, right) => targets.findIndex((target) => target.id === left.id) - targets.findIndex((target) => target.id === right.id));
  const report = buildReport({
    runId: args.runId,
    endpoint: args.endpoint,
    startedAt,
    completedAt: new Date().toISOString(),
    targetsPath: args.targetsPath,
    concurrency: args.concurrency,
    timeoutSeconds: args.timeoutSeconds,
    pollFallbackSeconds: args.pollFallbackSeconds,
    interCaseDelaySeconds: args.interCaseDelaySeconds,
    results,
    tools: deployedTools,
  });
  await mkdir(path.dirname(args.outputJson), { recursive: true });
  await mkdir(path.dirname(args.outputMarkdown), { recursive: true });
  await writeFile(args.outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(args.outputMarkdown, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({
    assessment: report.assessment,
    caseCount: report.configuration.caseCount,
    initialScanSiteLatencyMs: report.latencyMs.initialScanSite,
    outputJson: args.outputJson,
    outputMarkdown: args.outputMarkdown,
    reliability: report.reliability,
    runId: report.runId,
  }, null, 2));
  if (!report.assessment.passed) process.exitCode = 1;
}

if (/mcp-light-gpt-benchmark\.(?:ts|js)$/.test(path.basename(process.argv[1] ?? ""))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
