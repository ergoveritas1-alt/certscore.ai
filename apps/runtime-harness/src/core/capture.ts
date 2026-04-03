import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyRun, summarizeVendors } from "./classify";
import {
  buildCnameCandidates,
  buildCnameObservations,
  buildConsentSummary,
  buildConsentVisualSummary,
  buildCookieWriteObservations,
  buildFingerprintingSummary,
  buildFingerprintApiEventSamples,
  buildKeyloggingSummary,
  buildMediaSummary,
  buildNavigationSummary,
  buildNetworkSummary,
  buildRequestObservations,
  buildRequestToVendorObservations,
  buildStorageSummary,
  buildVendorSummaryExtended,
  buildUiSummary,
  buildConsentSignalTimingSummary,
  buildCookieDetections,
  buildCookieDiffs,
  buildCookieRiskSummary,
  buildDomainVendorRegistry,
  buildLeakMap,
  buildPreConsentTimeline,
  buildPreConsentVendorSummary,
  buildVendorLeaderboard,
  buildRunQualitySummary
} from "./evidence";
import { buildSignalFindings } from "./findings";
import { buildFindingPacket } from "./finding-packet";
import { buildTimingSummary } from "./timings";
import type {
  BrowserObservationCollectorSnapshot,
  CnameCloakRecord,
  ConsoleLevel,
  ConsoleRecord,
  ConsentSummary,
  ConsentVisualSummary,
  ConsentUiSummary,
  CookieRecord,
  CookieWriteObservation,
  CookieSnapshot,
  FingerprintingCollectorSnapshot,
  LeakMapRecord,
  MainDocumentSummary,
  MediaSummary,
  NavigationSummary,
  NetworkSummary,
  NavigationOutcome,
  PageErrorRecord,
  PageSnapshotSummary,
  PostRejectPersistenceSummary,
  PreConsentRequestRecord,
  RedirectRecord,
  RequestObservation,
  RequestToVendorObservation,
  RequestRecord,
  ResponseRecord,
  RunStopSummary,
  RuntimeCapabilities,
  RuntimeLogger,
  RuntimeMode,
  RuntimeOptions,
  RuntimeRunResult,
  UnifiedRuntime
} from "./types";

const COOKIE_CHECKPOINTS = [
  { label: "0.5s", ms: 500 },
  { label: "2s", ms: 2_000 },
  { label: "5s", ms: 5_000 },
  { label: "10s", ms: 10_000 }
] as const;

function preview(value: string) {
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export type MutableArtifacts = {
  bodyTextExcerpt: string | null;
  browserCollector: BrowserObservationCollectorSnapshot | null;
  capabilities: RuntimeCapabilities;
  cnameCloaking: CnameCloakRecord[];
  consoleMessages: ConsoleRecord[];
  consentUi: ConsentUiSummary;
  cookieSnapshots: CookieSnapshot[];
  domContentLoadedTimestampMs: number | null;
  errors: string[];
  finalUrl: string | null;
  fingerprintingCollector: FingerprintingCollectorSnapshot | null;
  hadDomContentLoaded: boolean;
  htmlSnapshotPath: string | null;
  leakMap: LeakMapRecord[];
  mainDocument: MainDocumentSummary;
  navigationOutcome: NavigationOutcome;
  pageErrors: PageErrorRecord[];
  pageSnapshotSummary: PageSnapshotSummary | null;
  postRejectPersistence: PostRejectPersistenceSummary | null;
  preConsentTimeline: PreConsentRequestRecord[];
  redirectChain: RedirectRecord[];
  requests: RequestRecord[];
  responses: ResponseRecord[];
  screenshotPath: string | null;
  stopSummary: RunStopSummary;
  title: string | null;
};

export type RuntimeHarnessContext = {
  addConsoleMessage(entry: { level: ConsoleLevel; text: string }): void;
  addCookieSnapshot(label: CookieSnapshot["label"], cookies: CookieRecord[]): void;
  addError(message: string): void;
  addPageError(error: { message: string; stack?: string | null }): void;
  addRedirect(entry: Omit<RedirectRecord, "timestampMs">): void;
  addRequest(entry: Omit<RequestRecord, "timestampMs">): void;
  addResponse(entry: Omit<ResponseRecord, "timestampMs">): void;
  markCnameCloaking(records: CnameCloakRecord[]): void;
  markConsentUi(update: Partial<ConsentUiSummary>): void;
  markLeakMap(records: LeakMapRecord[]): void;
  markPostRejectPersistence(summary: PostRejectPersistenceSummary | null): void;
  markPreConsentTimeline(records: PreConsentRequestRecord[]): void;
  markStopSummary(summary: RunStopSummary): void;
  logger: RuntimeLogger;
  markDomContentLoaded(): void;
  markFinalUrl(url: string | null): void;
  markBrowserCollector(snapshot: BrowserObservationCollectorSnapshot | null): void;
  markFingerprintingCollector(snapshot: FingerprintingCollectorSnapshot | null): void;
  markMainDocument(update: Partial<MainDocumentSummary>): void;
  markNavigationOutcome(outcome: NavigationOutcome): void;
  markTitle(title: string | null): void;
  noteBodyTextExcerpt(text: string | null): void;
  notePageSnapshotSummary(summary: PageSnapshotSummary | null): void;
  noteHtmlSnapshotPath(filePath: string | null): void;
  noteScreenshotPath(filePath: string | null): void;
  readonly artifacts: MutableArtifacts;
  outputDir: string;
  requestedUrl: string;
  runtimeMode: RuntimeMode;
  runtimeOptions: RuntimeOptions;
  runtimeStartedAt: number;
  timeSinceStart(): number;
};

export type RuntimeFactory = (input: { context: RuntimeHarnessContext; options: RuntimeOptions }) => UnifiedRuntime;

export function createArtifacts(capabilities: RuntimeCapabilities): MutableArtifacts {
  return {
    bodyTextExcerpt: null,
    browserCollector: null,
    capabilities,
    cnameCloaking: [],
    consoleMessages: [],
    consentUi: {
      acceptPresent: false,
      detected: false,
      firstDetectedTimestampMs: null,
      managePresent: false,
      rejectPresent: false,
      selectorHint: null,
      textSnippet: null
    },
    cookieSnapshots: [],
    domContentLoadedTimestampMs: null,
    errors: [],
    finalUrl: null,
    fingerprintingCollector: null,
    hadDomContentLoaded: false,
    htmlSnapshotPath: null,
    leakMap: [],
    mainDocument: {
      headers: null,
      setCookieHeaders: null,
      status: null,
      url: null
    },
    navigationOutcome: "error",
    pageErrors: [],
    pageSnapshotSummary: null,
    postRejectPersistence: null,
    preConsentTimeline: [],
    redirectChain: [],
    requests: [],
    responses: [],
    screenshotPath: null,
    stopSummary: {
      detail: null,
      reason: "snapshot_fallback",
      timestampMs: null
    },
    title: null
  };
}

function normalizeCookies(cookies: CookieRecord[]) {
  return cookies
    .slice()
    .sort((left, right) => `${left.domain ?? ""}:${left.name}`.localeCompare(`${right.domain ?? ""}:${right.name}`));
}

export function createHarnessContext(input: {
  artifacts: MutableArtifacts;
  logger: RuntimeLogger;
  outputDir: string;
  requestedUrl: string;
  runtimeMode: RuntimeMode;
  runtimeOptions: RuntimeOptions;
  startedAt: number;
}): RuntimeHarnessContext {
  let firstThirdPartyLogged = false;
  return {
    addConsoleMessage(entry) {
      input.artifacts.consoleMessages.push({
        level: entry.level,
        text: entry.text,
        timestampMs: Date.now() - input.startedAt
      });
    },
    addCookieSnapshot(label, cookies) {
      input.artifacts.cookieSnapshots.push({
        cookieCount: cookies.length,
        cookies: normalizeCookies(cookies),
        label,
        timestampMs: Date.now() - input.startedAt
      });
    },
    addError(message) {
      input.artifacts.errors.push(message);
    },
    addPageError(error) {
      input.artifacts.pageErrors.push({
        message: error.message,
        stack: error.stack ?? null,
        timestampMs: Date.now() - input.startedAt
      });
    },
    addRedirect(entry) {
      input.artifacts.redirectChain.push({
        from: entry.from,
        status: entry.status,
        timestampMs: Date.now() - input.startedAt,
        to: entry.to
      });
    },
    addRequest(entry) {
      input.artifacts.requests.push({
        ...entry,
        timestampMs: Date.now() - input.startedAt
      });
      const requestHost = hostnameFromUrl(entry.url);
      const requestedHost = hostnameFromUrl(input.requestedUrl);
      if (!firstThirdPartyLogged && requestHost && requestedHost && requestHost !== requestedHost && !requestHost.endsWith(`.${requestedHost}`)) {
        firstThirdPartyLogged = true;
        input.logger.log(`[${input.runtimeMode}] first third-party request ${entry.url}`);
      }
    },
    addResponse(entry) {
      input.artifacts.responses.push({
        ...entry,
        timestampMs: Date.now() - input.startedAt
      });
    },
    markCnameCloaking(records) {
      input.artifacts.cnameCloaking = records;
    },
    markConsentUi(update) {
      input.artifacts.consentUi = {
        ...input.artifacts.consentUi,
        ...update
      };
    },
    markLeakMap(records) {
      input.artifacts.leakMap = records;
    },
    markPostRejectPersistence(summary) {
      input.artifacts.postRejectPersistence = summary;
    },
    markPreConsentTimeline(records) {
      input.artifacts.preConsentTimeline = records;
    },
    markStopSummary(summary) {
      input.artifacts.stopSummary = summary;
    },
    logger: input.logger,
    markDomContentLoaded() {
      input.artifacts.domContentLoadedTimestampMs ??= Date.now() - input.startedAt;
      input.artifacts.hadDomContentLoaded = true;
      input.logger.log(`[${input.runtimeMode}] domcontentloaded`);
    },
    markFinalUrl(url) {
      input.artifacts.finalUrl = url;
    },
    markBrowserCollector(snapshot) {
      input.artifacts.browserCollector = snapshot;
    },
    markFingerprintingCollector(snapshot) {
      input.artifacts.fingerprintingCollector = snapshot;
    },
    markMainDocument(update) {
      input.artifacts.mainDocument = {
        ...input.artifacts.mainDocument,
        ...update
      };
      if (typeof update.status === "number") {
        input.logger.log(`[${input.runtimeMode}] main document response ${update.status}`);
      }
    },
    markNavigationOutcome(outcome) {
      input.artifacts.navigationOutcome = outcome;
    },
    markTitle(title) {
      if (!input.artifacts.title && title) {
        input.logger.log(`[${input.runtimeMode}] title available ${preview(title)}`);
      }
      input.artifacts.title = title;
    },
    noteBodyTextExcerpt(text) {
      input.artifacts.bodyTextExcerpt = text;
    },
    notePageSnapshotSummary(summary) {
      input.artifacts.pageSnapshotSummary = summary;
    },
    noteHtmlSnapshotPath(filePath) {
      input.artifacts.htmlSnapshotPath = filePath;
    },
    noteScreenshotPath(filePath) {
      input.artifacts.screenshotPath = filePath;
    },
    artifacts: input.artifacts,
    outputDir: input.outputDir,
    requestedUrl: input.requestedUrl,
    runtimeMode: input.runtimeMode,
    runtimeOptions: input.runtimeOptions,
    runtimeStartedAt: input.startedAt,
    timeSinceStart() {
      return Date.now() - input.startedAt;
    }
  };
}

export function finalizeResult(input: {
  artifacts: MutableArtifacts;
  bodyTextExcerpt: string | null;
  finalUrl: string | null;
  htmlSnapshotPath: string | null;
  requestedUrl: string;
  runtimeMode: RuntimeMode;
  runtimeOptions: RuntimeOptions;
  runtimeStartedAt: number;
  screenshotPath: string | null;
  title: string | null;
  wallTimeMs: number;
}) {
  const vendorSummary = summarizeVendors({
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests,
    responses: input.artifacts.responses
  });
  const classification = classifyRun({
    bodyTextExcerpt: input.bodyTextExcerpt,
    consoleMessages: input.artifacts.consoleMessages,
    errors: input.artifacts.errors,
    finalUrl: input.finalUrl,
    hadDomContentLoaded: input.artifacts.hadDomContentLoaded,
    mainDocument: input.artifacts.mainDocument,
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests,
    responses: input.artifacts.responses,
    title: input.title,
    vendorSummary
  });

  const cookiesBeforeConsent = buildCookieDetections(input.artifacts.cookieSnapshots);
  const cookieDiffs = buildCookieDiffs(input.artifacts.cookieSnapshots);
  const preConsentTimeline =
    input.artifacts.preConsentTimeline.length > 0
      ? input.artifacts.preConsentTimeline
      : buildPreConsentTimeline({
          consentUi: input.artifacts.consentUi,
          requests: input.artifacts.requests,
          requestedUrl: input.requestedUrl
        });
  const preConsentVendorSummary = buildPreConsentVendorSummary(preConsentTimeline);
  const domainVendorRegistry = buildDomainVendorRegistry({
    cnameCloaking: input.artifacts.cnameCloaking,
    consentUi: input.artifacts.consentUi,
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests,
    responses: input.artifacts.responses
  });
  const timings = buildTimingSummary({
    consentUiFirstDetectedTimestampMs: input.artifacts.consentUi.firstDetectedTimestampMs,
    cookiesBeforeConsent,
    requests: input.artifacts.requests,
    responses: input.artifacts.responses,
    wallTimeMs: input.wallTimeMs
  });
  const consentSignalTiming = buildConsentSignalTimingSummary({
    consentUi: input.artifacts.consentUi,
    timings
  });
  const cookieRiskSummary = buildCookieRiskSummary({
    consentUi: input.artifacts.consentUi,
    cookies: cookiesBeforeConsent,
    timings
  });
  const runtimeMetadata = {
    autoEscalated: false,
    browserFamily:
      input.runtimeMode === "playwright-local" || input.runtimeMode === "playwright-cdp" || input.runtimeMode === "playwright-remote-cdp"
        ? "chromium"
        : "chrome",
    browserVersion: null,
    mode: input.runtimeMode,
    observeBudgetMs: input.runtimeOptions.observeMs,
    timeoutMs: input.runtimeOptions.timeoutMs,
    userAgent: input.runtimeOptions.userAgent
  } as const;
  const runQualitySummary = buildRunQualitySummary({
    classification,
    cookieRiskSummary,
    domainVendorRegistry,
    runtimeMetadata,
    stopReason: input.artifacts.stopSummary.reason,
    timings
  });
  const vendorLeaderboard = buildVendorLeaderboard({
    domainVendorRegistry,
    preConsentVendorSummary
  });
  const networkSummary = buildNetworkSummary({
    consentUi: input.artifacts.consentUi,
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests,
    responses: input.artifacts.responses
  });
  const requestObservations = buildRequestObservations({
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests,
    responses: input.artifacts.responses
  });
  const vendorSummaryExtended = buildVendorSummaryExtended({
    browserCollector: input.artifacts.browserCollector,
    consentUi: input.artifacts.consentUi,
    domainVendorRegistry,
    requestedUrl: input.requestedUrl
  });
  const requestToVendorObservations = buildRequestToVendorObservations({
    consentUi: input.artifacts.consentUi,
    domainVendorRegistry
  });
  const keyloggingSummary = buildKeyloggingSummary({
    browserCollector: input.artifacts.browserCollector,
    requestObservations,
    requestToVendorObservations
  });
  const fingerprinting = buildFingerprintingSummary({
    collector: input.artifacts.fingerprintingCollector,
    consentUi: input.artifacts.consentUi,
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests
  });
  const pageSnapshotSummary = input.artifacts.pageSnapshotSummary;
  const consentSummary = buildConsentSummary({
    browserCollector: input.artifacts.browserCollector,
    consentUi: input.artifacts.consentUi,
    pageSnapshotSummary
  });
  const consentVisual = buildConsentVisualSummary({
    consentSummary,
    pageSnapshotSummary
  });
  const uiSummary = buildUiSummary({
    browserCollector: input.artifacts.browserCollector,
    consentSummary,
    pageSnapshotSummary
  });
  const storageSummary = buildStorageSummary({
    browserCollector: input.artifacts.browserCollector,
    consentUi: input.artifacts.consentUi,
    cookieSnapshots: input.artifacts.cookieSnapshots,
    requestedUrl: input.requestedUrl,
    responses: input.artifacts.responses
  });
  const cookieWriteObservations = buildCookieWriteObservations({
    browserCollector: input.artifacts.browserCollector,
    consentUi: input.artifacts.consentUi,
    cookieSnapshots: input.artifacts.cookieSnapshots,
    requestedUrl: input.requestedUrl,
    responses: input.artifacts.responses
  });
  const fingerprintApiEventSamples = buildFingerprintApiEventSamples(input.artifacts.fingerprintingCollector);
  const mediaSummary = buildMediaSummary({
    browserCollector: input.artifacts.browserCollector,
    consentUi: input.artifacts.consentUi,
    pageSnapshotSummary
  });
  const navigationSummary = buildNavigationSummary({
    browserCollector: input.artifacts.browserCollector,
    finalUrl: input.finalUrl,
    redirectChain: input.artifacts.redirectChain,
    requestedUrl: input.requestedUrl,
    pageSnapshotSummary
  });
  const cnameCandidates = buildCnameCandidates({
    requestedUrl: input.requestedUrl,
    requests: input.artifacts.requests
  });
  const cnameObservations = buildCnameObservations(input.artifacts.cnameCloaking);

  const result = {
    browserCollector: input.artifacts.browserCollector,
    bodyTextExcerpt: input.bodyTextExcerpt,
    capabilities: input.artifacts.capabilities,
    cnameCandidates,
    cnameCloaking: input.artifacts.cnameCloaking,
    cnameObservations,
    classification,
    consoleMessages: input.artifacts.consoleMessages,
    consentSummary,
    consentVisual,
    consentUi: input.artifacts.consentUi,
    consentSignalTiming,
    cookiesBeforeConsent,
    cookieRiskSummary,
    cookieWriteObservations,
    cookieDiffs,
    cookieSnapshots: input.artifacts.cookieSnapshots,
    domainVendorRegistry,
    errors: input.artifacts.errors,
    finalUrl: input.finalUrl,
    fingerprintApiEventSamples,
    fingerprinting,
    findings: buildSignalFindings({
      consentUi: input.artifacts.consentUi,
      cookiesBeforeConsent,
      fingerprinting,
      preConsentTimeline,
      preConsentVendorSummary,
      vendorSummary
    }),
    htmlSnapshotPath: input.htmlSnapshotPath,
    keyloggingSummary,
    leakMap: input.artifacts.leakMap.length > 0 ? input.artifacts.leakMap : buildLeakMap({ requestedUrl: input.requestedUrl, requests: input.artifacts.requests }),
    mainDocument: input.artifacts.mainDocument,
    mediaSummary,
    mode: input.runtimeMode,
    navigationOutcome: input.artifacts.navigationOutcome,
    navigationSummary,
    networkSummary,
    outputDir: path.dirname(input.screenshotPath ?? input.htmlSnapshotPath ?? ""),
    pageErrors: input.artifacts.pageErrors,
    pageSnapshotSummary,
    postRejectPersistence: input.artifacts.postRejectPersistence,
    preConsentTimeline,
    preConsentVendorSummary,
    redirectChain: input.artifacts.redirectChain,
    requestedUrl: input.requestedUrl,
    requestObservations,
    requestToVendorObservations,
    requests: input.artifacts.requests,
    runQualitySummary,
    runtimeMetadata,
    responses: input.artifacts.responses,
    screenshotPath: input.screenshotPath,
    storageSummary,
    stopSummary: input.artifacts.stopSummary,
    thirdPartyDomainCount: vendorSummary.rawDomains.length,
    timings,
    timestamp: new Date(input.runtimeStartedAt).toISOString(),
    title: input.title,
    uiSummary,
    vendorLeaderboard,
    vendorSummary,
    vendorSummaryExtended,
    wallTimeMs: input.wallTimeMs
  } satisfies Omit<RuntimeRunResult, "findingPacket">;

  return {
    ...result,
    findingPacket: buildFindingPacket(result)
  } satisfies RuntimeRunResult;
}

export async function writeSupportFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function executeMode(input: {
  logger: RuntimeLogger;
  mode: RuntimeMode;
  options: RuntimeOptions;
  requestedUrl: string;
  runtimeFactory: RuntimeFactory;
}): Promise<RuntimeRunResult> {
  const startedAt = Date.now();
  const outputDir = path.join(input.options.outputDir, input.mode);
  await mkdir(outputDir, { recursive: true });
  const artifacts = createArtifacts({
    consoleMessages: true,
    htmlSnapshot: true,
    mainDocumentHeaders: true,
    pageErrors: true,
    requestEvents: true,
    responseEvents: true
  });
  const context = createHarnessContext({
    artifacts,
    logger: input.logger,
    outputDir,
    requestedUrl: input.requestedUrl,
    runtimeMode: input.mode,
    runtimeOptions: input.options,
    startedAt
  });

  const runtime = input.runtimeFactory({ context, options: input.options });
  let timedOut = false;

  try {
    input.logger.log(`[${input.mode}] navigation start ${input.requestedUrl}`);
    await Promise.race([
      (async () => {
        await runtime.init();
        await runtime.navigate(input.requestedUrl);
        await runtime.observe(input.options.observeMs);
      })(),
      new Promise<void>((_, reject) => {
        const handle = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Mode exceeded ${input.options.timeoutMs} ms timeout.`));
        }, input.options.timeoutMs);
        void handle;
      })
    ]);
  } catch (error) {
    context.addError(error instanceof Error ? error.message : String(error));
    context.markNavigationOutcome(timedOut ? "timeout" : "error");
    context.markStopSummary({
      detail: error instanceof Error ? error.message : String(error),
      reason: timedOut ? "timeout" : "navigation_error",
      timestampMs: context.timeSinceStart()
    });
  }

  const snapshot = await runtime.snapshot().catch((error) => {
    context.addError(`Snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });

  if (snapshot) {
    await runtime.close().catch(() => undefined);
    return snapshot;
  }

  await runtime.close().catch(() => undefined);
  if (artifacts.stopSummary.reason === "snapshot_fallback" && artifacts.stopSummary.detail === null) {
    context.markStopSummary({
      detail: "Snapshot fallback finalized without runtime snapshot output.",
      reason: "snapshot_fallback",
      timestampMs: context.timeSinceStart()
    });
  }
  const result = finalizeResult({
    artifacts,
    bodyTextExcerpt: artifacts.bodyTextExcerpt,
    finalUrl: artifacts.finalUrl,
    htmlSnapshotPath: artifacts.htmlSnapshotPath,
    requestedUrl: input.requestedUrl,
    runtimeMode: input.mode,
    runtimeOptions: input.options,
    runtimeStartedAt: startedAt,
    screenshotPath: artifacts.screenshotPath,
    title: artifacts.title,
    wallTimeMs: Date.now() - startedAt
  });
  if (result.classification.challengeDetected) {
    input.logger.log(`[${input.mode}] challenge suspected ${result.classification.stopReason}`);
  }
  input.logger.log(`[${input.mode}] observation window ended`);
  return { ...result, outputDir };
}

export function cookieCheckpointsWithin(observeMs: number) {
  return COOKIE_CHECKPOINTS.filter((checkpoint) => checkpoint.ms <= observeMs);
}
