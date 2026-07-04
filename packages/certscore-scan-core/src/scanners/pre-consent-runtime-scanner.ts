import {
  type ArtifactRef,
  type CmpRuntimeObservation,
  type CollectionSurfaceObservation,
  type CookieEvent,
  type CookieSnapshot,
  type DomSnapshotArtifact,
  type IframeEvent,
  type NetworkEvent,
  type NetworkResponseEvent,
  type RuntimeEvidenceEvent,
  type ScanModuleRun,
  type ScreenshotArtifact,
  type SetCookieMetadata,
  type ScriptEvent,
  type StorageSnapshot,
  type TransportSecurityObservation,
  type ConsentUiObservation,
  type VisualCaptureSummary,
  classifyConsentControlLabel,
  isProductionCreditworthyPolishConsentControlClassification,
} from "@certscore/contracts";
import { resolveEndpointGeography, resolveVendorObservations, type VendorResolverInput } from "@certscore/vendor-resolver";
import { writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { chromium, type Browser, type BrowserContext, type Frame, type Page, type Request, type Response, type Route } from "playwright";
import type { ArtifactWriter } from "../artifact-writer.js";
import {
  captureConsentControlGeometry,
  type ConsentControlGeometryArtifact,
} from "../consent-control-geometry.js";
import {
  buildConsentGeometryEgressDiagnostic,
  classifyConsentGeometryAccess,
  collectConsentGeometryPageAccess,
} from "../consent-geometry-access.js";
import {
  classifyCookieParty,
  classifyHostnameParty,
  getHostname,
  getRegistrableDomain,
  getRegistrableDomainFromUrl,
} from "../domain-utils.js";
import { chromiumContextOptions, chromiumLaunchOptions } from "../playwright-runtime.js";
import { maybeFulfillHeavyResource } from "../resource-stubbing.js";

const SOURCE_SCANNER = "pre_consent_runtime";
const SCENARIO = "fresh_pre_consent";
const ONE_PIXEL_TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export interface PreConsentRuntimeScannerInput {
  url: string;
  normalizedUrl: string;
  scanStartedAtMs: number;
  internalBudgetMs: number;
  artifactWriter: ArtifactWriter;
  browser?: Browser;
  browserMode?: "headless" | "headed";
  stubHeavyResources?: boolean;
  routeFulfillers?: FixtureRouteFulfiller[];
  screenshotCaptureMode?: "full_page_first" | "viewport_first";
  screenshotMode?: "always" | "selective" | "never";
  screenshotTimeoutMs?: number;
  waitMode?: "full" | "fast";
}

export interface FixtureRouteFulfiller {
  urlPattern: RegExp;
  status?: number;
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
  setCookieHeaders?: string[];
}

export interface PreConsentRuntimeScannerResult {
  moduleRun: ScanModuleRun;
  runtimeTimeline: RuntimeEvidenceEvent[];
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
  cookieEvents: CookieEvent[];
  cookieSnapshots: CookieSnapshot[];
  storageSnapshots: StorageSnapshot[];
  scriptEvents: ScriptEvent[];
  iframeEvents: IframeEvent[];
  consentUiObservations: ConsentUiObservation[];
  collectionSurfaceObservations: CollectionSurfaceObservation[];
  cmpRuntimeObservations: CmpRuntimeObservation[];
  transportSecurityObservations: TransportSecurityObservation[];
  screenshots: ScreenshotArtifact[];
  visualCapture: VisualCaptureSummary;
  domSnapshots: DomSnapshotArtifact[];
  artifactRefs: ArtifactRef[];
  vendorResolverInputs: VendorResolverInput[];
}

export async function preConsentRuntimeScanner(
  input: PreConsentRuntimeScannerInput,
): Promise<PreConsentRuntimeScannerResult> {
  const moduleStartedAtMs = Date.now();
  const moduleStartedAt = new Date(moduleStartedAtMs).toISOString();
  const remainingModuleBudgetMs = () => Math.max(0, input.internalBudgetMs - (Date.now() - moduleStartedAtMs));
  const timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]> = [];
  const firstPartyHostname = getHostname(input.normalizedUrl) ?? undefined;
  const firstPartyDomain = getRegistrableDomainFromUrl(input.normalizedUrl) ?? undefined;
  const networkEvents: NetworkEvent[] = [];
  const networkResponseEvents: NetworkResponseEvent[] = [];
  const cookieEvents: CookieEvent[] = [];
  const scriptEvents: ScriptEvent[] = [];
  const iframeEvents: IframeEvent[] = [];
  const browserApiAccessEvents: RuntimeEvidenceEvent[] = [];
  const failedHttpRequests: Array<{ url: string; resourceType?: string; failureText?: string; pageUrl?: string }> = [];
  const mixedContentConsoleMessages: string[] = [];
  const vendorResolverInputs: VendorResolverInput[] = [];
  const runtimeErrors: string[] = [];
  const requestIds = new WeakMap<Request, string>();
  let visualCapture: VisualCaptureSummary = {
    status: "unavailable",
    failureReason: input.screenshotMode === "never" ? "skipped_by_mode" : "unknown",
    artifactRefs: [],
    notes: input.screenshotMode === "never" ? ["Pre-consent screenshot capture disabled by scan mode."] : [],
  };

  const browserMode = input.browserMode ?? "headless";
  const ownsBrowser = !input.browser;
  const browser = input.browser ?? await recordTiming(timingBreakdown, "browser launch", `Playwright Chromium launch (${browserMode}).`, () =>
    chromium.launch(chromiumLaunchOptions({ headless: browserMode !== "headed" }))
  );
  const context = await recordTiming(timingBreakdown, "browser context", "New isolated browser context and page.", async () => {
    const newContext = await browser.newContext(chromiumContextOptions());
    const newPage = await newContext.newPage();
    return { newContext, newPage };
  });
  const page = context.newPage;
  const browserContext = context.newContext;
  await recordTiming(
    timingBreakdown,
    "browser api probe install",
    "Install bounded pre-consent browser API access probes for entropy/fingerprinting review.",
    () => installBrowserApiAccessProbe(browserContext),
  );
  await recordTiming(
    timingBreakdown,
    "consent inventory probe install",
    "Install deterministic consent-control DOM inventory helper for main document, open shadow roots, and same-origin frames.",
    () => installConsentInventoryProbe(browserContext),
  );

  for (const fulfiller of input.routeFulfillers ?? []) {
    await browserContext.route(fulfiller.urlPattern, async (route: Route) => {
      await route.fulfill({
        status: fulfiller.status ?? 200,
        contentType: fulfiller.contentType ?? "text/plain",
        body: fulfiller.body ?? "",
        headers: fulfiller.headers,
      });
    });
  }
  if (input.stubHeavyResources) {
    await browserContext.route("**/*", async (route) => {
      if (await maybeFulfillHeavyResource(route)) {
        return;
      }
      await route.continue();
    });
  }

  page.on("request", (request) => {
    const requestUrl = request.url();
    if (!isHttpUrl(requestUrl)) {
      return;
    }

    const requestId = nextId("req");
    requestIds.set(request, requestId);
    const hostname = getHostname(requestUrl) ?? undefined;
    const registrableDomain = getRegistrableDomain(hostname) ?? undefined;
    const party = classifyHostnameParty(hostname, firstPartyHostname);
    const frame = request.frame();
    const frameUrl = frame.url();
    const isMainFrame = frame === page.mainFrame();
    const redirectedFrom = request.redirectedFrom();
    const redirectedFromId = redirectedFrom ? requestIds.get(redirectedFrom) : undefined;
    const headers = request.headers();
    const safeHeaders = safeRequestHeaders(headers);
    const querySignals = querySignalsFromUrl(requestUrl);
    const payloadSignals = payloadSignalsFromRequest(request);
    const collectionEndpoint = isCollectionEndpoint(requestUrl, request.resourceType());
    const endpointAttribution = classifyEndpointAttribution({
      url: requestUrl,
      hostname,
      registrableDomain,
      firstPartyDomain,
      resourceType: request.resourceType(),
      collectionEndpoint,
    });
    const endpointGeography = resolveEndpointGeography({
      collectionEndpointObserved: collectionEndpoint.observed,
      hostname,
      thirdParty: party === "third_party",
    });
    const event: NetworkEvent = {
      eventId: nextId("net"),
      eventType: "network_request",
      requestId,
      timestampMs: elapsed(input.scanStartedAtMs),
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: requestUrl,
      hostname,
      registrableDomain,
      firstParty: party === "first_party",
      thirdParty: party === "third_party",
      topLevelUrl: page.url() === "about:blank" ? input.normalizedUrl : page.url(),
      documentUrl: frameUrl === "about:blank" ? undefined : frameUrl,
      frameContext: {
        frameId: stableFrameId(frameUrl),
        frameUrl: frameUrl === "about:blank" ? undefined : frameUrl,
        parentFrameId: frame.parentFrame() ? stableFrameId(frame.parentFrame()?.url()) : undefined,
        isMainFrame,
        isSubFrame: !isMainFrame,
      },
      initiatorType: request.resourceType(),
      initiatorUrl: frameUrl === "about:blank" ? undefined : frameUrl,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      method: request.method(),
      resourceType: request.resourceType(),
      requestUrl,
      normalizedUrl: normalizeUrlSafely(requestUrl),
      requestHostname: hostname,
      path: pathFromUrl(requestUrl),
      queryParamNames: querySignals.queryParamNames,
      identifierParamNames: querySignals.identifierParamNames,
      advertisingClickIdParamNames: querySignals.advertisingClickIdParamNames,
      tagContainerParamNames: querySignals.tagContainerParamNames,
      hasIdentifierLikeParameters: querySignals.identifierParamNames.length > 0,
      hasAdvertisingClickIdParameters: querySignals.advertisingClickIdParamNames.length > 0,
      hasTagContainerParameters: querySignals.tagContainerParamNames.length > 0,
      isMainFrame,
      isSubFrame: !isMainFrame,
      isThirdParty: party === "third_party",
      parentRequestId: redirectedFromId,
      redirectChainRequestIds: redirectChainIds(request, requestIds),
      requestHeaders: safeHeaders,
      cookieHeaderPresent: safeHeaders.cookieHeaderPresent,
      cookieNamesSent: safeHeaders.cookieNames,
      authorizationHeaderPresent: safeHeaders.authorizationHeaderPresent,
      collectionEndpointObserved: collectionEndpoint.observed,
      endpointCategory: collectionEndpoint.category,
      endpointSubtype: endpointAttribution.subtype,
      attributionStatus: endpointAttribution.status,
      attributionReason: endpointAttribution.reason,
      resolverBasis: endpointAttribution.basis,
      endpointGeographyStatus: endpointGeography?.status,
      endpointGeographyRegion: endpointGeography?.region,
      endpointGeographyProvider: endpointGeography?.provider,
      endpointGeographyLocationLabel: endpointGeography?.locationLabel,
      endpointGeographyJurisdiction: endpointGeography?.jurisdiction,
      endpointGeographyPrecision: endpointGeography?.precision,
      endpointGeographyBasis: endpointGeography?.basis,
      relatedEvidenceRefs: [],
      requestPayloadSignals: payloadSignals,
    };
    networkEvents.push(event);
    vendorResolverInputs.push({
      ...resolverInputForEvent(event),
      type: request.resourceType() === "script" ? "script" : "request",
      url: requestUrl,
      hostname,
    });
    for (const cookieName of safeHeaders.cookieNames) {
      vendorResolverInputs.push({
        ...resolverInputForEvent(event, cookieName),
        type: "cookie",
        cookieName,
        hostname,
        matchSource: "request_cookie",
      });
    }
  });

  page.on("response", (response) => {
    void captureResponse(response);
  });
  page.on("requestfailed", (request) => {
    const requestUrl = request.url();
    if (!isHttpUrl(requestUrl)) {
      return;
    }
    failedHttpRequests.push({
      failureText: request.failure()?.errorText,
      pageUrl: request.frame().url() === "about:blank" ? page.url() : request.frame().url(),
      resourceType: request.resourceType(),
      url: requestUrl,
    });
  });
  page.on("console", (message) => {
    const text = message.text();
    if (/mixed content|blocked.+http:|insecure.+http:/i.test(text)) {
      mixedContentConsoleMessages.push(text.slice(0, 500));
    }
  });

  const screenshots: ScreenshotArtifact[] = [];
  const screenshotErrors: string[] = [];
  let earlyScreenshotCaptured = false;
  let consentGeometryDiagnosticWritten = false;
  let initialNavigationHttpStatus: number | undefined;
  const fallbackConsentUiObservations: ConsentUiObservation[] = [];
  const fallbackDomSnapshots: DomSnapshotArtifact[] = [];

  try {
    const navigationResponse = await recordTiming(timingBreakdown, "page navigation", "Initial navigation until DOMContentLoaded.", () =>
      page.goto(input.normalizedUrl, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(input.internalBudgetMs, 15_000),
      })
    );
    initialNavigationHttpStatus = navigationResponse?.status();
    if ((input.screenshotMode ?? "always") === "always") {
      const screenshotPath = input.artifactWriter.artifactPath("screenshot-pre-consent.png");
      const screenshotCapture = await recordTiming(
        timingBreakdown,
        "early screenshot capture",
        "Early pre-consent screenshot immediately after DOMContentLoaded.",
        () => capturePreConsentScreenshot(page, screenshotPath, {
          captureMode: input.screenshotCaptureMode ?? "full_page_first",
          screenshotErrors,
          timeoutMs: input.screenshotTimeoutMs ?? 5_000,
        }),
      );
      screenshots.push({
        artifactId: "screenshot_pre_consent",
        capturedAtMs: elapsed(input.scanStartedAtMs),
        captureMethod: screenshotCapture.captureMethod,
        path: screenshotPath,
        url: page.url(),
        pagePhase: "dom_content_loaded",
        consentStateAtTime: "pre_consent",
      });
      earlyScreenshotCaptured = true;
      visualCapture = visualCaptureFromScreenshotSummary(screenshotCapture, screenshotPath);
    }
    const fastWait = input.waitMode === "fast";
    const networkIdleTimeoutMs = fastWait ? 1_500 : 5_000;
    const settleWaitMs = fastWait ? 350 : 1_000;
    const consentUiWaitTimeoutMs = fastWait ? 1_800 : 3_500;
    const consentUiCaptureTimeoutMs = fastWait ? 3_500 : 5_500;
    const consentUiBudget = createConsentUiCaptureBudget(fastWait ? 4_500 : 7_000);
    const consentUiObservationPromise = recordBoundedTiming(
      timingBreakdown,
      "page evidence: consent UI",
      "First-layer consent surface/control text and affordance inventory, started before network-idle/settle waits.",
      consentUiBudget.timeoutFor(consentUiCaptureTimeoutMs),
      () => detectConsentUi(page, input.scanStartedAtMs, Math.min(consentUiWaitTimeoutMs, consentUiBudget.remainingMs())),
      () => emptyConsentUiObservation(input.scanStartedAtMs),
    );
    await recordTiming(
      timingBreakdown,
      "network idle wait",
      fastWait
        ? "Fast planned-DAG post-navigation network quiet wait, timeout is non-fatal."
        : "Post-navigation network-idle wait, timeout is non-fatal.",
      () =>
      page.waitForLoadState("networkidle", {
        timeout: Math.min(networkIdleTimeoutMs, input.internalBudgetMs),
      }).catch(() => undefined)
    );
    await recordTiming(
      timingBreakdown,
      "observation settle wait",
      fastWait
        ? "Fast planned-DAG observation settle window after bounded network quiet."
        : "Fixed pre-consent observation window after network quiet.",
      () => page.waitForTimeout(settleWaitMs).catch((error) => {
        if (isContextClosedError(error)) {
          runtimeErrors.push(`Observation settle ended early because the page/context closed: ${errorMessage(error)}`);
          return;
        }
        throw error;
      })
    );
    recordInstantTiming(
      timingBreakdown,
      "network capture",
      `Captured ${networkEvents.length} request events and ${networkResponseEvents.length} response events during navigation, network-idle, and settle windows.`,
    );

    const [storageSnapshot, scripts, frames, apiAccesses, initialConsentObservation, collectionSurfaceObservations, initialDomText] =
      await recordTiming(timingBreakdown, "page evidence capture", "Storage, scripts, iframes, browser API access, collection surfaces, consent UI, and DOM text capture.", () => Promise.all([
        recordBoundedTiming(
          timingBreakdown,
          "page evidence: storage snapshot",
          "Local/session storage key inventory before consent.",
          1_500,
          () => captureStorageSnapshot(page, input.scanStartedAtMs, input.normalizedUrl),
          () => emptyStorageSnapshot(input.scanStartedAtMs, input.normalizedUrl),
        ),
        recordBoundedTiming(
          timingBreakdown,
          "page evidence: script inventory",
          "DOM script element inventory before consent.",
          1_500,
          () => captureScriptEvents(page, input.scanStartedAtMs, firstPartyHostname),
          () => [],
        ),
        recordBoundedTiming(
          timingBreakdown,
          "page evidence: iframe inventory",
          "DOM iframe inventory before consent.",
          1_500,
          () => captureIframeEvents(page, input.scanStartedAtMs, firstPartyHostname),
          () => [],
        ),
        recordBoundedTiming(
          timingBreakdown,
          "page evidence: browser API access",
          "Captured browser API access probes for entropy/fingerprinting review.",
          1_500,
          () => captureBrowserApiAccessEvents(page, input.scanStartedAtMs, input.normalizedUrl),
          () => [],
        ),
        consentUiObservationPromise,
        recordBoundedTiming(
          timingBreakdown,
          "page evidence: collection surfaces",
          "Bounded public form/input collection surface inventory.",
          1_500,
          () => captureCollectionSurfaceObservations(page, input.scanStartedAtMs, input.normalizedUrl),
          () => [],
        ),
        recordBoundedTiming(
          timingBreakdown,
          "page evidence: body text",
          "Bounded visible body text capture for first-layer consent and policy hints.",
          2_500,
          () => page.locator("body").innerText({ timeout: 2_000 }).catch(() => ""),
          () => "",
        ),
      ]));
    let consentObservation = initialConsentObservation;
    let domText = initialDomText;
    if (
      consentObservation.basis.includes("bounded_capture_timeout_or_failure") &&
      domText.trim().length > 0
    ) {
      consentObservation = buildConsentUiObservationFromEvidence({
        scanStartedAtMs: input.scanStartedAtMs,
        text: domText,
        controls: [],
        fallbackBasis: ["bounded_capture_timeout_or_failure", "dom_text_fallback_after_consent_ui_timeout"],
      });
    }
    if (shouldRecaptureTextBackedConsentUiAfterSettle(consentObservation, domText)) {
      const recaptureTimeoutMs = consentUiBudget.timeoutFor(fastWait ? 1_000 : 1_500);
      const recapturedConsentObservation = await recordBoundedTiming(
        timingBreakdown,
        "page evidence: consent UI post-settle recapture",
        "Short post-settle first-layer control inventory for text-backed consent surfaces with no retained controls.",
        recaptureTimeoutMs,
        () => detectConsentUi(
          page,
          input.scanStartedAtMs,
          Math.min(fastWait ? 750 : 1_250, recaptureTimeoutMs),
          { waitForControlsOnTextOnlySurface: true },
        ),
        () => consentObservation,
      );
      if (isStrongerConsentUiObservation(recapturedConsentObservation, consentObservation)) {
        consentObservation = mergeConsentUiObservations(
          consentObservation,
          recapturedConsentObservation,
          "recapture:post_settle_first_layer_controls",
        );
        domText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => domText);
      } else {
        consentObservation = annotateConsentUiObservation(
          consentObservation,
          "recapture:post_settle_no_first_layer_controls",
        );
      }
    }
    if (shouldRecaptureConsentUiAfterTimeout(consentObservation, { fastWait })) {
      const recaptureTimeoutMs = consentUiBudget.timeoutFor(fastWait ? 3_000 : 4_000);
      const recapturedConsentObservation = await recordBoundedTiming(
        timingBreakdown,
        "page evidence: consent UI timeout recapture",
        "Second bounded first-layer consent control inventory after initial fast-path timeout.",
        recaptureTimeoutMs,
        () => detectConsentUi(
          page,
          input.scanStartedAtMs,
          Math.min(fastWait ? 1_500 : 2_500, recaptureTimeoutMs),
          { waitForControlsOnTextOnlySurface: true },
        ),
        () => consentObservation,
      );
      if (isStrongerConsentUiObservation(recapturedConsentObservation, consentObservation)) {
        consentObservation = mergeConsentUiObservations(
          consentObservation,
          recapturedConsentObservation,
          "recapture:post_timeout_first_layer_controls",
        );
        domText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => domText);
      }
    }

    for (const script of scripts) {
      scriptEvents.push(script);
      if (script.scriptUrl) {
        vendorResolverInputs.push({
          ...resolverInputForEvent(script),
          type: "script",
          url: script.scriptUrl,
          hostname: script.hostname,
        });
      }
    }

    iframeEvents.push(...frames);
    browserApiAccessEvents.push(...apiAccesses);
    for (const frame of frames) {
      if (frame.frameUrl) {
        vendorResolverInputs.push({
          ...resolverInputForEvent(frame),
          type: "iframe",
          url: frame.frameUrl,
          hostname: frame.hostname,
        });
      }
    }

    const cookies = await recordTiming(timingBreakdown, "cookie capture", "Browser-context cookie snapshot before consent.", () =>
      browserContext.cookies().catch((error) => {
        if (isContextClosedError(error)) {
          runtimeErrors.push(`Cookie capture unavailable because the page/context closed: ${errorMessage(error)}`);
          return [];
        }
        throw error;
      })
    );
    const cookieSnapshot: CookieSnapshot = {
      artifactId: "cookie_snapshot_pre_consent",
      capturedAtMs: elapsed(input.scanStartedAtMs),
      consentStateAtTime: "pre_consent",
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      })),
      cookieNames: cookies.map((cookie) => cookie.name),
      evidenceRefs: [],
    };
    for (const cookie of cookies) {
      const cookieHostname = getHostname(cookie.domain) ?? undefined;
      const cookieRegistrableDomain = getRegistrableDomain(cookieHostname) ?? undefined;
      const cookieParty = classifyCookieParty(cookie.domain, firstPartyHostname);
      const snapshotCookieEvent: CookieEvent = {
        eventId: nextId("cookie"),
        eventType: "cookie",
        timestampMs: elapsed(input.scanStartedAtMs),
        sourceScanner: SOURCE_SCANNER,
        scenario: SCENARIO,
        consentStateAtTime: "pre_consent",
        pagePhase: "network_idle",
        url: page.url(),
        hostname: cookieHostname,
        registrableDomain: cookieRegistrableDomain,
        firstParty: cookieParty === "first_party",
        thirdParty: cookieParty === "third_party",
        topLevelUrl: page.url(),
        evidenceRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
        cookieName: cookie.name,
        cookieDomain: cookie.domain,
        cookiePath: cookie.path,
        expires: Number.isFinite(cookie.expires) && cookie.expires > 0
          ? new Date(cookie.expires * 1000).toISOString()
          : undefined,
        sameSite: cookie.sameSite,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        cookieParty,
        vendorAssociated: false,
        cookiePurpose: "unknown",
        cookieClassificationBasis: [cookieParty, "browser_snapshot"],
        operation: "browser_snapshot",
        valueRedacted: true,
      };
      cookieEvents.push(snapshotCookieEvent);
      vendorResolverInputs.push({
        evidenceId: snapshotCookieEvent.eventId,
        evidenceRef: {
          refId: `ref_${snapshotCookieEvent.eventId}`,
          eventId: snapshotCookieEvent.eventId,
          eventType: "cookie_snapshot",
          label: cookie.name,
        },
        type: "cookie",
        cookieName: cookie.name,
        hostname: cookie.domain,
        sourceEventType: "cookie_snapshot",
        sourceScanner: SOURCE_SCANNER,
        scenario: SCENARIO,
        consentStateAtTime: "pre_consent",
        matchSource: "cookie_name",
      });
    }
    const cmpRuntimeObservations = await recordBoundedTiming(
      timingBreakdown,
      "CMP runtime probe",
      "Low-latency cookie, storage, and global CMP probe.",
      input.waitMode === "fast" ? 1_250 : 2_000,
      async () => {
        vendorResolverInputs.push(...await captureCmpRuntimeProbeInputs({
          page,
          storageSnapshot,
          scanStartedAtMs: input.scanStartedAtMs,
        }));
        return buildCmpRuntimeObservations(
          vendorResolverInputs,
          input.scanStartedAtMs,
        );
      },
      () => buildCmpRuntimeObservations(
        vendorResolverInputs,
        input.scanStartedAtMs,
      ),
    );
    if (shouldRecaptureConsentUiAfterCmpRuntime(consentObservation, domText, cmpRuntimeObservations)) {
      const highConfidenceCmpRuntimeEvidence =
        hasHighConfidenceInteractiveCmpRuntimeEvidence(cmpRuntimeObservations);
      const cmpRecaptureWaitMs = highConfidenceCmpRuntimeEvidence
        ? 12_000
        : fastWait ? 2_250 : 2_750;
      const requestedRecaptureTimeoutMs = Math.max(
        highConfidenceCmpRuntimeEvidence
          ? cmpRecaptureWaitMs
          : consentUiBudget.timeoutFor(fastWait ? 1_750 : 2_250),
        highConfidenceCmpRuntimeEvidence
          ? cmpRecaptureWaitMs
          : fastWait ? 2_500 : 3_000,
      );
      const recaptureTimeoutMs = highConfidenceCmpRuntimeEvidence
        ? requestedRecaptureTimeoutMs
        : Math.min(requestedRecaptureTimeoutMs, remainingModuleBudgetMs());
      const recapturedConsentObservation = recaptureTimeoutMs >= 1_000
        ? await recordBoundedTiming(
          timingBreakdown,
          "page evidence: consent UI CMP recapture",
          highConfidenceCmpRuntimeEvidence
            ? "Adaptive post-CMP first-layer control inventory for high-confidence CMP evidence; exits as soon as actionable controls are retained."
            : "Short post-CMP first-layer control inventory when CMP evidence is retained but only settings/preferences controls are visible.",
          recaptureTimeoutMs,
          () => detectConsentUi(
            page,
            input.scanStartedAtMs,
            Math.min(cmpRecaptureWaitMs, recaptureTimeoutMs),
            {
              waitForActionableChoiceControls: true,
              waitForControlsOnTextOnlySurface: true,
            },
          ),
          () => consentObservation,
        )
        : (() => {
          recordInstantTiming(
            timingBreakdown,
            "page evidence: consent UI CMP recapture skipped",
            "Skipped post-CMP first-layer control recapture because the pre-consent module budget was exhausted.",
          );
          return consentObservation;
        })();
      if (isStrongerConsentUiObservation(recapturedConsentObservation, consentObservation)) {
        const recaptureBasis = hasActionableConsentChoiceControl(recapturedConsentObservation)
          ? "recapture:post_cmp_first_layer_choice_controls"
          : "recapture:post_cmp_first_layer_controls";
        consentObservation = mergeConsentUiObservations(
          consentObservation,
          recapturedConsentObservation,
          recaptureBasis,
        );
        domText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => domText);
      } else {
        consentObservation = annotateConsentUiObservation(
          consentObservation,
          "recapture:post_cmp_no_first_layer_choice_controls",
        );
      }
    }

    const shouldCaptureScreenshot = shouldCapturePreConsentScreenshot({
      cmpRuntimeObservations,
      consentObservation,
      screenshotMode: input.screenshotMode ?? "always",
    });
    if (shouldCaptureScreenshot && !earlyScreenshotCaptured) {
      const screenshotPath = input.artifactWriter.artifactPath("screenshot-pre-consent.png");
      const screenshotCapture = await recordTiming(timingBreakdown, "screenshot capture", "Full-page pre-consent screenshot with 1x1 fallback on failure.", () =>
        capturePreConsentScreenshot(page, screenshotPath, {
          captureMode: input.screenshotCaptureMode ?? "full_page_first",
          screenshotErrors,
          timeoutMs: input.screenshotTimeoutMs ?? 5_000,
        })
      );
      screenshots.push({
        artifactId: "screenshot_pre_consent",
        capturedAtMs: elapsed(input.scanStartedAtMs),
        captureMethod: screenshotCapture.captureMethod,
        path: screenshotPath,
        url: page.url(),
        pagePhase: "network_idle",
        consentStateAtTime: "pre_consent",
      });
      visualCapture = visualCaptureFromScreenshotSummary(screenshotCapture, screenshotPath);
    }
    if (shouldCaptureScreenshot) {
      if (shouldRecaptureConsentUiAfterScreenshot(consentObservation, domText, {
        fastWait,
        visualCaptureAvailable: visualCapture.status === "available" || screenshots.length > 0,
      })) {
        const recaptureTimeoutMs = consentUiBudget.timeoutFor(fastWait ? 3_000 : 4_000);
        const recapturedConsentObservation = await recordBoundedTiming(
          timingBreakdown,
          "consent UI control recapture",
          "Bounded post-screenshot recapture of first-layer consent controls without interaction.",
          recaptureTimeoutMs,
          () => detectConsentUi(
            page,
            input.scanStartedAtMs,
            Math.min(fastWait ? 1_500 : 2_500, recaptureTimeoutMs),
            { waitForControlsOnTextOnlySurface: true },
          ),
          () => consentObservation,
        );
        if (isStrongerConsentUiObservation(recapturedConsentObservation, consentObservation)) {
          consentObservation = mergeConsentUiObservations(
            consentObservation,
            recapturedConsentObservation,
            "recapture:post_screenshot_first_layer_controls",
          );
          domText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => domText);
        }
      }
    } else {
      visualCapture = {
        status: "unavailable",
        failureReason: "skipped_by_mode",
        artifactRefs: [],
        notes: ["Pre-consent screenshot was skipped by selective screenshot mode because no consent surface or CMP signal was observed."],
      };
      recordInstantTiming(
        timingBreakdown,
        "screenshot capture skipped",
        "Selective planned-DAG screenshot skipped because baseline did not observe likely consent UI or CMP evidence.",
      );
    }

    if (
      earlyScreenshotCaptured &&
      (input.screenshotCaptureMode ?? "full_page_first") === "viewport_first" &&
      screenshots.some((screenshot) => screenshot.captureMethod === "primary_viewport_fallback")
    ) {
      const supplementalCapture = await recordTiming(
        timingBreakdown,
        "supplemental full-page screenshot",
        input.waitMode === "fast"
          ? "Best-effort same-page full-page screenshot after runtime evidence capture, bounded to avoid scan latency."
          : "Same-page full-page screenshot after runtime evidence capture.",
        () => captureSupplementalFullPagePreConsentScreenshot(page, input, {
          timeoutMs: input.waitMode === "fast" ? 750 : 2_500,
        }),
      );
      if (supplementalCapture?.screenshot) {
        screenshots.unshift(supplementalCapture.screenshot);
        visualCapture = mergeVisualCaptureWithFullPageArtifact(visualCapture, supplementalCapture.visualCapture);
      }
      if (supplementalCapture?.errorMessage) {
        screenshotErrors.push(supplementalCapture.errorMessage);
      }
      if (
        supplementalCapture?.screenshot &&
        shouldRecaptureConsentUiAfterSupplementalScreenshot(consentObservation, cmpRuntimeObservations)
      ) {
        const recapturedConsentObservation = await recordBoundedTiming(
          timingBreakdown,
          "consent UI supplemental screenshot recapture",
          "Final same-page structured consent-control read after supplemental full-page capture; does not infer controls from the screenshot.",
          1_250,
          () => detectConsentUi(
            page,
            input.scanStartedAtMs,
            750,
            {
              allowFullDocumentCmpControls: true,
              waitForControlsOnTextOnlySurface: true,
            },
          ),
          () => consentObservation,
        );
        if (isStrongerConsentUiObservation(recapturedConsentObservation, consentObservation)) {
          const recaptureBasis = recapturedConsentObservation.basis.some((basis) =>
            basis.startsWith("inventory:full_document_")
          )
            ? "recapture:post_supplemental_screenshot_full_document_cmp_controls"
            : "recapture:post_supplemental_screenshot_first_layer_controls";
          consentObservation = mergeConsentUiObservations(
            consentObservation,
            recapturedConsentObservation,
            recaptureBasis,
          );
          domText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => domText);
        }
      }
    }

    const geometryBudgetCushionMs = input.internalBudgetMs <= 10_000
      ? 2_500
      : input.waitMode === "fast" ? 8_000 : 10_000;
    if (remainingModuleBudgetMs() >= geometryBudgetCushionMs) {
      await recordTiming(
        timingBreakdown,
        "consent control geometry diagnostic",
        "Artifact-only bounded consent-control geometry diagnostic after normal pre-consent screenshot and structured inventory capture.",
        async () => {
        const access = await collectConsentGeometryPageAccess(page, initialNavigationHttpStatus, {
          frameTextTimeoutMs: input.waitMode === "fast" ? 250 : 500,
          supplementalBodyText: domText,
        });
        let geometry = await captureConsentControlGeometry(page, {
          screenshotArtifactRef: preferredPreConsentScreenshotRef(screenshots),
          timeoutMs: input.waitMode === "fast" ? 3_000 : 5_000,
        });
        if (
          !hasConfirmedFirstLayerGeometryControls(geometry) &&
          hasBelowFoldFirstLayerGeometryControls(geometry)
        ) {
          const recapturedGeometry = await recaptureConsentGeometryAfterBoundedScroll(page, geometry, {
            screenshotArtifactRef: preferredPreConsentScreenshotRef(screenshots),
          });
          if (recapturedGeometry && confirmedFirstLayerGeometryControlCount(recapturedGeometry) > confirmedFirstLayerGeometryControlCount(geometry)) {
            recapturedGeometry.summary.limitations = [
              "recapture:bounded_scroll_to_below_fold_first_layer_controls",
              ...recapturedGeometry.summary.limitations,
            ].slice(0, 12);
            geometry = recapturedGeometry;
          }
        }
        const geometryProofScreenshot = hasConfirmedFirstLayerGeometryControls(geometry)
          ? await captureConsentGeometryProofScreenshot(page, input, {
            screenshotErrors,
            timeoutMs: input.waitMode === "fast" ? 10_000 : 12_500,
          })
          : null;
        if (geometryProofScreenshot) {
          screenshots.unshift(geometryProofScreenshot);
          rewriteConsentGeometryScreenshotRefs(geometry, geometryProofScreenshot.path);
        }
        const geometryArtifactPath = await input.artifactWriter.writeJsonArtifact("ConsentControlGeometryEvidence.json", {
          ...geometry,
          access,
          egress: buildConsentGeometryEgressDiagnostic(),
          artifactOnly: true,
          productionFindingIntegration: false,
        });
        consentGeometryDiagnosticWritten = true;
        const geometryConsentObservation = consentUiObservationFromConfirmedGeometryControls({
          artifactPath: geometryArtifactPath,
          geometry,
          scanStartedAtMs: input.scanStartedAtMs,
          text: domText,
        });
        if (geometryConsentObservation && isStrongerConsentUiObservation(geometryConsentObservation, consentObservation)) {
          consentObservation = mergeConsentUiObservations(
            consentObservation,
            geometryConsentObservation,
            "geometry:confirmed_first_layer_controls",
          );
        }
        },
      ).catch((error: unknown) => {
        runtimeErrors.push(`Consent-control geometry diagnostic failed: ${errorMessageFromUnknown(error)}`);
      });
    } else {
      recordInstantTiming(
        timingBreakdown,
        "consent control geometry diagnostic skipped",
        "Skipped artifact-only consent-control geometry diagnostic because the pre-consent module budget was exhausted.",
      );
    }

    const domPath = await recordTiming(
      timingBreakdown,
      "DOM artifact write",
      "Bounded pre-consent DOM text artifact write.",
      () => input.artifactWriter.writeTextArtifact(
        "dom-text-pre-consent.txt",
        domText.slice(0, 100_000),
      ),
    );
    const domSnapshot: DomSnapshotArtifact = {
      artifactId: "dom_text_pre_consent",
      capturedAtMs: elapsed(input.scanStartedAtMs),
      path: domPath,
      url: page.url(),
      textExcerpt: domText.slice(0, 2_000),
      pagePhase: "network_idle",
      consentStateAtTime: "pre_consent",
    };
    consentObservation.evidenceRefs = [
      { refId: "dom_text_pre_consent", artifactId: domSnapshot.artifactId, path: domPath },
    ];

    const fallbackTransportSecurityObservation = () => ({
      observation: emptyTransportSecurityObservation({
        normalizedUrl: input.normalizedUrl,
        requestedUrl: input.url,
        scanStartedAtMs: input.scanStartedAtMs,
        reason: "transport_security_capture_timeout_or_failure",
      }),
      artifactRef: undefined,
    });
    const transportSecurityRemainingMs = remainingModuleBudgetMs();
    const { observation: transportSecurityObservation, artifactRef: transportSecurityArtifactRef } =
      transportSecurityRemainingMs >= 1_000
        ? await recordBoundedTiming(
          timingBreakdown,
          "page evidence: transport security",
          "Bounded HTTPS, TLS, HTTP redirect, mixed-content, and form transport observation without form submission.",
          Math.min(12_000, transportSecurityRemainingMs),
          () => captureTransportSecurityObservation({
            collectionSurfaceObservations,
            failedHttpRequests,
            mixedContentConsoleMessages,
            networkEvents,
            normalizedUrl: input.normalizedUrl,
            page,
            requestedUrl: input.url,
            scanStartedAtMs: input.scanStartedAtMs,
            artifactWriter: input.artifactWriter,
          }),
          fallbackTransportSecurityObservation,
        )
        : (() => {
          recordInstantTiming(
            timingBreakdown,
            "page evidence: transport security skipped",
            "Skipped bounded transport security observation because the pre-consent module budget was exhausted.",
          );
          return fallbackTransportSecurityObservation();
        })();

    return {
      moduleRun: {
        moduleName: "preConsentRuntimeScanner",
        status: runtimeErrors.length > 0 || screenshotErrors.length > 0 ? "partial" : "completed",
        startedAt: moduleStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - moduleStartedAtMs,
        timingBreakdown,
        evidenceRefs: [],
        errors: [...runtimeErrors, ...screenshotErrors],
      },
      runtimeTimeline: [...networkEvents, ...networkResponseEvents, ...cookieEvents, ...scriptEvents, ...iframeEvents, ...browserApiAccessEvents],
      networkEvents,
      networkResponseEvents,
      cookieEvents,
      cookieSnapshots: [cookieSnapshot],
      storageSnapshots: [storageSnapshot],
      scriptEvents,
      iframeEvents,
      consentUiObservations: [consentObservation],
      collectionSurfaceObservations,
      cmpRuntimeObservations,
      transportSecurityObservations: [transportSecurityObservation],
      screenshots,
      visualCapture,
      domSnapshots: [domSnapshot],
      artifactRefs: transportSecurityArtifactRef ? [transportSecurityArtifactRef] : [],
      vendorResolverInputs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!consentGeometryDiagnosticWritten) {
      await writeConsentGeometryNoGoArtifact(input.artifactWriter, input.normalizedUrl, errorMessage, initialNavigationHttpStatus)
        .catch((artifactError: unknown) => {
          runtimeErrors.push(`Consent-control geometry no-go diagnostic failed: ${errorMessageFromUnknown(artifactError)}`);
        });
    }
    const failureReason = classifyVisualCaptureFailureReason(errorMessage);
    if (screenshots.length === 0) {
      visualCapture = {
        status: "failed",
        failureReason,
        artifactRefs: [],
        notes: [`Pre-consent visual capture did not retain a screenshot: ${boundedVisualCaptureNote(errorMessage)}`],
      };
    } else {
      visualCapture = {
        ...visualCapture,
        notes: unique([
          ...visualCapture.notes,
          `Runtime collection ended after visual capture: ${boundedVisualCaptureNote(errorMessage)}`,
        ]),
      };
    }
    if ((input.screenshotMode ?? "always") !== "never" && screenshots.length === 0 && failureReason === "page_closed") {
      const retryCapture = await retryPreConsentScreenshotInFreshContext({
        browser,
        input,
        screenshotErrors,
        timingBreakdown,
      }).catch((retryError) => {
        const retryMessage = errorMessageFromUnknown(retryError);
        runtimeErrors.push(`Fresh-context screenshot retry failed: ${retryMessage}`);
        return null;
      });
      if (retryCapture) {
        screenshots.push(retryCapture.screenshot);
        visualCapture = retryCapture.visualCapture;
        if (retryCapture.consentUiObservation) {
          fallbackConsentUiObservations.push(retryCapture.consentUiObservation);
        }
        if (retryCapture.domSnapshot) {
          fallbackDomSnapshots.push(retryCapture.domSnapshot);
        }
      }
    }
    return {
      moduleRun: {
        moduleName: "preConsentRuntimeScanner",
        status: "failed",
        startedAt: moduleStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - moduleStartedAtMs,
        timingBreakdown,
        evidenceRefs: [],
        errors: [...runtimeErrors, errorMessage, ...screenshotErrors],
      },
      runtimeTimeline: [],
      networkEvents,
      networkResponseEvents,
      cookieEvents,
      cookieSnapshots: [],
      storageSnapshots: [],
      scriptEvents,
      iframeEvents,
      consentUiObservations: fallbackConsentUiObservations,
      collectionSurfaceObservations: [],
      cmpRuntimeObservations: [],
      transportSecurityObservations: [],
      screenshots,
      visualCapture,
      domSnapshots: fallbackDomSnapshots,
      artifactRefs: [],
      vendorResolverInputs,
    };
  } finally {
    if (ownsBrowser) {
      await browser.close();
    }
  }

  async function captureResponse(response: Response): Promise<void> {
    const responseUrl = response.url();
    if (!isHttpUrl(responseUrl)) {
      return;
    }

    const headers = await response.allHeaders().catch(() => response.headers());
    const request = response.request();
    const requestId = requestIds.get(request);
    const hostname = getHostname(responseUrl) ?? undefined;
    const registrableDomain = getRegistrableDomain(hostname) ?? undefined;
    const party = classifyHostnameParty(hostname, firstPartyHostname);
    const setCookieHeaders = await response.headerValues("set-cookie").catch(() => {
      const setCookieHeader = headers["set-cookie"];
      return setCookieHeader ? [setCookieHeader] : [];
    });
    const fixtureSetCookieHeaders = (input.routeFulfillers ?? [])
      .filter((fulfiller) => fulfiller.urlPattern.test(responseUrl))
      .flatMap((fulfiller) => fulfiller.setCookieHeaders ?? []);
    const effectiveSetCookieHeaders = [...setCookieHeaders, ...fixtureSetCookieHeaders];
    const setCookieMetadata = setCookieHeaders
      .concat(fixtureSetCookieHeaders)
      .map((header) => parseSetCookieMetadata(header, hostname, firstPartyHostname))
      .filter((metadata): metadata is SetCookieMetadata => Boolean(metadata));
    const safeHeaders = safeResponseHeaders(headers);
    const sizes = normalizeResponseSizes(
      await response.request().sizes().catch(() => undefined),
    );
    const timing = responseTiming(response);
    const responseEvent: NetworkResponseEvent = {
      eventId: nextId("resp"),
      eventType: "network_response",
      requestId,
      timestampMs: elapsed(input.scanStartedAtMs),
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: responseUrl,
      hostname,
      registrableDomain,
      firstParty: party === "first_party",
      thirdParty: party === "third_party",
      topLevelUrl: page.url() === "about:blank" ? input.normalizedUrl : page.url(),
      documentUrl: request.frame().url() === "about:blank" ? undefined : request.frame().url(),
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      responseUrl,
      normalizedUrl: normalizeUrlSafely(responseUrl),
      status: response.status(),
      contentType: headers["content-type"],
      mimeType: headers["content-type"],
      setCookieHeaders: effectiveSetCookieHeaders.map(redactSetCookieHeader),
      setCookieMetadata,
      cookieNamesSet: setCookieMetadata.map((metadata) => metadata.name),
      responseHeaders: safeHeaders,
      cacheHeaders: pickHeaders(headers, ["cache-control", "expires"]),
      locationRedirectHeader: headers.location,
      accessControlHeaders: pickHeaders(headers, [
        "access-control-allow-origin",
        "access-control-allow-credentials",
        "access-control-expose-headers",
      ]),
      timing,
      sizes,
    };
    networkResponseEvents.push(responseEvent);

    for (const cookieMetadata of setCookieMetadata) {
      const cookieEvent: CookieEvent = {
        eventId: nextId("cookie"),
        eventType: "cookie",
        timestampMs: elapsed(input.scanStartedAtMs),
        sourceScanner: SOURCE_SCANNER,
        scenario: SCENARIO,
        consentStateAtTime: "pre_consent",
        pagePhase: "initial_navigation",
        url: responseUrl,
        hostname,
        registrableDomain,
        firstParty: party === "first_party",
        thirdParty: party === "third_party",
        topLevelUrl: page.url() === "about:blank" ? input.normalizedUrl : page.url(),
        documentUrl: request.frame().url() === "about:blank" ? undefined : request.frame().url(),
        evidenceRefs: [{ refId: `ref_${responseEvent.eventId}`, eventId: responseEvent.eventId }],
        confidence: 0.95,
        directVsInferred: "direct",
        cookieName: cookieMetadata.name,
        cookieDomain: cookieMetadata.domain ?? hostname,
        cookiePath: cookieMetadata.path,
        expires: cookieMetadata.expires,
        maxAge: cookieMetadata.maxAge,
        sameSite: cookieMetadata.sameSite,
        secure: cookieMetadata.secure,
        httpOnly: cookieMetadata.httpOnly,
        sourceRequestId: requestId,
        sourceResponseEventId: responseEvent.eventId,
        cookieParty: cookieMetadata.thirdParty === true
          ? "third_party"
          : cookieMetadata.firstParty === true
            ? "first_party"
            : "unknown",
        vendorAssociated: false,
        cookiePurpose: classifyKnownCookiePurpose(cookieMetadata.name),
        cookieClassificationBasis: ["set_cookie_header"],
        operation: "set_cookie_header",
        valueRedacted: true,
      };
      cookieEvents.push(cookieEvent);
      vendorResolverInputs.push({
        ...resolverInputForEvent(cookieEvent, cookieMetadata.name),
        type: "cookie",
        cookieName: cookieMetadata.name,
        hostname: cookieMetadata.domain ?? hostname,
        matchSource: "set_cookie",
      });
    }
  }
}

async function recordTiming<T>(
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>,
  label: string,
  detail: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAtMs = Date.now();
  try {
    return await run();
  } finally {
    timingBreakdown.push({
      label,
      detail,
      durationMs: Date.now() - startedAtMs,
    });
  }
}

async function recordBoundedTiming<T>(
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>,
  label: string,
  detail: string,
  timeoutMs: number,
  run: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  const startedAtMs = Date.now();
  let outcome = "completed";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (timeoutMs <= 0) {
      outcome = "timed_out";
      return fallback();
    }
    return await Promise.race([
      run(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          outcome = "timed_out";
          resolve(fallback());
        }, timeoutMs);
      }),
    ]);
  } catch {
    outcome = "failed";
    return fallback();
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    const outcomeDetail =
      outcome === "completed"
        ? detail
        : `${detail} (${outcome === "timed_out" ? `timed out after ${timeoutMs}ms` : "failed; fallback evidence retained"}).`;
    timingBreakdown.push({
      label,
      detail: outcomeDetail,
      durationMs: Date.now() - startedAtMs,
    });
  }
}

function createConsentUiCaptureBudget(totalMs: number) {
  const startedAtMs = Date.now();
  return {
    remainingMs() {
      return Math.max(0, totalMs - (Date.now() - startedAtMs));
    },
    timeoutFor(requestedMs: number) {
      return Math.max(0, Math.min(requestedMs, totalMs - (Date.now() - startedAtMs)));
    },
  };
}

function recordInstantTiming(
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>,
  label: string,
  detail: string,
): void {
  timingBreakdown.push({
    label,
    detail,
    durationMs: 0,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isContextClosedError(error: unknown): boolean {
  return /target page, context or browser has been closed|browser has been closed|context has been closed/i.test(errorMessage(error));
}

function emptyStorageSnapshot(scanStartedAtMs: number, url: string): StorageSnapshot {
  return {
    artifactId: "storage_snapshot_pre_consent",
    capturedAtMs: elapsed(scanStartedAtMs),
    consentStateAtTime: "pre_consent",
    url,
    localStorage: {},
    sessionStorage: {},
    localStorageKeys: [],
    sessionStorageKeys: [],
    valuesRedacted: true,
    evidenceRefs: [],
  };
}

function emptyConsentUiObservation(scanStartedAtMs: number): ConsentUiObservation {
  return {
    observationId: "consent_ui_pre_consent",
    observedAtMs: elapsed(scanStartedAtMs),
    likelyPresent: false,
    basis: ["bounded_capture_timeout_or_failure"],
    textExcerpt: "",
    layerInspected: "unknown",
    visibleChoiceLabels: [],
    defaultToggleStatesObserved: null,
    nonEssentialDefaultsOff: null,
    defaultTogglePurposeLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    inventoryDiagnostics: {
      candidateContainerCount: 0,
      candidateControlCount: 0,
      retainedControlCount: 0,
      inventorySources: [],
      candidateLabels: [],
      rejectionReasons: ["timing_expired_before_controls_surfaced"],
      timingMarkers: ["bounded_capture_timeout_or_failure"],
    },
    evidenceRefs: [],
    confidence: 0.4,
  };
}

function resolverInputForEvent(
  event: RuntimeEvidenceEvent,
  label?: string,
): Pick<
  VendorResolverInput,
  | "evidenceId"
  | "evidenceRef"
  | "sourceEventType"
  | "sourceScanner"
  | "scenario"
  | "consentStateAtTime"
> {
  return {
    evidenceId: event.eventId,
    evidenceRef: {
      refId: `ref_${event.eventId}`,
      eventId: event.eventId,
      eventType: event.eventType,
      label,
      url: event.url,
    },
    sourceEventType: event.eventType,
    sourceScanner: event.sourceScanner,
    scenario: event.scenario,
    consentStateAtTime: event.consentStateAtTime,
  };
}

async function captureCmpRuntimeProbeInputs(input: {
  page: Page;
  storageSnapshot: StorageSnapshot;
  scanStartedAtMs: number;
}): Promise<VendorResolverInput[]> {
  const observed = await input.page.evaluate(() => {
    const markerPattern =
      /(consent|cookie|cmp|privacy|onetrust|optanon|didomi|truste|trustarc|usercentrics|cookiebot|cybot|sourcepoint|sp_message|osano|ketch|quantcast|iubenda|termly|cookieyes|cky|coi)/i;
    const globalNames = Object.getOwnPropertyNames(window)
      .filter((name) => markerPattern.test(name))
      .slice(0, 150);
    const selectors = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("[id],[class]")).slice(0, 1_000)) {
      const id = element.getAttribute("id");
      if (id && markerPattern.test(id)) {
        selectors.add(`#${CSS.escape(id)}`);
      }
      for (const className of Array.from(element.classList)) {
        if (markerPattern.test(className)) {
          selectors.add(`.${CSS.escape(className)}`);
        }
      }
      if (selectors.size >= 150) {
        break;
      }
    }
    return {
      globalNames,
      selectors: [...selectors],
    };
  }).catch(() => ({ globalNames: [], selectors: [] }));

  const storageKeys = unique([
    ...input.storageSnapshot.localStorageKeys,
    ...input.storageSnapshot.sessionStorageKeys,
  ]).slice(0, 150);
  const result: VendorResolverInput[] = [];
  for (const globalName of observed.globalNames) {
    const eventId = `cmp_global_${safeEvidenceId(globalName)}`;
    result.push({
      evidenceId: eventId,
      evidenceRef: {
        refId: `ref_${eventId}`,
        eventId,
        eventType: "cmp_runtime_probe",
        label: globalName,
      },
      type: "cmp_runtime",
      globalName,
      sourceEventType: "cmp_runtime_probe",
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      matchSource: "cmp_runtime_probe",
    });
  }
  for (const domSelector of observed.selectors) {
    const eventId = `cmp_dom_${safeEvidenceId(domSelector)}`;
    result.push({
      evidenceId: eventId,
      evidenceRef: {
        refId: `ref_${eventId}`,
        eventId,
        eventType: "cmp_runtime_probe",
        label: domSelector,
      },
      type: "cmp_runtime",
      domSelector,
      sourceEventType: "cmp_runtime_probe",
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      matchSource: "cmp_runtime_probe",
    });
  }
  for (const storageKey of storageKeys) {
    const eventId = `cmp_storage_${safeEvidenceId(storageKey)}`;
    result.push({
      evidenceId: eventId,
      evidenceRef: {
        refId: `ref_${eventId}`,
        eventId,
        eventType: "storage_snapshot",
        label: storageKey,
      },
      type: "cmp_runtime",
      storageKey,
      sourceEventType: "storage_snapshot",
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      matchSource: "storage_key",
    });
  }
  return result;
}

function buildCmpRuntimeObservations(
  vendorResolverInputs: VendorResolverInput[],
  scanStartedAtMs: number,
): CmpRuntimeObservation[] {
  const cmpVendorObservations = resolveVendorObservations(vendorResolverInputs)
    .filter((observation) => observation.purpose === "consent_management");

  return cmpVendorObservations.map((observation) => {
    const signals: CmpRuntimeObservation["signals"] = [];
    for (const source of observation.matchSources) {
      const signalType = signalTypeForMatchSource(
        source.source,
        source.matchedField,
      );
      if (!signalType || !source.matchedValueRedacted) {
        continue;
      }
      signals.push({
        signalType,
        matchedField: source.matchedField,
        matchedValueRedacted: source.matchedValueRedacted,
        ...(source.sourceEventId ? { sourceEventId: source.sourceEventId } : {}),
        ...(source.sourceEventType ? { sourceEventType: source.sourceEventType } : {}),
        ...(source.source === "network_request" ||
          source.source === "network_response" ||
          source.source === "script_url" ||
          source.source === "iframe_url"
          ? { url: source.matchedValueRedacted }
          : {}),
        resolverBasis: source.resolverBasis,
        confidence: source.confidence,
      });
    }
    return {
      observationId: `cmp_runtime_${safeEvidenceId(observation.observationId)}`,
      observedAtMs: elapsed(scanStartedAtMs),
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent" as const,
      vendorObservationId: observation.observationId,
      entity: observation.entity,
      vendor: observation.vendor,
      product: observation.product,
      signals,
      evidenceRefs: observation.matchedEvidenceRefs,
      confidence: observation.confidence,
      directVsInferred: "direct" as const,
    };
  });
}

function signalTypeForMatchSource(
  source: string,
  matchedField: string,
): CmpRuntimeObservation["signals"][number]["signalType"] | undefined {
  if (source === "cmp_runtime_probe") {
    if (matchedField === "global_name") {
      return "global";
    }
    if (matchedField === "dom_selector") {
      return "dom_selector";
    }
    return undefined;
  }
  if (source === "storage_key") {
    return "storage_key";
  }
  if (source === "cookie_name" || source === "set_cookie" || source === "request_cookie") {
    return "cookie_name";
  }
  if (source === "script_url") {
    return "script_url";
  }
  if (source === "network_request" || source === "network_response") {
    return "network_request";
  }
  return undefined;
}

async function captureStorageSnapshot(
  page: Page,
  scanStartedAtMs: number,
  url: string,
): Promise<StorageSnapshot> {
  const storage = await page.evaluate(() => {
    const localStorageEntries: Record<string, string> = {};
    const sessionStorageEntries: Record<string, string> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) {
        localStorageEntries[key] = "[redacted]";
      }
    }
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key) {
        sessionStorageEntries[key] = "[redacted]";
      }
    }
    return { localStorageEntries, sessionStorageEntries };
  }).catch(() => ({ localStorageEntries: {}, sessionStorageEntries: {} }));

  return {
    artifactId: "storage_snapshot_pre_consent",
    capturedAtMs: elapsed(scanStartedAtMs),
    consentStateAtTime: "pre_consent",
    url,
    localStorage: storage.localStorageEntries,
    sessionStorage: storage.sessionStorageEntries,
    localStorageKeys: Object.keys(storage.localStorageEntries),
    sessionStorageKeys: Object.keys(storage.sessionStorageEntries),
    valuesRedacted: true,
    evidenceRefs: [],
  };
}

async function captureScriptEvents(
  page: Page,
  scanStartedAtMs: number,
  firstPartyHostname: string | undefined,
): Promise<ScriptEvent[]> {
  const scripts = await page.evaluate(() =>
    [...document.scripts].map((script) => ({
      src: script.src || undefined,
      async: script.async,
      defer: script.defer,
    })),
  ).catch(() => []);

  return scripts.map((script) => {
    const hostname = getHostname(script.src) ?? undefined;
    const registrableDomain = getRegistrableDomain(hostname) ?? undefined;
    const party = classifyHostnameParty(hostname, firstPartyHostname);
    return {
      eventId: nextId("script"),
      eventType: "script",
      timestampMs: elapsed(scanStartedAtMs),
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      pagePhase: "dom_content_loaded",
      url: script.src,
      hostname,
      registrableDomain,
      firstParty: party === "first_party",
      thirdParty: party === "third_party",
      evidenceRefs: [],
      confidence: script.src ? 0.9 : 0.65,
      directVsInferred: "direct",
      scriptUrl: script.src,
      inline: !script.src,
      async: script.async,
      defer: script.defer,
    };
  });
}

async function captureIframeEvents(
  page: Page,
  scanStartedAtMs: number,
  firstPartyHostname: string | undefined,
): Promise<IframeEvent[]> {
  const frames = await page.evaluate(() =>
    [...document.querySelectorAll("iframe")].map((frame) => ({
      src: frame.src || undefined,
      name: frame.name || undefined,
    })),
  ).catch(() => []);

  return frames.map((frame) => {
    const hostname = getHostname(frame.src) ?? undefined;
    const registrableDomain = getRegistrableDomain(hostname) ?? undefined;
    const party = classifyHostnameParty(hostname, firstPartyHostname);
    return {
      eventId: nextId("iframe"),
      eventType: "iframe",
      timestampMs: elapsed(scanStartedAtMs),
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      pagePhase: "dom_content_loaded",
      url: frame.src,
      hostname,
      registrableDomain,
      firstParty: party === "first_party",
      thirdParty: party === "third_party",
      evidenceRefs: [],
      confidence: frame.src ? 0.9 : 0.6,
      directVsInferred: "direct",
      frameUrl: frame.src,
      frameName: frame.name,
    };
  });
}

async function installBrowserApiAccessProbe(browserContext: BrowserContext): Promise<void> {
  await browserContext.addInitScript({
    content: `(() => {
      const globalTarget = window;
      const accesses = Array.isArray(globalTarget.__certscoreBrowserApiAccesses)
        ? globalTarget.__certscoreBrowserApiAccesses
        : [];
      globalTarget.__certscoreBrowserApiAccesses = accesses;
      globalTarget.__certscoreBrowserApiProbeInstalled = true;
      globalTarget.__certscoreBrowserApiProbeErrors = [];
      const record = (apiName, category) => {
        if (accesses.length >= 60 || accesses.some((entry) => entry.apiName === apiName)) {
          return;
        }
        accesses.push({
          apiName,
          category,
          timestampMs: Math.max(0, Math.round(performance.now())),
        });
      };
      const recordError = (label, error) => {
        try {
          globalTarget.__certscoreBrowserApiProbeErrors.push(label + ":" + String(error && error.message ? error.message : error));
        } catch {}
      };
      const wrapMethod = (target, methodName, apiName, category) => {
        try {
          const descriptor = target ? Object.getOwnPropertyDescriptor(target, methodName) : undefined;
          if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) {
            return;
          }
          const original = descriptor.value;
          Object.defineProperty(target, methodName, {
            ...descriptor,
            value: function wrappedBrowserApiAccess(...args) {
              record(apiName, category);
              return original.apply(this, args);
            },
          });
        } catch (error) {
          recordError(apiName, error);
        }
      };
      const wrapGetter = (target, propertyName, apiName, category) => {
        try {
          const descriptor = target ? Object.getOwnPropertyDescriptor(target, propertyName) : undefined;
          if (!descriptor || typeof descriptor.get !== "function" || !descriptor.configurable) {
            return;
          }
          const original = descriptor.get;
          Object.defineProperty(target, propertyName, {
            ...descriptor,
            get: function wrappedBrowserApiGetter() {
              record(apiName, category);
              return original.call(this);
            },
          });
        } catch (error) {
          recordError(apiName, error);
        }
      };

      wrapMethod(window.HTMLCanvasElement && window.HTMLCanvasElement.prototype, "toDataURL", "HTMLCanvasElement.toDataURL", "canvas");
      wrapMethod(window.HTMLCanvasElement && window.HTMLCanvasElement.prototype, "toBlob", "HTMLCanvasElement.toBlob", "canvas");
      wrapMethod(window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype, "getImageData", "CanvasRenderingContext2D.getImageData", "canvas");
      wrapMethod(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype, "getParameter", "WebGLRenderingContext.getParameter", "webgl");
      wrapMethod(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype, "getParameter", "WebGL2RenderingContext.getParameter", "webgl");
      wrapMethod(window.AudioContext && window.AudioContext.prototype, "createOscillator", "AudioContext.createOscillator", "audio");
      wrapMethod(window.OfflineAudioContext && window.OfflineAudioContext.prototype, "startRendering", "OfflineAudioContext.startRendering", "audio");
      wrapGetter(window.Navigator && window.Navigator.prototype, "plugins", "Navigator.plugins", "plugins");
      wrapGetter(window.Navigator && window.Navigator.prototype, "mimeTypes", "Navigator.mimeTypes", "plugins");

      try {
        const userAgentData = navigator.userAgentData;
        if (userAgentData && typeof userAgentData.getHighEntropyValues === "function") {
          const original = userAgentData.getHighEntropyValues.bind(userAgentData);
          userAgentData.getHighEntropyValues = (hints) => {
            record("NavigatorUAData.getHighEntropyValues:" + hints.slice(0, 8).join(","), "high_entropy_client_hints");
            return original(hints);
          };
        }
      } catch (error) {
        recordError("NavigatorUAData.getHighEntropyValues", error);
      }
    })();`
  });
}

async function captureBrowserApiAccessEvents(
  page: Page,
  scanStartedAtMs: number,
  normalizedUrl: string,
): Promise<RuntimeEvidenceEvent[]> {
  const rows = await page.evaluate(() => {
    const globalTarget = window as unknown as {
      __certscoreBrowserApiAccesses?: Array<{ apiName: string; category: string; timestampMs: number }>;
    };
    return globalTarget.__certscoreBrowserApiAccesses ?? [];
  }).catch(() => []);
  const hostname = getHostname(normalizedUrl) ?? undefined;
  const registrableDomain = getRegistrableDomain(hostname) ?? undefined;

  return rows.slice(0, 60).map((row, index) => ({
    eventId: nextId("browser_api"),
    eventType: "browser_api_access",
    timestampMs: Math.max(0, elapsed(scanStartedAtMs) - Math.max(0, rows.length - index - 1)),
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    url: normalizedUrl,
    hostname,
    registrableDomain,
    firstParty: true,
    thirdParty: false,
    evidenceRefs: [{
      refId: `browser_api_${index}`,
      eventType: "browser_api_access",
      label: `Browser API access: ${row.apiName}`,
      excerpt: row.category,
      url: normalizedUrl,
    }],
    confidence: 0.82,
    directVsInferred: "direct",
  }));
}

export async function detectConsentUi(
  page: Page,
  scanStartedAtMs: number,
  waitForControlTimeoutMs = 3_500,
  options: {
    allowFullDocumentCmpControls?: boolean;
    waitForActionableChoiceControls?: boolean;
    waitForControlsOnTextOnlySurface?: boolean;
  } = {},
): Promise<ConsentUiObservation> {
  const waitStartedAtMs = Date.now();
  const immediateObservation = await readConsentUiObservation(page, scanStartedAtMs, {
    allowFullDocumentCmpControls: options.allowFullDocumentCmpControls,
  });
  const shouldWaitForRequestedRecapture =
    options.waitForActionableChoiceControls === true ||
    options.waitForControlsOnTextOnlySurface === true ||
    options.allowFullDocumentCmpControls === true;
  if (
    immediateObservation.controls.length > 0 && (
      !options.waitForActionableChoiceControls ||
      hasActionableConsentChoiceControl(immediateObservation)
    ) ||
    (immediateObservation.likelyPresent && !options.waitForControlsOnTextOnlySurface) ||
    (!shouldWaitForRequestedRecapture && !immediateObservation.likelyPresent && page.frames().length <= 1) ||
    waitForControlTimeoutMs <= 0
  ) {
    return annotateConsentInventoryTimingMarkers(
      immediateObservation,
      immediateObservation.controls.length > 0
        ? ["immediate_inventory", "early_exit_controls_found"]
        : ["immediate_inventory"],
    );
  }

  const requireActionableChoiceControl = options.waitForActionableChoiceControls === true ? "true" : "false";
  await page.waitForFunction(`(() => {
    const requireActionableChoiceControl = ${requireActionableChoiceControl};
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        element.getAttribute("aria-hidden") !== "true" &&
        Number.parseFloat(style.opacity || "1") > 0.05
      );
    };
    const isFirstLayerPosition = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.top <= window.innerHeight + 200 && rect.bottom >= -200;
    };
    const hasConsentContext = (element) => {
      let current = element;
      for (let depth = 0; current && depth < 5; depth += 1) {
        if (current === document.body || current === document.documentElement) {
          current = current.parentElement;
          continue;
        }
        const contextText = (current.textContent || "").replace(/\s+/g, " ").trim();
        const contextAttrs = [
          current.getAttribute("aria-label"),
          current.getAttribute("role"),
          current.getAttribute("id"),
          current.getAttribute("class"),
        ].filter(Boolean).join(" ");
        if (/cookie|cookies|privacy|consent|preference|preferences|optanon|onetrust|cmp|trustarc|didomi|usercentrics|cookiebot/i.test(contextText + " " + contextAttrs)) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };
    const visibleConsentControls = Array.from(document.querySelectorAll("button, [role='button'], a, input[type='button'], input[type='submit']")).filter((element) => {
      const label = (
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        (element instanceof HTMLInputElement ? element.value : "") ||
        element.textContent ||
        ""
      ).replace(/\s+/g, " ").trim();
      return isVisible(element) &&
        isFirstLayerPosition(element) &&
        label.length > 0 &&
        label.length <= 140 &&
        hasConsentContext(element) &&
        (!requireActionableChoiceControl || label.length <= 80);
    });
    return requireActionableChoiceControl ? visibleConsentControls.length >= 2 : visibleConsentControls.length > 0;
  })()`, undefined, { timeout: waitForControlTimeoutMs }).catch(() => undefined);

  const postWaitObservation = await readConsentUiObservation(page, scanStartedAtMs, {
    allowFullDocumentCmpControls: options.allowFullDocumentCmpControls,
  });
  if (!options.waitForActionableChoiceControls || hasActionableConsentChoiceControl(postWaitObservation)) {
    return annotateConsentInventoryTimingMarkers(
      postWaitObservation,
      postWaitObservation.controls.length > 0
        ? ["immediate_inventory", "post_wait_inventory", "early_exit_controls_found"]
        : ["immediate_inventory", "post_wait_inventory"],
    );
  }

  const remainingWaitMs = waitForControlTimeoutMs - (Date.now() - waitStartedAtMs);
  if (remainingWaitMs > 50) {
    await page.waitForTimeout(remainingWaitMs).catch(() => undefined);
  }

  const finalObservation = await readConsentUiObservation(page, scanStartedAtMs, {
    allowFullDocumentCmpControls: options.allowFullDocumentCmpControls,
  });
  return annotateConsentInventoryTimingMarkers(
    finalObservation,
    finalObservation.controls.length > 0
      ? ["immediate_inventory", "post_wait_inventory", "final_inventory"]
      : ["immediate_inventory", "post_wait_inventory", "final_inventory", "timing_expired_before_controls_surfaced"],
  );
}

async function readConsentUiObservation(
  page: Page,
  scanStartedAtMs: number,
  options: {
    allowFullDocumentCmpControls?: boolean;
  } = {},
): Promise<ConsentUiObservation> {
  const text = await page.evaluate(() => (document.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 12_000)).catch(() => "");
  const allowFullDocumentCmpControls = options.allowFullDocumentCmpControls === true;
  await page.evaluate(CONSENT_INVENTORY_PROBE_SCRIPT).catch(() => undefined);
  const inventory = await page.evaluate<{
    controls: ConsentUiInventoryControl[];
    diagnostics?: ConsentInventoryProbeDiagnostics;
    frameInaccessibleCount: number;
  }>(String.raw`(() => {
    const allowFullDocumentCmpControls = ${allowFullDocumentCmpControls ? "true" : "false"};
    return {
      ...window.__certscoreConsentInventory(allowFullDocumentCmpControls),
      frameInaccessibleCount: 0,
    };
  })()`).catch((): {
    controls: ConsentUiInventoryControl[];
    diagnostics?: ConsentInventoryProbeDiagnostics;
    frameInaccessibleCount: number;
  } => {
    return { controls: [], diagnostics: undefined, frameInaccessibleCount: 0 };
  });
  const frameInventory = inventory.controls.some((control) => control.inventorySource === "same_origin_frame")
    ? { controls: [], frameInaccessibleCount: 0, textExcerpts: [] }
    : await readAccessibleFrameConsentInventory(page);
  const accessibilityInventory = await readAccessibilityConsentInventory(page);
  const combinedControls = [
    ...inventory.controls,
    ...frameInventory.controls,
    ...accessibilityInventory.controls,
  ];
  const combinedText = [
    text,
    ...frameInventory.textExcerpts,
    ...accessibilityInventory.textExcerpts,
  ].filter(Boolean).join(" ").slice(0, 12_000);
  const defaultToggleEvidence = await readConsentDefaultToggleEvidence(page);
  const frameInaccessibleCount = inventory.frameInaccessibleCount + frameInventory.frameInaccessibleCount;
  const probeDiagnostics = inventory.diagnostics;
  const classifiedControls = combinedControls.map((control) => {
    const classification = classifyRuntimeConsentControlLabel({
      label: control.label,
      contextText: combinedText,
      hasConsentContext: true,
    });
    const actionType = consentUiControlActionTypeFromClassification(classification);
    return {
      ...control,
      actionType: actionType ?? control.actionType,
      matchedTerm: classification.matchedTerm,
      matchedLocale: classification.matchedLocale,
      matchStrength: classification.matchStrength,
      classifierReasonCodes: classification.reasonCodes,
      classifierVariant: classification.variant,
    };
  });
  const classifiedConsentSurfaceCountsByContainer = new Map<string, number>();
  for (const control of classifiedControls) {
    if (control.inventorySource !== "full_document_consent_surface" || control.actionType === "other") {
      continue;
    }
    const key = control.inventoryContainerKey ?? "unknown";
    classifiedConsentSurfaceCountsByContainer.set(
      key,
      (classifiedConsentSurfaceCountsByContainer.get(key) ?? 0) + 1,
    );
  }
  const retainedInventorySources = new Set<string>();
  const retainedRootSources = new Set<string>();
  const rejectedReasons = new Set<NonNullable<ConsentUiObservation["inventoryDiagnostics"]>["rejectionReasons"][number]>();
  if (frameInaccessibleCount > 0) {
    rejectedReasons.add("frame_inaccessible");
  }
  const hasActionableClassifiedControl = classifiedControls.some((control) =>
    control.actionType === "accept_all" || control.actionType === "reject_all"
  );
  const retainedControlKeys = new Set<string>();
  const enrichedControls = classifiedControls.filter((control) => {
    if (control.actionType === "other") {
      rejectedReasons.add("classifier_other_unknown");
      return false;
    }
    if (isStaticTextConsentInventoryControl(control)) {
      rejectedReasons.add("outside_eligible_surface");
      return false;
    }
    if (
      control.inventorySource === "accessibility_tree" &&
      control.actionType === "manage_preferences" &&
      !hasActionableClassifiedControl &&
      probeDiagnostics?.rejectionReasons?.includes("footer_nav_page_chrome")
    ) {
      rejectedReasons.add("footer_nav_page_chrome");
      return false;
    }
    if (
      control.inventorySource === "full_document_consent_surface" &&
      (classifiedConsentSurfaceCountsByContainer.get(control.inventoryContainerKey ?? "unknown") ?? 0) < 2
    ) {
      rejectedReasons.add("generic_container_fewer_than_two_classified_controls");
      return false;
    }
    const dedupeKey = [
      control.actionType,
      control.label.trim().toLowerCase(),
      control.frameUrl ?? "main",
    ].join(":");
    if (retainedControlKeys.has(dedupeKey)) {
      if (control.inventorySource) {
        retainedInventorySources.add(control.inventorySource);
      }
      if (control.inventoryRootSource) {
        retainedRootSources.add(control.inventoryRootSource);
      }
      return false;
    }
    retainedControlKeys.add(dedupeKey);
    return true;
  }).map((control) => {
    if (control.inventorySource) {
      retainedInventorySources.add(control.inventorySource);
    }
    if (control.inventoryRootSource) {
      retainedRootSources.add(control.inventoryRootSource);
    }
    const {
      frameUrl: _frameUrl,
      inventoryContainerKey: _inventoryContainerKey,
      inventoryRootSource: _inventoryRootSource,
      inventorySource: _inventorySource,
      ...retainedControl
    } = control;
    return retainedControl;
  });
  const diagnostics: NonNullable<ConsentUiObservation["inventoryDiagnostics"]> = {
    candidateContainerCount: Math.max(
      probeDiagnostics?.candidateContainerCount ?? 0,
      new Set(
        combinedControls
          .map((control) => `${control.frameUrl ?? "main"}:${control.inventoryContainerKey ?? "unknown"}`)
          .filter(Boolean),
      ).size,
    ),
    candidateControlCount: Math.max(probeDiagnostics?.candidateControlCount ?? 0, combinedControls.length),
    retainedControlCount: enrichedControls.length,
    inventorySources: consentInventoryDiagnosticSources(retainedInventorySources, retainedRootSources),
    candidateLabels: unique([
      ...(probeDiagnostics?.candidateLabels ?? []),
      ...combinedControls.map((control) => control.label).filter(Boolean),
    ]).slice(0, 24),
    rejectionReasons: uniqueRejectionReasons([
      ...(probeDiagnostics?.rejectionReasons ?? []),
      ...rejectedReasons,
    ]),
    timingMarkers: [],
  };
  return buildConsentUiObservationFromEvidence({
    scanStartedAtMs,
    text: combinedText,
    controls: enrichedControls,
    defaultToggleEvidence,
    fallbackBasis: [
      ...(retainedInventorySources.has("full_document_cmp") ? ["inventory:full_document_cmp_controls"] : []),
      ...(retainedInventorySources.has("full_document_consent_surface") ? ["inventory:full_document_consent_surface_controls"] : []),
      ...(retainedInventorySources.has("same_origin_frame") ? ["inventory:same_origin_frame_controls"] : []),
      ...(retainedInventorySources.has("accessibility_tree") ? ["inventory:accessibility_tree_controls"] : []),
      ...(retainedRootSources.has("shadow_root") ? ["inventory:open_shadow_root_controls"] : []),
    ],
    inventoryDiagnostics: diagnostics,
  });
}

type ConsentUiInventoryControl = ConsentUiObservation["controls"][number] & {
  frameUrl?: string;
  inventorySource?: "first_layer" | "full_document_cmp" | "full_document_consent_surface" | "same_origin_frame" | "accessibility_tree";
  inventoryContainerKey?: string;
  inventoryRootSource?: "document" | "shadow_root";
};

type ConsentDefaultToggleEvidence = Pick<
  ConsentUiObservation,
  | "defaultTogglePurposeLabels"
  | "defaultToggleStatesObserved"
  | "nonEssentialDefaultsOff"
  | "precheckedOptionalPurposeCount"
  | "precheckedOptionalPurposeLabels"
>;

type ConsentInventoryProbeDiagnostics = Pick<
  NonNullable<ConsentUiObservation["inventoryDiagnostics"]>,
  "candidateContainerCount" | "candidateControlCount" | "candidateLabels" | "rejectionReasons"
>;

function isStaticTextConsentInventoryControl(control: ConsentUiInventoryControl): boolean {
  const tagName = control.tagName?.toLowerCase();
  if (!tagName || !/^(?:p|span|strong|em|small|h[1-6]|li|dt|dd)$/.test(tagName)) {
    return false;
  }
  const role = control.role?.toLowerCase();
  if (role === "button" || role === "link") {
    return false;
  }
  return !/(?:button|btn|choice|option|preference|purpose)/i.test(control.selectorHint ?? "");
}

const CONSENT_DEFAULT_TOGGLE_PROBE_SCRIPT = String.raw`(() => {
  const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const selectorHintFor = (element) => {
    const id = element.getAttribute("id");
    const dataTestId = element.getAttribute("data-testid");
    if (id) return "#" + id;
    if (dataTestId) return "[data-testid=\"" + dataTestId + "\"]";
    return element.tagName.toLowerCase();
  };
  const isVisible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      element.getAttribute("aria-hidden") !== "true" &&
      Number.parseFloat(style.opacity || "1") > 0.05
    );
  };
  const isFirstLayerPosition = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.top <= window.innerHeight + 200 && rect.bottom >= -200;
  };
  const labeledByText = (element) => {
    const ids = normalize(element.getAttribute("aria-labelledby")).split(/\s+/).filter(Boolean);
    return ids.map((id) => normalize(document.getElementById(id)?.textContent)).filter(Boolean).join(" ");
  };
  const labelElementFor = (element) => {
    const id = element.getAttribute("id");
    return id ? document.querySelector("label[for=\"" + CSS.escape(id) + "\"]") : null;
  };
  const contextElementFor = (element) =>
    element.closest("label,[role='group'],[role='row'],li,tr,fieldset,.category,.purpose,.preference,.toggle,.switch,.option,[class*='category' i],[class*='purpose' i],[class*='preference' i],[class*='toggle' i],[class*='switch' i],[class*='option' i]") ??
    labelElementFor(element) ??
    element;
  const labelFor = (element) => {
    const context = contextElementFor(element);
    const values = [
      element.getAttribute("aria-label"),
      labeledByText(element),
      labelElementFor(element)?.textContent,
      element.closest("label")?.textContent,
      context?.textContent,
      element.getAttribute("title"),
      element.textContent,
    ].map(normalize).filter(Boolean);
    return normalize(values[0]).slice(0, 120);
  };
  const hasConsentContext = (element) => {
    let current = contextElementFor(element);
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current === document.body || current === document.documentElement) {
        current = current.parentElement;
        continue;
      }
      const contextText = normalize(current.textContent);
      const contextAttrs = [
        current.getAttribute("aria-label"),
        current.getAttribute("role"),
        current.getAttribute("id"),
        current.getAttribute("class"),
      ].map(normalize).filter(Boolean).join(" ");
      if (/cookie|cookies|privacy|consent|preference|preferences|analytics|advertising|marketing|tracking|optanon|onetrust|cmp|trustarc|didomi|usercentrics|cookiebot/i.test(contextText + " " + contextAttrs)) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };
  const checkedState = (element) => {
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      return element.checked;
    }
    const ariaChecked = element.getAttribute("aria-checked");
    if (ariaChecked === "true") return true;
    if (ariaChecked === "false") return false;
    const ariaPressed = element.getAttribute("aria-pressed");
    if (ariaPressed === "true") return true;
    if (ariaPressed === "false") return false;
    return null;
  };
  const nonEssentialLabel = (label) => {
    const optional = /\b(?:optional|non[-\s]?essential|analytics?|statistics?|measurement|advertis(?:e|ing|ement)?|ads?|marketing|target(?:ed|ing)?|personal(?:ized|ised|ization|isation)?|social|tracking|profil(?:e|ing)|remarketing|sale|share|partners?|vendors?|third[-\s]?party)\b/i.test(label);
    const necessaryOnly = /\b(?:strictly necessary|always active|always on|required|security|authentication|essential cookies?|necessary cookies?)\b/i.test(label) &&
      !/\b(?:optional|non[-\s]?essential)\b/i.test(label);
    return optional && !necessaryOnly;
  };
  const roots = [document];
  const seen = new Set(roots);
  const visit = (root) => {
    for (const element of Array.from(root.querySelectorAll("*")).slice(0, 1_500)) {
      if (element.shadowRoot && !seen.has(element.shadowRoot)) {
        seen.add(element.shadowRoot);
        roots.push(element.shadowRoot);
        visit(element.shadowRoot);
      }
    }
  };
  visit(document);
  const controls = roots.flatMap((root) =>
    Array.from(root.querySelectorAll("input[type='checkbox'], input[type='radio'], [role='switch'], [role='checkbox'], [role='radio'], [aria-checked], [aria-pressed]"))
  ).slice(0, 200);
  const candidates = controls.flatMap((element) => {
    const checked = checkedState(element);
    if (checked === null) return [];
    const context = contextElementFor(element);
    const visible = isVisible(element) || isVisible(labelElementFor(element)) || isVisible(context);
    const firstLayer = isFirstLayerPosition(element) || isFirstLayerPosition(context);
    if (!visible || !firstLayer || !hasConsentContext(element)) return [];
    const label = labelFor(element);
    if (!label || !nonEssentialLabel(label)) return [];
    return [{ checked, label, selectorHint: selectorHintFor(element) }];
  });
  const byLabel = new Map();
  for (const candidate of candidates) {
    const key = candidate.label.toLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, candidate);
  }
  const nonEssentialToggles = Array.from(byLabel.values()).slice(0, 12);
  const checkedOptional = nonEssentialToggles.filter((toggle) => toggle.checked);
  return {
    defaultTogglePurposeLabels: nonEssentialToggles.map((toggle) => toggle.label),
    defaultToggleStatesObserved: nonEssentialToggles.length > 0 ? true : null,
    nonEssentialDefaultsOff: nonEssentialToggles.length > 0 ? checkedOptional.length === 0 : null,
    precheckedOptionalPurposeCount: checkedOptional.length,
    precheckedOptionalPurposeLabels: checkedOptional.map((toggle) => toggle.label).slice(0, 10),
  };
})()`;

async function readConsentDefaultToggleEvidence(page: Page): Promise<ConsentDefaultToggleEvidence> {
  const perFrame = await Promise.all(
    page.frames().slice(0, 8).map((frame) =>
      frame.evaluate<ConsentDefaultToggleEvidence>(CONSENT_DEFAULT_TOGGLE_PROBE_SCRIPT).catch((): ConsentDefaultToggleEvidence => ({
        defaultTogglePurposeLabels: [],
        defaultToggleStatesObserved: null,
        nonEssentialDefaultsOff: null,
        precheckedOptionalPurposeCount: 0,
        precheckedOptionalPurposeLabels: [],
      }))
    )
  );
  const defaultTogglePurposeLabels = unique(perFrame.flatMap((row) => row.defaultTogglePurposeLabels ?? [])).slice(0, 12);
  const precheckedOptionalPurposeLabels = unique(perFrame.flatMap((row) => row.precheckedOptionalPurposeLabels ?? [])).slice(0, 10);
  return {
    defaultTogglePurposeLabels,
    defaultToggleStatesObserved: defaultTogglePurposeLabels.length > 0 ? true : null,
    nonEssentialDefaultsOff: defaultTogglePurposeLabels.length > 0 ? precheckedOptionalPurposeLabels.length === 0 : null,
    precheckedOptionalPurposeCount: precheckedOptionalPurposeLabels.length,
    precheckedOptionalPurposeLabels,
  };
}

async function readAccessibleFrameConsentInventory(
  page: Page,
): Promise<{
  controls: ConsentUiInventoryControl[];
  frameInaccessibleCount: number;
  textExcerpts: string[];
}> {
  const frames = page.frames()
    .filter((frame) => frame !== page.mainFrame())
    .slice(0, 8);
  const controls: ConsentUiInventoryControl[] = [];
  const textExcerpts: string[] = [];
  let frameInaccessibleCount = 0;
  for (const frame of frames) {
    await frame.waitForLoadState("domcontentloaded", { timeout: 250 }).catch(() => undefined);
    const frameInventory = await boundedFrameInventoryRead(frame).catch(() => {
      return null;
    });
    if (!frameInventory) {
      frameInaccessibleCount += 1;
      continue;
    }
    controls.push(...frameInventory.controls.slice(0, 8));
    if (frameInventory.textExcerpt) {
      textExcerpts.push(frameInventory.textExcerpt);
    }
    if (controls.length >= 12) {
      break;
    }
  }
  return {
    controls: controls.slice(0, 12),
    frameInaccessibleCount,
    textExcerpts,
  };
}

function boundedFrameInventoryRead(frame: Frame): Promise<{
  controls: ConsentUiInventoryControl[];
  textExcerpt: string;
} | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    frame.evaluate<{
      controls: ConsentUiInventoryControl[];
      textExcerpt: string;
    }>(() => {
      const controlSelector = "button, [role='button'], a, input[type='button'], input[type='submit']";
      const consentContextPattern = /cookie|cookies|privacy|consent|preference|preferences|optanon|onetrust|cmp|trustarc|didomi|usercentrics|cookiebot/i;
      const labelFor = (element: Element) => {
        const aria = element.getAttribute("aria-label");
        const title = element.getAttribute("title");
        const value = element instanceof HTMLInputElement ? element.value : null;
        const textContent = element.textContent;
        return (aria || title || value || textContent || "").replace(/\s+/g, " ").trim();
      };
      const selectorHintFor = (element: Element) => {
        const id = element.getAttribute("id");
        const dataTestId = element.getAttribute("data-testid");
        if (id) return `#${id}`;
        if (dataTestId) return `[data-testid="${dataTestId}"]`;
        return element.tagName.toLowerCase();
      };
      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.getAttribute("aria-hidden") !== "true" &&
          Number.parseFloat(style.opacity || "1") > 0.05
        );
      };
      const hasConsentContext = (element: Element) => {
        let current: Element | null = element;
        for (let depth = 0; current && depth < 6; depth += 1) {
          if (current === document.body || current === document.documentElement) {
            current = current.parentElement;
            continue;
          }
          const contextText = (current.textContent || "").replace(/\s+/g, " ").trim();
          const contextAttrs = [
            current.getAttribute("aria-label"),
            current.getAttribute("role"),
            current.getAttribute("id"),
            current.getAttribute("class"),
          ].filter(Boolean).join(" ");
          if (consentContextPattern.test(`${contextText} ${contextAttrs}`)) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      };
      const controls = Array.from(document.querySelectorAll(controlSelector))
        .slice(0, 80)
        .flatMap((element) => {
          const label = labelFor(element).slice(0, 120);
          if (!label || label.length > 120 || !isVisible(element) || !hasConsentContext(element)) {
            return [];
          }
          return [{
            actionType: "other" as const,
            label,
            role: element.getAttribute("role") || undefined,
            selectorHint: selectorHintFor(element),
            tagName: element.tagName.toLowerCase(),
            visible: true,
            frameUrl: window.location.href,
            inventoryContainerKey: `same_origin_frame:${window.location.href}`,
            inventoryRootSource: "document" as const,
            inventorySource: "same_origin_frame" as const,
          }];
        })
        .slice(0, 8);
      return {
        controls,
        textExcerpt: (document.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 2_000),
      };
    }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 500);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

type AccessibilityNodeValue = {
  value?: unknown;
};

export type ConsentAccessibilityTreeNode = {
  childIds?: string[];
  ignored?: boolean;
  name?: AccessibilityNodeValue;
  nodeId: string;
  role?: AccessibilityNodeValue;
};

const AX_CONSENT_CONTEXT_PATTERN =
  /cookie|cookies|privacy|consent|preference|preferences|analytics|optanon|onetrust|cmp|trustarc|didomi|usercentrics|cookiebot|zgod|zgoda|prywatno|pliki cookie|ustawienia|preferencj/i;

const AX_CONSENT_CONTAINER_ROLE_PATTERN =
  /^(?:alertdialog|dialog|region|banner)$/i;

async function readAccessibilityConsentInventory(page: Page): Promise<{
  controls: ConsentUiInventoryControl[];
  textExcerpts: string[];
}> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    (async () => {
      const client = await page.context().newCDPSession(page);
      try {
        const result = await client.send("Accessibility.getFullAXTree", {} as never) as {
          nodes?: ConsentAccessibilityTreeNode[];
        };
        return consentControlsFromAccessibilityTree(result.nodes ?? []);
      } finally {
        await client.detach().catch(() => undefined);
      }
    })(),
    new Promise<{ controls: ConsentUiInventoryControl[]; textExcerpts: string[] }>((resolve) => {
      timer = setTimeout(() => resolve({ controls: [], textExcerpts: [] }), 750);
    }),
  ]).catch(() => {
    return { controls: [], textExcerpts: [] };
  }).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export function consentControlsFromAccessibilityTree(
  nodes: ConsentAccessibilityTreeNode[],
): {
  controls: ConsentUiInventoryControl[];
  textExcerpts: string[];
} {
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  const parentById = new Map<string, string>();
  for (const node of nodes) {
    for (const childId of node.childIds ?? []) {
      parentById.set(childId, node.nodeId);
    }
  }
  const textExcerpts: string[] = [];
  const controls: ConsentUiInventoryControl[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (node.ignored === true) {
      continue;
    }
    const role = axStringValue(node.role).toLowerCase();
    if (role !== "button" && role !== "link") {
      continue;
    }
    const label = axStringValue(node.name).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!label || label.length > 120) {
      continue;
    }
    const container = nearestAccessibilityConsentContainer(node, nodesById, parentById);
    if (!container) {
      continue;
    }
    const contextText = collectAccessibilitySubtreeText(container, nodesById, 80);
    if (!AX_CONSENT_CONTEXT_PATTERN.test(contextText)) {
      continue;
    }
    const classification = classifyRuntimeConsentControlLabel({
      label,
      contextText,
      hasConsentContext: true,
    });
    if (classification.intent === "unknown") {
      continue;
    }
    if (
      classification.intent === "options" &&
      !/\b(?:we use cookies|use cookies|consent|accept|agree|allow|reject|decline|deny|refuse|analytics|tracking|marketing|privacy settings|privacy preferences|cookie preferences|similar techniques)\b|(?:zgod|akceptuj|odrzu|pliki cookie|prywatno|ustawienia|preferencj|centrum preferencji)/i.test(contextText)
    ) {
      continue;
    }
    const dedupeKey = `${container.nodeId}:${role}:${label.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    if (contextText && textExcerpts.length < 4 && !textExcerpts.includes(contextText)) {
      textExcerpts.push(contextText.slice(0, 2_000));
    }
    controls.push({
      actionType: "other",
      label,
      role,
      selectorHint: `ax:${node.nodeId}`,
      tagName: "ax-node",
      visible: true,
      inventoryContainerKey: `accessibility_tree:${container.nodeId}`,
      inventoryRootSource: "document",
      inventorySource: "accessibility_tree",
    });
    if (controls.length >= 12) {
      break;
    }
  }

  return {
    controls,
    textExcerpts,
  };
}

function nearestAccessibilityConsentContainer(
  node: ConsentAccessibilityTreeNode,
  nodesById: Map<string, ConsentAccessibilityTreeNode>,
  parentById: Map<string, string>,
) {
  let currentId: string | undefined = node.nodeId;
  for (let depth = 0; currentId && depth < 8; depth += 1) {
    const current = nodesById.get(currentId);
    if (!current) {
      return null;
    }
    const role = axStringValue(current.role);
    const name = axStringValue(current.name);
    const subtreeText = collectAccessibilitySubtreeText(current, nodesById, 60);
    const isLikelyConsentContainer = (
      AX_CONSENT_CONTAINER_ROLE_PATTERN.test(role) ||
      AX_CONSENT_CONTEXT_PATTERN.test(`${name} ${role}`)
    );
    if (
      current.nodeId !== node.nodeId &&
      isLikelyConsentContainer &&
      AX_CONSENT_CONTEXT_PATTERN.test(`${name} ${subtreeText}`) &&
      subtreeText.length <= 4_000
    ) {
      return current;
    }
    currentId = parentById.get(currentId);
  }
  return null;
}

function collectAccessibilitySubtreeText(
  root: ConsentAccessibilityTreeNode,
  nodesById: Map<string, ConsentAccessibilityTreeNode>,
  limit: number,
) {
  const values: string[] = [];
  const stack = [root.nodeId];
  const visited = new Set<string>();
  while (stack.length > 0 && values.length < limit) {
    const nodeId = stack.shift();
    if (!nodeId || visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node || node.ignored === true) {
      continue;
    }
    const name = axStringValue(node.name);
    if (name) {
      values.push(name);
    }
    for (const childId of node.childIds ?? []) {
      stack.push(childId);
    }
  }
  return unique(values).join(" ").replace(/\s+/g, " ").trim().slice(0, 4_000);
}

function axStringValue(value: AccessibilityNodeValue | undefined) {
  return typeof value?.value === "string" ? value.value : "";
}

const CONSENT_INVENTORY_PROBE_SCRIPT = String.raw`(() => {
    window.__certscoreConsentInventory = (allowFullDocumentCmpControls) => {
      const controlSelector = "button, [role='button'], a, input[type='button'], input[type='submit']";
      const customControlSelectors = [
        "[role='link']",
        "[tabindex='0']",
        "[onclick]",
        "[id*='button' i]",
        "[id*='btn' i]",
        "[id*='choice' i]",
        "[id*='option' i]",
        "[id*='preference' i]",
        "[id*='purpose' i]",
        "[class*='button' i]",
        "[class*='btn' i]",
        "[class*='choice' i]",
        "[class*='option' i]",
        "[class*='preference' i]",
        "[class*='purpose' i]",
      ].join(",");
      const strongCmpContainerPattern = /(?:^|[\s_-])(?:onetrust|optanon|ot-sdk|trustarc|didomi|usercentrics|cookiebot|consentmanager|cmp)(?:$|[\s_-])/i;
      const strongCmpIdPattern = /(?:onetrust|optanon|ot-sdk|trustarc|didomi|usercentrics|cookiebot|consentmanager|cmp)/i;
      const consentContextPattern = /cookie|cookies|privacy|consent|analytics|tracking|marketing|preference|preferences|optanon|onetrust|cmp|trustarc|didomi|usercentrics|cookiebot|zgod|zgoda|prywatno|pliki cookie|ustawienia|preferencj/i;
      const consentSurfaceTextPattern = /cookie|cookies|privacy settings|privacy preferences|analytics preferences|consent preferences|tracking preferences|pliki cookie|ustawienia prywatno|centrum preferencji|zgod[ay]/i;
      const consentSurfaceActionPattern = /consent|privacy|preference|preferences|setting|settings|choice|choices|accept|reject|decline|allow|manage|ablehnen|akzeptieren|zustimmen|einstellungen|accepter|refuser|param[eè]tres|g[eé]rer|akceptuj|odrzu|ustawienia|preferencj|zarządzaj/i;
      const labelFor = (element) => {
        const aria = element.getAttribute("aria-label");
        const title = element.getAttribute("title");
        const value = element instanceof HTMLInputElement ? element.value : null;
        const textContent = element.textContent;
        return (aria || title || value || textContent || "").replace(/\s+/g, " ").trim();
      };
      const selectorHintFor = (element) => {
        const id = element.getAttribute("id");
        const dataTestId = element.getAttribute("data-testid");
        const className = typeof element.getAttribute("class") === "string"
          ? element.getAttribute("class")?.split(/\s+/).filter(Boolean).slice(0, 3).join(".")
          : null;
        if (id) return "#" + id;
        if (dataTestId) return '[data-testid="' + dataTestId + '"]';
        if (className) return element.tagName.toLowerCase() + "." + className;
        return element.tagName.toLowerCase();
      };
      const parentFor = (element) => {
        if (element.parentElement) {
          return element.parentElement;
        }
        const root = element.getRootNode?.();
        return root && root.host instanceof Element ? root.host : null;
      };
      const isSameOriginFrameElement = (element) => element.ownerDocument !== document;
      const rootSourceFor = (element) => element.getRootNode?.() instanceof ShadowRoot ? "shadow_root" : "document";
      const collectRoots = () => {
        const roots = [document];
        const seen = new Set(roots);
        const visit = (root) => {
          const elements = Array.from(root.querySelectorAll?.("*") || []).slice(0, 1_500);
          for (const element of elements) {
            if (element.shadowRoot && !seen.has(element.shadowRoot)) {
              seen.add(element.shadowRoot);
              roots.push(element.shadowRoot);
              visit(element.shadowRoot);
            }
          }
        };
        visit(document);
        for (const iframe of Array.from(document.querySelectorAll("iframe")).slice(0, 8)) {
          try {
            const frameDocument = iframe.contentDocument;
            if (frameDocument?.body && !seen.has(frameDocument)) {
              seen.add(frameDocument);
              roots.push(frameDocument);
              visit(frameDocument);
            }
          } catch {
          }
        }
        return roots.slice(0, 40);
      };
      const queryAllRoots = (roots, selector, limit) => {
        const values = [];
        for (const root of roots) {
          values.push(...Array.from(root.querySelectorAll?.(selector) || []));
          if (values.length >= limit) {
            break;
          }
        }
        return values.slice(0, limit);
      };
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.getAttribute("aria-hidden") !== "true" &&
          Number.parseFloat(style.opacity || "1") > 0.05
        );
      };
      const isFirstLayerPosition = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.top <= window.innerHeight + 200 && rect.bottom >= -200;
      };
      const containerKindFor = (element) => {
        if (isFirstLayerPosition(element)) {
          const pageChrome = element.closest?.("footer,header,nav,aside,[role='navigation']");
          if (pageChrome) {
            const id = pageChrome.getAttribute("id") || "";
            const className = pageChrome.getAttribute("class") || "";
            const aria = pageChrome.getAttribute("aria-label") || "";
            const role = (pageChrome.getAttribute("role") || "").toLowerCase();
            const pageChromeText = (pageChrome.textContent || "").replace(/\s+/g, " ").trim();
            const pageChromeControlCount = pageChrome.querySelectorAll(controlSelector + ", [tabindex='0']").length;
            const pageChromeHasCmpIdentity = (
              strongCmpIdPattern.test(id) ||
              strongCmpContainerPattern.test(className) ||
              strongCmpContainerPattern.test(aria) ||
              pageChrome.matches?.("#onetrust-banner-sdk, #onetrust-consent-sdk, #onetrust-pc-sdk, .ot-sdk-container, .ot-sdk-row, [id^='onetrust-'], [id^='optanon'], [class*='onetrust' i], [class*='optanon' i], [class*='ot-sdk' i]")
            );
            const pageChromeLooksLikeConsentSurface = (
              pageChromeControlCount >= 2 &&
              !/^(?:navigation)$/i.test(role) &&
              consentSurfaceTextPattern.test(pageChromeText) &&
              consentSurfaceActionPattern.test(pageChromeText)
            );
            if (!pageChromeHasCmpIdentity && !pageChromeLooksLikeConsentSurface) {
              return { key: "ineligible", source: "ineligible" };
            }
          }
          return { key: "first_layer", source: "first_layer" };
        }
        if (!allowFullDocumentCmpControls) {
          return { key: "ineligible", source: "ineligible" };
        }
        let current = element;
        for (let depth = 0; current && depth < 8; depth += 1) {
          const id = current.getAttribute("id") || "";
          const className = current.getAttribute("class") || "";
          const aria = current.getAttribute("aria-label") || "";
          const role = (current.getAttribute("role") || "").toLowerCase();
          const dataAttrs = Array.from(current.attributes || [])
            .filter((attribute) => /^data-/i.test(attribute.name))
            .map((attribute) => attribute.name + "=" + attribute.value)
            .join(" ");
          const strongCmpContainer = (
            strongCmpIdPattern.test(id) ||
            strongCmpContainerPattern.test(className) ||
            strongCmpContainerPattern.test(aria) ||
            strongCmpContainerPattern.test(dataAttrs) ||
            current.matches?.("#onetrust-banner-sdk, #onetrust-consent-sdk, #onetrust-pc-sdk, .ot-sdk-container, .ot-sdk-row, [id^='onetrust-'], [id^='optanon'], [class*='onetrust' i], [class*='optanon' i], [class*='ot-sdk' i]")
          );
          if (strongCmpContainer) {
            return { key: selectorHintFor(current), source: "full_document_cmp" };
          }
          if (current === document.body || current === document.documentElement) {
            current = parentFor(current);
            continue;
          }
          const contextText = (current.textContent || "").replace(/\s+/g, " ").trim();
          if (contextText.length < 80 || contextText.length > 4_000) {
            current = parentFor(current);
            continue;
          }
          const tagName = current.tagName.toLowerCase();
          const style = window.getComputedStyle(current);
          const zIndex = Number.parseInt(style.zIndex || "0", 10);
          const dialogish = (
            role === "dialog" ||
            role === "alertdialog" ||
            role === "banner" ||
            current.getAttribute("aria-modal") === "true" ||
            style.position === "fixed" ||
            style.position === "sticky" ||
            Number.isFinite(zIndex) && zIndex >= 10
          );
          const genericPageChrome = /^(?:footer|header|nav|aside)$/i.test(tagName) || /(?:footer|header|navbar|navigation|breadcrumb|menu)/i.test(id + " " + className + " " + role);
          const controlCount = current.querySelectorAll(controlSelector + ", [tabindex='0']").length;
          if (
            controlCount >= 2 &&
            !genericPageChrome &&
            (dialogish || controlCount <= 8) &&
            consentSurfaceTextPattern.test(contextText) &&
            consentSurfaceActionPattern.test(contextText)
          ) {
            return { key: selectorHintFor(current), source: "full_document_consent_surface" };
          }
          current = parentFor(current);
        }
        return { key: "ineligible", source: "ineligible" };
      };
      const hasConsentContext = (element) => {
        let current = element;
        for (let depth = 0; current && depth < 8; depth += 1) {
          if (current === document.body || current === document.documentElement) {
            current = parentFor(current);
            continue;
          }
          const contextText = (current.textContent || "").replace(/\s+/g, " ").trim();
          const contextAttrs = [
            current.getAttribute("aria-label"),
            current.getAttribute("role"),
            current.getAttribute("id"),
            current.getAttribute("class"),
          ].filter(Boolean).join(" ");
          if (consentContextPattern.test(contextText + " " + contextAttrs)) {
            return true;
          }
          current = parentFor(current);
        }
        return false;
      };
      const isPotentialCustomControl = (element) => {
        const role = (element.getAttribute("role") || "").toLowerCase();
        const tabIndex = element.getAttribute("tabindex");
        const className = element.getAttribute("class") || "";
        const id = element.getAttribute("id") || "";
        const tagName = element.tagName.toLowerCase();
        const staticTextElement = /^(?:p|span|strong|em|small|h[1-6]|li|dt|dd)$/i.test(tagName);
        const hasExplicitControlSignal = (
          role === "button" ||
          role === "link" ||
          element.hasAttribute("onclick") ||
          /\b(?:btn|button|choice|option|preference|purpose)\b/i.test(className) ||
          /(?:btn|button|choice|option|preference|purpose)/i.test(id)
        );
        if (staticTextElement && !hasExplicitControlSignal) {
          return false;
        }
        return (
          role === "button" ||
          role === "link" ||
          tabIndex === "0" ||
          element.hasAttribute("onclick") ||
          /\b(?:btn|button|choice|option|preference|purpose)\b/i.test(className) ||
          /(?:btn|button|choice|option|preference|purpose)/i.test(id)
        );
      };
      const candidatePriority = (element) => {
        const label = labelFor(element).toLowerCase();
        const pageChrome = element.closest?.("footer,header,nav,aside,[role='navigation']");
        return (
          (isVisible(element) ? 100 : 0) +
          (hasConsentContext(element) ? 80 : 0) +
          (isFirstLayerPosition(element) ? 40 : 0) +
          (/\b(?:accept|reject|decline|allow|agree|settings|preferences|options|choices|cookie|cookies|consent|ablehnen|akzeptieren|accepter|refuser)\b|(?:akceptuj|odrzu|ustawienia|preferencj|pliki cookie|zgod)/i.test(label) ? 70 : 0) -
          (pageChrome ? 30 : 0)
        );
      };
      const roots = collectRoots();
      const directCandidates = queryAllRoots(roots, controlSelector, 2_500);
      const directSet = new Set(directCandidates);
      const rejectedReasons = new Set();
      const diagnosticLabels = [];
      const diagnosticContainers = new Set();
      const rememberCandidate = (element, label, reason) => {
        const safeLabel = (label || labelFor(element) || "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (safeLabel && diagnosticLabels.length < 24 && !diagnosticLabels.includes(safeLabel)) {
          diagnosticLabels.push(safeLabel);
        }
        if (reason) {
          rejectedReasons.add(reason);
        }
        const containerHint = selectorHintFor(element.closest?.("footer,header,nav,aside,[role='dialog'],[role='banner'],section,div") || element);
        diagnosticContainers.add(containerHint);
      };
      const textCandidates = queryAllRoots(roots, customControlSelectors, 350)
        .filter((element) => !directSet.has(element))
        .slice(0, 250)
        .filter((element) => {
          if (element.querySelector(controlSelector)) {
            return false;
          }
          if (!isPotentialCustomControl(element)) {
            return false;
          }
          const label = labelFor(element);
          if (!label || label.length > 140 || !hasConsentContext(element)) {
            rememberCandidate(element, label, "no_consent_context");
            return false;
          }
          return !Array.from(element.children).slice(0, 20).some((child) => {
            const childLabel = labelFor(child);
            return childLabel && childLabel !== label && childLabel.length <= 140;
          });
        });
      const candidates = [...directCandidates, ...textCandidates]
        .sort((left, right) => candidatePriority(right) - candidatePriority(left))
        .slice(0, 1_200);
      const seen = new Set();
      const controls = candidates.flatMap((element) => {
        if (!isVisible(element)) {
          rememberCandidate(element, "", "hidden");
          return [];
        }
        const label = labelFor(element).slice(0, 120);
        if (!label || label.length > 120 || !hasConsentContext(element)) {
          rememberCandidate(element, label, "no_consent_context");
          return [];
        }
        const container = containerKindFor(element);
        if (container.source === "ineligible") {
          const pageChrome = element.closest?.("footer,header,nav,aside,[role='navigation']");
          rememberCandidate(element, label, pageChrome ? "footer_nav_page_chrome" : "outside_eligible_surface");
          return [];
        }
        rememberCandidate(element, label, undefined);
        diagnosticContainers.add(container.key);
        const dedupeKey = label.toLowerCase() + ":" + container.key;
        if (seen.has(dedupeKey)) {
          return [];
        }
        seen.add(dedupeKey);
        const sameOriginFrameControl = isSameOriginFrameElement(element);
        return [{
          actionType: "other",
          label,
          role: element.getAttribute("role") || undefined,
          selectorHint: selectorHintFor(element),
          tagName: element.tagName.toLowerCase(),
          visible: true,
          frameUrl: sameOriginFrameControl ? element.ownerDocument.location?.href : undefined,
          inventoryContainerKey: sameOriginFrameControl ? "same_origin_frame:" + (element.ownerDocument.location?.href || "about:blank") : container.key,
          inventoryRootSource: rootSourceFor(element),
          inventorySource: sameOriginFrameControl ? "same_origin_frame" : container.source,
        }];
      }).slice(0, 12);
      return {
        controls,
        diagnostics: {
          candidateContainerCount: diagnosticContainers.size,
          candidateControlCount: candidates.length,
          candidateLabels: diagnosticLabels,
          rejectionReasons: Array.from(rejectedReasons),
        },
      };
    };
  })()`;

async function installConsentInventoryProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(CONSENT_INVENTORY_PROBE_SCRIPT);
}

function consentInventoryDiagnosticSources(
  inventorySources: Set<string>,
  rootSources: Set<string>,
): NonNullable<ConsentUiObservation["inventoryDiagnostics"]>["inventorySources"] {
  const sources: NonNullable<ConsentUiObservation["inventoryDiagnostics"]>["inventorySources"] = [];
  if (inventorySources.has("first_layer")) {
    sources.push("viewport");
  }
  if (inventorySources.has("full_document_cmp")) {
    sources.push("cmp_container");
  }
  if (inventorySources.has("full_document_consent_surface")) {
    sources.push("generic_consent_surface");
  }
  if (rootSources.has("shadow_root")) {
    sources.push("shadow_root");
  }
  if (inventorySources.has("same_origin_frame")) {
    sources.push("same_origin_frame");
  }
  if (inventorySources.has("accessibility_tree")) {
    sources.push("accessibility_tree");
  }
  return unique(sources) as typeof sources;
}

function consentUiControlActionTypeFromClassification(
  classification: ReturnType<typeof classifyConsentControlLabel>,
): ConsentUiObservation["controls"][number]["actionType"] | null {
  switch (classification.intent) {
    case "accept":
      return "accept_all";
    case "reject":
      if (classification.variant === "reject_with_subscription") {
        return "other";
      }
      return "reject_all";
    case "options":
      return classification.variant === "save_preferences" ? "save_preferences" : "manage_preferences";
    case "privacy_opt_out":
      return "do_not_sell_share";
    case "unknown":
      return null;
  }
}

function classifyRuntimeConsentControlLabel(input: Parameters<typeof classifyConsentControlLabel>[0]) {
  const defaultClassification = classifyConsentControlLabel(input);
  if (defaultClassification.intent !== "unknown") {
    return defaultClassification;
  }
  const multilingualClassification = classifyConsentControlLabel({
    ...input,
    classifierProfile: "multilingual_v1",
    hasConsentContext: true,
  });
  if (isProductionCreditworthyPolishConsentControlClassification(input.label, multilingualClassification)) {
    return multilingualClassification;
  }
  return defaultClassification;
}

function buildConsentUiObservationFromEvidence(input: {
  controls: ConsentUiObservation["controls"];
  defaultToggleEvidence?: ConsentDefaultToggleEvidence;
  fallbackBasis?: string[];
  inventoryDiagnostics?: ConsentUiObservation["inventoryDiagnostics"];
  scanStartedAtMs: number;
  text: string;
}): ConsentUiObservation {
  const { controls, defaultToggleEvidence, fallbackBasis = [], inventoryDiagnostics, scanStartedAtMs, text } = input;
  const normalized = text.toLowerCase();
  const keywords = [
    "cookie",
    "cookies",
    "cookie-einstellungen",
    "consent",
    "analytics preferences",
    "privacy settings",
    "privacy preferences",
    "accept all",
    "reject all",
    "manage preferences",
  ];
  const matched = keywords.filter((keyword) => normalized.includes(keyword));
  const visibleChoiceLabels = controls.map((control) => control.label);
  const acceptControlObserved = controls.some((control) => control.actionType === "accept_all");
  const rejectControlObserved = controls.some((control) => control.actionType === "reject_all");
  const managePreferencesControlObserved = controls.some((control) =>
    control.actionType === "manage_preferences" || control.actionType === "save_preferences"
  );
  const controlBasis = controls.map((control) => `control:${control.actionType}:${control.label}`);
  const likelyPresent = matched.length >= 2 || controls.length > 0;
  return {
    observationId: "consent_ui_pre_consent",
    observedAtMs: elapsed(scanStartedAtMs),
    likelyPresent,
    basis: likelyPresent ? [
      ...fallbackBasis,
      ...matched.map((keyword) => `keyword:${keyword}`),
      ...controlBasis,
    ] : [...fallbackBasis, "insufficient_banner_keywords"],
    textExcerpt: text.slice(0, 2_000),
    layerInspected: controls.length > 0 ? "first_layer" : "unknown",
    visibleChoiceLabels,
    defaultToggleStatesObserved: defaultToggleEvidence?.defaultToggleStatesObserved ?? null,
    nonEssentialDefaultsOff: defaultToggleEvidence?.nonEssentialDefaultsOff ?? null,
    defaultTogglePurposeLabels: defaultToggleEvidence?.defaultTogglePurposeLabels ?? [],
    precheckedOptionalPurposeCount: defaultToggleEvidence?.precheckedOptionalPurposeCount ?? 0,
    precheckedOptionalPurposeLabels: defaultToggleEvidence?.precheckedOptionalPurposeLabels ?? [],
    acceptControlObserved,
    rejectControlObserved,
    managePreferencesControlObserved,
    controls,
    inventoryDiagnostics,
    evidenceRefs: [],
    confidence: controls.length > 0 ? 0.86 : matched.length >= 2 ? 0.72 : 0.5,
  };
}

function shouldRecaptureConsentUiAfterTimeout(
  observation: ConsentUiObservation,
  options: { fastWait: boolean },
): boolean {
  if (options.fastWait && hasTextBackedConsentSurface(observation)) {
    return false;
  }
  return observation.basis.includes("bounded_capture_timeout_or_failure") &&
    (
      !observation.likelyPresent ||
      observation.controls.length === 0 ||
      observation.visibleChoiceLabels.length === 0
    );
}

function shouldRecaptureConsentUiAfterScreenshot(
  observation: ConsentUiObservation,
  domText = "",
  options: {
    fastWait?: boolean;
    visualCaptureAvailable?: boolean;
  } = {},
): boolean {
  if (isTerminalVisualErrorShellText(domText)) {
    return false;
  }
  if (
    options.fastWait &&
    options.visualCaptureAvailable &&
    hasTextBackedConsentSurface(observation)
  ) {
    return false;
  }
  return (observation.likelyPresent && observation.controls.length === 0) ||
    shouldRecaptureConsentUiAfterTimeout(observation, { fastWait: options.fastWait === true });
}

function shouldRecaptureConsentUiAfterCmpRuntime(
  observation: ConsentUiObservation,
  domText: string,
  cmpRuntimeObservations: CmpRuntimeObservation[],
): boolean {
  if (cmpRuntimeObservations.length === 0 || hasActionableConsentChoiceControl(observation)) {
    return false;
  }
  if (isTerminalVisualErrorShellText(domText || observation.textExcerpt || "")) {
    return false;
  }
  if (hasRetainedSettingsPreferencesControl(observation)) {
    return true;
  }
  if (hasStrongTextBackedFirstLayerConsentSurface(observation)) {
    return true;
  }
  if (hasHighConfidenceInteractiveCmpRuntimeEvidence(cmpRuntimeObservations)) {
    return true;
  }
  return observation.controls.length === 0 &&
    likelyFirstLayerConsentBannerHintText(domText || observation.textExcerpt || "");
}

function shouldRecaptureConsentUiAfterSupplementalScreenshot(
  observation: ConsentUiObservation,
  cmpRuntimeObservations: CmpRuntimeObservation[],
): boolean {
  if (hasHighConfidenceInteractiveCmpRuntimeEvidence(cmpRuntimeObservations)) {
    return true;
  }
  if (hasActionableConsentChoiceControl(observation)) {
    return false;
  }
  return hasTextBackedConsentSurface(observation) ||
    likelyFirstLayerConsentBannerHintText(observation.textExcerpt ?? "");
}

function hasHighConfidenceInteractiveCmpRuntimeEvidence(
  cmpRuntimeObservations: CmpRuntimeObservation[],
): boolean {
  return cmpRuntimeObservations.some((observation) =>
    observation.confidence >= 0.9 &&
    observation.signals.some((signal) =>
      signal.confidence >= 0.85 &&
      (
        signal.signalType === "script_url" ||
        signal.signalType === "global" ||
        signal.signalType === "dom_selector"
      )
    )
  );
}

function shouldRecaptureTextBackedConsentUiAfterSettle(
  observation: ConsentUiObservation,
  domText = "",
): boolean {
  if (observation.controls.length > 0 || observation.visibleChoiceLabels.length > 0) {
    return false;
  }
  if (isTerminalVisualErrorShellText(domText || observation.textExcerpt || "")) {
    return false;
  }
  return hasTextBackedConsentSurface(observation) || likelyLateFirstLayerConsentSurfaceText(domText);
}

function likelyLateFirstLayerConsentSurfaceText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized || normalized.length > 12_000) {
    return false;
  }
  return /\b(?:cookie|cookies|cookie-einstellungen|consent|analytics preferences|privacy settings|privacy preferences|privacy choices)\b/i.test(normalized) &&
    /\b(?:accept|agree|allow|reject|decline|deny|refuse|setting|settings|preferences|choices|choose|options|necessary|essential|akzeptieren|ablehnen|zustimmen|einstellungen|accepter|refuser|param[eè]tres|g[eé]rer)\b/i.test(normalized);
}

function hasActionableConsentChoiceControl(observation: ConsentUiObservation): boolean {
  return observation.controls.some((control) =>
    control.actionType === "accept_all" || control.actionType === "reject_all"
  );
}

function hasRetainedSettingsPreferencesControl(observation: ConsentUiObservation): boolean {
  return observation.controls.some((control) => control.actionType === "manage_preferences");
}

function hasStrongTextBackedFirstLayerConsentSurface(observation: ConsentUiObservation): boolean {
  return hasTextBackedConsentSurface(observation) &&
    likelyFirstLayerConsentBannerHintText(observation.textExcerpt ?? "");
}

function hasTextBackedConsentSurface(observation: ConsentUiObservation): boolean {
  if (!observation.likelyPresent || observation.controls.length > 0) {
    return false;
  }
  const keywordBasisCount = observation.basis.filter((basis) => basis.startsWith("keyword:")).length;
  return keywordBasisCount >= 2 && (observation.textExcerpt ?? "").trim().length >= 80;
}

function likelyFirstLayerConsentBannerHintText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized || normalized.length > 12_000) {
    return false;
  }
  const hasConsentSubject = /\b(?:cookie|cookies|cookie-einstellungen|consent|analytics preferences|privacy settings|privacy preferences|privacy choices)\b/i.test(normalized);
  const hasChoiceLanguage = /\b(?:accept|agree|allow|reject|decline|deny|refuse|setting|settings|preferences|choices|choose|manage|options|necessary|essential|akzeptieren|ablehnen|zustimmen|einstellungen|accepter|refuser|param[eè]tres|g[eé]rer)\b/i.test(normalized);
  const hasBannerUseLanguage =
    /\bwe use (?:cookies|similar technologies)\b/i.test(normalized) ||
    /\buse cookies\b/i.test(normalized) ||
    /\byour cookie(?:s)?\b/i.test(normalized) ||
    /\banalytics preferences\b/i.test(normalized) ||
    /\bcookie preferences\b/i.test(normalized) ||
    /\bconsent setting\b/i.test(normalized) ||
    /\bprivacy settings\b/i.test(normalized) ||
    /\bprivacy preferences\b/i.test(normalized);
  return hasConsentSubject && (hasChoiceLanguage || hasBannerUseLanguage);
}

function isTerminalVisualErrorShellText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized || normalized.length > 500) {
    return false;
  }
  return /^(?:unknown error|access denied|access to this site has been denied|forbidden|internal server error|service unavailable|request blocked)$/i.test(normalized) ||
    /\b(?:access denied|access to this site has been denied|request blocked|bot protection|forbidden|http 403|403 forbidden)\b/i.test(normalized);
}

function isStrongerConsentUiObservation(
  candidate: ConsentUiObservation,
  current: ConsentUiObservation,
): boolean {
  if (candidate.basis.some((basis) =>
    (basis.startsWith("inventory:full_document_") || basis === "inventory:open_shadow_root_controls") &&
    !current.basis.includes(basis)
  )) {
    return true;
  }
  if (candidate.controls.length > current.controls.length) {
    return true;
  }
  if (candidate.visibleChoiceLabels.length > current.visibleChoiceLabels.length) {
    return true;
  }
  if (!current.rejectControlObserved && candidate.rejectControlObserved) {
    return true;
  }
  if (!current.acceptControlObserved && candidate.acceptControlObserved) {
    return true;
  }
  if (current.defaultToggleStatesObserved !== true && candidate.defaultToggleStatesObserved === true) {
    return true;
  }
  return !current.likelyPresent && candidate.likelyPresent;
}

function mergeConsentUiObservations(
  current: ConsentUiObservation,
  candidate: ConsentUiObservation,
  basis: string,
): ConsentUiObservation {
  const controls = uniqueConsentObservationControls([
    ...current.controls,
    ...candidate.controls,
  ]);
  const visibleChoiceLabels = unique([
    ...current.visibleChoiceLabels,
    ...candidate.visibleChoiceLabels,
    ...controls.map((control) => control.label),
  ]).slice(0, 24);
  return {
    ...candidate,
    acceptControlObserved: current.acceptControlObserved || candidate.acceptControlObserved ||
      controls.some((control) => control.actionType === "accept_all"),
    basis: unique([
      ...current.basis,
      ...candidate.basis,
      basis,
    ]),
    controls,
    defaultTogglePurposeLabels: unique([
      ...(current.defaultTogglePurposeLabels ?? []),
      ...(candidate.defaultTogglePurposeLabels ?? []),
    ]).slice(0, 12),
    defaultToggleStatesObserved: candidate.defaultToggleStatesObserved ?? current.defaultToggleStatesObserved ?? null,
    confidence: Math.max(current.confidence, candidate.confidence),
    evidenceRefs: uniqueEvidenceRefs([
      ...current.evidenceRefs,
      ...candidate.evidenceRefs,
    ]),
    nonEssentialDefaultsOff: candidate.nonEssentialDefaultsOff ?? current.nonEssentialDefaultsOff ?? null,
    managePreferencesControlObserved: current.managePreferencesControlObserved || candidate.managePreferencesControlObserved ||
      controls.some((control) => control.actionType === "manage_preferences" || control.actionType === "save_preferences"),
    precheckedOptionalPurposeCount: unique([
      ...(current.precheckedOptionalPurposeLabels ?? []),
      ...(candidate.precheckedOptionalPurposeLabels ?? []),
    ]).length,
    precheckedOptionalPurposeLabels: unique([
      ...(current.precheckedOptionalPurposeLabels ?? []),
      ...(candidate.precheckedOptionalPurposeLabels ?? []),
    ]).slice(0, 10),
    rejectControlObserved: current.rejectControlObserved || candidate.rejectControlObserved ||
      controls.some((control) => control.actionType === "reject_all"),
    visibleChoiceLabels,
  };
}

function uniqueConsentObservationControls(
  controls: ConsentUiObservation["controls"],
): ConsentUiObservation["controls"] {
  const seen = new Set<string>();
  const uniqueControls: ConsentUiObservation["controls"] = [];
  for (const control of controls) {
    const key = [
      control.actionType,
      control.label.trim().toLowerCase(),
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueControls.push(control);
  }
  return uniqueControls.slice(0, 24);
}

function annotateConsentUiObservation(
  observation: ConsentUiObservation,
  basis: string,
): ConsentUiObservation {
  return {
    ...observation,
    basis: unique([
      ...observation.basis,
      basis,
    ]),
  };
}

function annotateConsentInventoryTimingMarkers(
  observation: ConsentUiObservation,
  markers: string[],
): ConsentUiObservation {
  const currentDiagnostics = observation.inventoryDiagnostics;
  return {
    ...observation,
    inventoryDiagnostics: {
      candidateContainerCount: currentDiagnostics?.candidateContainerCount ?? 0,
      candidateControlCount: currentDiagnostics?.candidateControlCount ?? 0,
      retainedControlCount: currentDiagnostics?.retainedControlCount ?? observation.controls.length,
      inventorySources: currentDiagnostics?.inventorySources ?? [],
      candidateLabels: currentDiagnostics?.candidateLabels ?? [],
      rejectionReasons: currentDiagnostics?.rejectionReasons ?? [],
      timingMarkers: unique([
        ...(currentDiagnostics?.timingMarkers ?? []),
        ...markers,
      ]),
    },
  };
}

function uniqueRejectionReasons(
  values: Iterable<NonNullable<ConsentUiObservation["inventoryDiagnostics"]>["rejectionReasons"][number]>,
): NonNullable<ConsentUiObservation["inventoryDiagnostics"]>["rejectionReasons"] {
  return unique([...values]) as NonNullable<ConsentUiObservation["inventoryDiagnostics"]>["rejectionReasons"];
}

function classifyCollectionSurface(input: {
  fieldTypes: string[];
  labels: string[];
}): CollectionSurfaceObservation["surfaceType"] {
  const haystack = `${input.fieldTypes.join(" ")} ${input.labels.join(" ")}`.toLowerCase();
  if (/search/.test(haystack)) {
    return "search";
  }
  if (/newsletter|subscribe|email updates|sign up/.test(haystack)) {
    return "newsletter";
  }
  if (/contact|message|support/.test(haystack)) {
    return "contact";
  }
  if (/login|sign in|account|register|password/.test(haystack)) {
    return "account";
  }
  if (/checkout|payment|billing|shipping|cart/.test(haystack)) {
    return "checkout";
  }
  return input.fieldTypes.length > 0 ? "generic_form" : "other";
}

async function captureCollectionSurfaceObservations(
  page: Page,
  scanStartedAtMs: number,
  pageUrl: string,
): Promise<CollectionSurfaceObservation[]> {
  const rows = await page.evaluate(() => {
    const textFor = (element: Element) => {
      const labels = new Set<string>();
      const id = element.getAttribute("id");
      const ariaLabel = element.getAttribute("aria-label");
      const placeholder = element.getAttribute("placeholder");
      const name = element.getAttribute("name");
      const type = element.getAttribute("type");
      const role = element.getAttribute("role");
      if (ariaLabel) labels.add(ariaLabel);
      if (placeholder) labels.add(placeholder);
      if (name) labels.add(name);
      if (type) labels.add(type);
      if (role) labels.add(role);
      if (id) {
        document.querySelectorAll(`label[for="${CSS.escape(id)}"]`).forEach((label) => {
          const text = label.textContent?.trim();
          if (text) labels.add(text);
        });
      }
      const closestLabel = element.closest("label")?.textContent?.trim();
      if (closestLabel) labels.add(closestLabel);
      return [...labels].map((label) => label.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6);
    };
    return [...document.querySelectorAll("input, textarea, select")]
      .filter((element) => {
        const input = element as HTMLInputElement;
        const type = (input.getAttribute("type") || "").toLowerCase();
        return !["hidden", "submit", "button", "reset", "image"].includes(type);
      })
      .slice(0, 40)
      .map((element, index) => {
        const input = element as HTMLInputElement;
        const form = element.closest("form");
        const formText = form?.textContent?.replace(/\s+/g, " ").trim().slice(0, 160);
        return {
          fieldType: (input.getAttribute("type") || element.tagName.toLowerCase()).toLowerCase(),
          index,
          labels: [...new Set([...textFor(element), ...(formText ? [formText] : [])])].slice(0, 8),
        };
      });
  }).catch(() => []);

  return rows.slice(0, 25).map((row, index) => {
    const labels = row.labels.map((label) => label.slice(0, 120)).filter(Boolean);
    const fieldTypes = [...new Set([row.fieldType].filter(Boolean))];
    const surfaceType = classifyCollectionSurface({ fieldTypes, labels });
    const haystack = labels.join(" ").toLowerCase();
    return {
      observationId: `collection_surface_pre_consent_${index}`,
      observedAtMs: elapsed(scanStartedAtMs),
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      consentStateAtTime: "pre_consent",
      pageUrl,
      surfaceType,
      controlCount: 1,
      fieldTypes,
      labels,
      hasEmailField: fieldTypes.includes("email") || /email|e-mail/.test(haystack),
      hasSensitiveFieldHint: /health|medical|password|ssn|social security|credit card|card number|birth|date of birth/.test(haystack),
      evidenceRefs: [],
      confidence: labels.length > 0 ? 0.82 : 0.68,
      directVsInferred: "direct",
    };
  });
}

async function captureTransportSecurityObservation(input: {
  artifactWriter: ArtifactWriter;
  collectionSurfaceObservations: CollectionSurfaceObservation[];
  failedHttpRequests: Array<{ url: string; resourceType?: string; failureText?: string; pageUrl?: string }>;
  mixedContentConsoleMessages: string[];
  networkEvents: NetworkEvent[];
  normalizedUrl: string;
  page: Page;
  requestedUrl: string;
  scanStartedAtMs: number;
}): Promise<{ observation: TransportSecurityObservation; artifactRef?: ArtifactRef }> {
  const pageUrl = safePageUrl(input.page, input.normalizedUrl);
  const pageForms = await captureFormTransportObservations(input.page, pageUrl).catch(() => []);
  const collectionSurfaceForms = input.collectionSurfaceObservations.map((surface, index) =>
    formTransportFromCollectionSurface(surface, index, pageUrl)
  );
  const formTransports = dedupeFormTransports([...pageForms, ...collectionSurfaceForms]).slice(0, 40);
  const loadedHttpSubresources = input.networkEvents
    .filter((event) => isMixedContentNetworkEvent(event))
    .map((event) => ({
      disposition: "loaded" as const,
      evidenceSource: "network_request" as const,
      hostname: event.hostname,
      pageUrl: sanitizeTransportUrl(event.documentUrl ?? event.topLevelUrl ?? pageUrl),
      resourceType: event.resourceType,
      url: sanitizeTransportUrl(event.requestUrl),
    }))
    .slice(0, 25);
  const blockedHttpSubresources = [
    ...input.failedHttpRequests
      .filter((request) =>
        schemeOf(request.url) === "http" &&
        schemeOf(request.pageUrl ?? pageUrl) === "https" &&
        /mixed|blocked|insecure|not allowed|upgrade/i.test(request.failureText ?? "")
      )
      .map((request) => ({
        disposition: "blocked" as const,
        evidenceSource: "request_failed" as const,
        hostname: getHostname(request.url) ?? undefined,
        pageUrl: sanitizeTransportUrl(request.pageUrl ?? pageUrl),
        resourceType: request.resourceType,
        url: sanitizeTransportUrl(request.url),
      })),
    ...input.mixedContentConsoleMessages.flatMap((message) => {
      const url = firstHttpUrl(message);
      return url
        ? [{
          disposition: "blocked" as const,
          evidenceSource: "console" as const,
          hostname: getHostname(url) ?? undefined,
          pageUrl: sanitizeTransportUrl(pageUrl),
          resourceType: "unknown",
          url: sanitizeTransportUrl(url),
        }]
        : [];
    }),
  ].slice(0, 25);
  const [httpProbe, tlsProbe] = await Promise.all([
    probeHttpRedirect(input.normalizedUrl),
    probeStrictTls(input.normalizedUrl),
  ]);
  const observation: TransportSecurityObservation = {
    observationId: "transport_security_pre_consent",
    observedAtMs: elapsed(input.scanStartedAtMs),
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    requestedUrl: sanitizeTransportUrl(input.requestedUrl),
    normalizedUrl: sanitizeTransportUrl(input.normalizedUrl),
    requestedScheme: schemeOf(input.requestedUrl),
    finalUrl: sanitizeTransportUrl(pageUrl),
    finalScheme: schemeOf(pageUrl),
    sampledPageUrls: unique([input.normalizedUrl, pageUrl].map((url) => sanitizeTransportUrl(url))).slice(0, 20),
    pageHttpsObserved: schemeOf(pageUrl) === "https",
    httpProbe,
    tlsProbe,
    mixedContent: {
      loadedHttpSubresources,
      blockedHttpSubresources,
      observedCount: loadedHttpSubresources.length + blockedHttpSubresources.length,
    },
    formTransports,
    summary: {
      scannedPagesUseHttps: schemeOf(pageUrl) === "https",
      validTlsCertificate: tlsProbe.validCertificate,
      httpRedirectsToHttps: httpProbe.redirectedToHttps,
      mixedContentObserved: loadedHttpSubresources.length + blockedHttpSubresources.length > 0,
      insecureFormTransportObserved: formTransports.some((form) => form.insecureTransportObserved),
    },
    evidenceRefs: [{ refId: "ref_transport_security", artifactId: "transport_security_observation" }],
    confidence: 0.94,
    directVsInferred: "direct",
  };
  const path = await input.artifactWriter.writeJsonArtifact("TransportSecurityObservation.json", observation);
  return {
    observation,
    artifactRef: {
      artifactId: "transport_security_observation",
      artifactType: "json",
      path,
      createdAt: new Date().toISOString(),
      observedAtMs: observation.observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario: SCENARIO,
      relatedEventIds: [],
      sensitivity: "redacted",
      redactionStatus: "redacted",
      label: "Transport security observation",
    },
  };
}

function emptyTransportSecurityObservation(input: {
  normalizedUrl: string;
  reason: string;
  requestedUrl: string;
  scanStartedAtMs: number;
}): TransportSecurityObservation {
  return {
    observationId: "transport_security_pre_consent",
    observedAtMs: elapsed(input.scanStartedAtMs),
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    requestedUrl: sanitizeTransportUrl(input.requestedUrl),
    normalizedUrl: sanitizeTransportUrl(input.normalizedUrl),
    requestedScheme: schemeOf(input.requestedUrl),
    finalScheme: "unknown",
    sampledPageUrls: [],
    pageHttpsObserved: false,
    httpProbe: {
      attempted: false,
      errorCategory: "unknown",
      errorMessage: input.reason,
      redirectChain: [],
    },
    tlsProbe: {
      attempted: false,
      errorCategory: "unknown",
      errorMessage: input.reason,
    },
    mixedContent: {
      loadedHttpSubresources: [],
      blockedHttpSubresources: [],
      observedCount: 0,
    },
    formTransports: [],
    summary: {
      mixedContentObserved: false,
      insecureFormTransportObserved: false,
    },
    evidenceRefs: [],
    confidence: 0.4,
    directVsInferred: "direct",
  };
}

async function probeHttpRedirect(normalizedUrl: string): Promise<TransportSecurityObservation["httpProbe"]> {
  const inputUrl = originProbeUrl(normalizedUrl, "http");
  if (!inputUrl) {
    return { attempted: false, errorCategory: "unsupported_url", redirectChain: [] };
  }

  const redirectChain = [inputUrl];
  let currentUrl = inputUrl;
  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetchWithTimeout(currentUrl, 8_000);
      const location = response.headers.get("location");
      const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);
      if (!isRedirect || !location) {
        return {
          attempted: true,
          inputUrl: sanitizeTransportUrl(inputUrl),
          status: response.status,
          finalUrl: sanitizeTransportUrl(currentUrl),
          finalScheme: schemeOf(currentUrl),
          redirectChain: redirectChain.map((url) => sanitizeTransportUrl(url)).slice(0, 12),
          redirectedToHttps: schemeOf(currentUrl) === "https" && redirectChain.length > 1,
        };
      }

      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push(nextUrl);
      if (schemeOf(nextUrl) === "https") {
        return {
          attempted: true,
          inputUrl: sanitizeTransportUrl(inputUrl),
          status: response.status,
          finalUrl: sanitizeTransportUrl(nextUrl),
          finalScheme: "https",
          redirectChain: redirectChain.map((url) => sanitizeTransportUrl(url)).slice(0, 12),
          redirectedToHttps: true,
        };
      }
      currentUrl = nextUrl;
    }

    return {
      attempted: true,
      inputUrl: sanitizeTransportUrl(inputUrl),
      finalUrl: sanitizeTransportUrl(currentUrl),
      finalScheme: schemeOf(currentUrl),
      redirectChain: redirectChain.map((url) => sanitizeTransportUrl(url)).slice(0, 12),
      redirectedToHttps: schemeOf(currentUrl) === "https" && redirectChain.length > 1,
      errorCategory: "http_error",
      errorMessage: "redirect_chain_limit_reached",
    };
  } catch (error) {
    return {
      attempted: true,
      inputUrl: sanitizeTransportUrl(inputUrl),
      errorCategory: classifyTransportProbeError(error),
      errorMessage: boundedProbeError(error),
      finalUrl: sanitizeTransportUrl(currentUrl),
      finalScheme: schemeOf(currentUrl),
      redirectChain: redirectChain.map((url) => sanitizeTransportUrl(url)).slice(0, 12),
    };
  }
}

async function probeStrictTls(normalizedUrl: string): Promise<TransportSecurityObservation["tlsProbe"]> {
  const inputUrl = originProbeUrl(normalizedUrl, "https");
  if (!inputUrl) {
    return { attempted: false, errorCategory: "unsupported_url" };
  }
  const parsed = new URL(inputUrl);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: TransportSecurityObservation["tlsProbe"]) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const socket = tlsConnect({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 443,
      rejectUnauthorized: true,
      ...(isIP(parsed.hostname) ? {} : { servername: parsed.hostname }),
    }, () => {
      settle({
        attempted: true,
        inputUrl: sanitizeTransportUrl(inputUrl),
        finalUrl: sanitizeTransportUrl(inputUrl),
        validCertificate: socket.authorized,
        ...(socket.authorized
          ? {}
          : {
            errorCategory: "tls_or_certificate_failure" as const,
            errorMessage: socket.authorizationError ? String(socket.authorizationError).slice(0, 240) : "certificate_not_authorized",
          }),
      });
      socket.end();
    });
    const timeout = setTimeout(() => {
      socket.destroy(new Error("strict TLS probe timed out"));
      settle({
        attempted: true,
        inputUrl: sanitizeTransportUrl(inputUrl),
        validCertificate: false,
        errorCategory: "timeout",
        errorMessage: "strict TLS probe timed out",
      });
    }, 5_000);
    socket.on("error", (error) => {
      settle({
        attempted: true,
        inputUrl: sanitizeTransportUrl(inputUrl),
        validCertificate: false,
        errorCategory: classifyTransportProbeError(error),
        errorMessage: boundedProbeError(error),
      });
    });
  });
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const headResponse = await fetchOnceWithTimeout(url, Math.min(2_000, timeoutMs), "HEAD").catch(() => null);
  if (headResponse) {
    return headResponse;
  }
  return fetchOnceWithTimeout(url, timeoutMs, "GET");
}

async function fetchOnceWithTimeout(url: string, timeoutMs: number, method: "GET" | "HEAD") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("HTTP redirect probe timed out")), timeoutMs);
  try {
    return await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function captureFormTransportObservations(page: Page, pageUrl: string): Promise<TransportSecurityObservation["formTransports"]> {
  const rows = await page.evaluate(() => [...document.querySelectorAll("form")].slice(0, 40).map((form, index) => {
    const fields = [...form.querySelectorAll("input, textarea, select")].slice(0, 24).map((element) => {
      const input = element as HTMLInputElement;
      return {
        type: (input.getAttribute("type") || element.tagName.toLowerCase()).toLowerCase(),
        label: [
          input.getAttribute("aria-label"),
          input.getAttribute("placeholder"),
          input.getAttribute("name"),
          input.getAttribute("id"),
        ].filter(Boolean).join(" "),
      };
    });
    return {
      action: form.getAttribute("action") || "",
      actionPresent: form.hasAttribute("action"),
      index,
      method: (form.getAttribute("method") || "get").toLowerCase(),
      resolvedAction: form.action || window.location.href,
      fields,
    };
  }));
  return rows.map((row) => {
    const haystack = row.fields.map((field) => `${field.type} ${field.label}`).join(" ").toLowerCase();
    const actionUrl = sanitizeTransportUrl(row.resolvedAction || pageUrl);
    const actionScheme = schemeOf(actionUrl);
    const pageScheme = schemeOf(pageUrl);
    return {
      formId: `form_${row.index}`,
      pageUrl: sanitizeTransportUrl(pageUrl),
      pageScheme,
      method: row.method.slice(0, 16),
      actionPresent: row.actionPresent,
      actionUrl,
      actionScheme,
      resolvesToHttps: actionScheme === "https" || (!row.actionPresent && pageScheme === "https"),
      insecureTransportObserved: actionScheme === "http" || pageScheme === "http",
      fieldTypes: unique(row.fields.map((field) => field.type).filter(Boolean)).slice(0, 24),
      hasEmailField: /\bemail|e-mail\b/.test(haystack),
      hasSensitiveFieldHint: /password|ssn|social security|credit card|card number|health|medical|birth|date of birth/.test(haystack),
    };
  });
}

function formTransportFromCollectionSurface(
  surface: CollectionSurfaceObservation,
  index: number,
  fallbackPageUrl: string,
): TransportSecurityObservation["formTransports"][number] {
  const pageUrl = sanitizeTransportUrl(surface.pageUrl || fallbackPageUrl);
  const pageScheme = schemeOf(pageUrl);
  return {
    formId: `collection_surface_${index}`,
    pageUrl,
    pageScheme,
    method: "unknown",
    actionPresent: false,
    actionUrl: pageUrl,
    actionScheme: pageScheme,
    resolvesToHttps: pageScheme === "https",
    insecureTransportObserved: pageScheme === "http",
    fieldTypes: unique(surface.fieldTypes ?? []).slice(0, 24),
    hasEmailField: surface.hasEmailField,
    hasSensitiveFieldHint: surface.hasSensitiveFieldHint,
  };
}

function dedupeFormTransports(forms: TransportSecurityObservation["formTransports"]) {
  const seen = new Set<string>();
  return forms.filter((form) => {
    const key = `${form.pageUrl}|${form.actionUrl ?? ""}|${form.method}|${form.fieldTypes.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isMixedContentNetworkEvent(event: NetworkEvent) {
  if (event.isMainFrame || schemeOf(event.requestUrl) !== "http") {
    return false;
  }
  return schemeOf(event.documentUrl ?? event.topLevelUrl ?? "") === "https";
}

function originProbeUrl(value: string, scheme: "http" | "https") {
  try {
    const parsed = new URL(value);
    if (!parsed.hostname) {
      return undefined;
    }
    return `${scheme}://${parsed.host}/`;
  } catch {
    return undefined;
  }
}

function firstHttpUrl(value: string) {
  return value.match(/https?:\/\/[^\s"'<>)]{1,500}/i)?.[0];
}

function safePageUrl(page: Page, fallbackUrl: string) {
  try {
    const pageUrl = page.url();
    return pageUrl === "about:blank" ? fallbackUrl : pageUrl;
  } catch {
    return fallbackUrl;
  }
}

function sanitizeTransportUrl(value: string): string;
function sanitizeTransportUrl(value: undefined): undefined;
function sanitizeTransportUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(key, "[redacted]");
    }
    return parsed.toString().slice(0, 500);
  } catch {
    return value.replace(/\s+/g, " ").slice(0, 500);
  }
}

function schemeOf(value: string | undefined): TransportSecurityObservation["requestedScheme"] {
  if (!value) {
    return "unknown";
  }
  try {
    const protocol = new URL(value).protocol.replace(":", "");
    return protocol === "http" || protocol === "https" ? protocol : "other";
  } catch {
    return "unknown";
  }
}

function classifyTransportProbeError(error: unknown): NonNullable<TransportSecurityObservation["httpProbe"]["errorCategory"]> {
  const message = errorMessageFromUnknown(error).toLowerCase();
  if (/cert|ssl|tls|authority|common name|date invalid|err_cert/.test(message)) {
    return "tls_or_certificate_failure";
  }
  if (/name_not_resolved|dns|enotfound|nxdomain/.test(message)) {
    return "dns_failure";
  }
  if (/timed? out|timeout/.test(message)) {
    return "timeout";
  }
  if (/connection|conn(?:ection)?_refused|econnrefused|reset|closed/.test(message)) {
    return "connection_failure";
  }
  if (/http|status/.test(message)) {
    return "http_error";
  }
  return "unknown";
}

function boundedProbeError(error: unknown) {
  return errorMessageFromUnknown(error).replace(/\s+/g, " ").slice(0, 240);
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function normalizeUrlSafely(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function pathFromUrl(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

export function querySignalsFromUrl(url: string): {
  queryParamNames: string[];
  identifierParamNames: string[];
  advertisingClickIdParamNames: string[];
  tagContainerParamNames: string[];
} {
  const identifierLike = new Set([
    "cid",
    "client_id",
    "clientid",
    "email",
    "em",
    "external_id",
    "fbp",
    "fbc",
    "id",
    "uid",
    "user",
    "user_id",
    "userid",
    "visitor",
    "visitor_id",
  ]);
  const clickIds = new Set([
    "dclid",
    "fbclid",
    "gclid",
    "gbraid",
    "li_fat_id",
    "msclkid",
    "ttclid",
    "twclid",
    "wbraid",
  ]);

  try {
    const parsed = new URL(url);
    const queryParamNames = unique([...parsed.searchParams.keys()]);
    const normalizedNames = queryParamNames.map((name) => name.toLowerCase());
    const isTagContainerParam = (name: string): boolean => {
      const values = parsed.searchParams.getAll(name);
      return values.some((value) =>
        /^(?:GTM|G|UA|AW|DC)-[A-Z0-9_.-]+$/i.test(value),
      );
    };
    return {
      queryParamNames,
      identifierParamNames: queryParamNames.filter((name, index) =>
        !isTagContainerParam(name) &&
        (identifierLike.has(normalizedNames[index] ?? "") ||
          /(?:^|_)(?:email|user|uid|visitor|client)(?:_|$)/i.test(name)),
      ),
      advertisingClickIdParamNames: queryParamNames.filter((name, index) =>
        clickIds.has(normalizedNames[index] ?? ""),
      ),
      tagContainerParamNames: queryParamNames.filter(isTagContainerParam),
    };
  } catch {
    return {
      queryParamNames: [],
      identifierParamNames: [],
      advertisingClickIdParamNames: [],
      tagContainerParamNames: [],
    };
  }
}

function safeRequestHeaders(headers: Record<string, string>): NonNullable<NetworkEvent["requestHeaders"]> {
  const cookieNames = parseCookieNames(headers.cookie);
  return {
    userAgent: headers["user-agent"],
    referer: headers.referer,
    origin: headers.origin,
    secFetchSite: headers["sec-fetch-site"],
    secFetchMode: headers["sec-fetch-mode"],
    secFetchDest: headers["sec-fetch-dest"],
    secGpc: headers["sec-gpc"],
    dnt: headers.dnt,
    cookieHeaderPresent: cookieNames.length > 0,
    cookieNames,
    authorizationHeaderPresent: Boolean(headers.authorization),
  };
}

export function safeResponseHeaders(headers: Record<string, string>): NonNullable<NetworkResponseEvent["responseHeaders"]> {
  return {
    contentType: headers["content-type"],
    cacheControl: headers["cache-control"],
    expires: headers.expires,
    etagPresent: Boolean(headers.etag),
    location: headers.location,
    accessControlAllowOrigin: headers["access-control-allow-origin"],
    accessControlAllowCredentials: headers["access-control-allow-credentials"],
    accessControlExposeHeaders: headers["access-control-expose-headers"],
  };
}

export function pickHeaders(headers: Record<string, string>, names: string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = headers[name];
    if (value) {
      picked[name] = value;
    }
  }
  return picked;
}

export function responseTiming(response: Response): NetworkResponseEvent["timing"] {
  const maybeTimed = response as unknown as {
    timing?: () => NetworkResponseEvent["timing"];
  };
  return maybeTimed.timing?.();
}

export function normalizeResponseSizes(
  sizes: NetworkResponseEvent["sizes"],
): NetworkResponseEvent["sizes"] {
  if (!sizes) {
    return undefined;
  }
  return {
    requestBodySize: nonNegativeOrUndefined(sizes.requestBodySize),
    requestHeadersSize: nonNegativeOrUndefined(sizes.requestHeadersSize),
    responseBodySize: nonNegativeOrUndefined(sizes.responseBodySize),
    responseHeadersSize: nonNegativeOrUndefined(sizes.responseHeadersSize),
  };
}

function nonNegativeOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 ? value : undefined;
}

function parseCookieNames(cookieHeader: string | undefined): string[] {
  if (!cookieHeader) {
    return [];
  }
  return unique(
    cookieHeader
      .split(";")
      .map((part) => part.split("=")[0]?.trim())
      .filter((name): name is string => Boolean(name)),
  );
}

export function parseSetCookieMetadata(
  setCookieHeader: string,
  fallbackHostname: string | undefined,
  firstPartyHostname: string | undefined,
): SetCookieMetadata | undefined {
  const parts = setCookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  const firstPair = parts[0];
  const name = firstPair?.split("=")[0]?.trim();
  if (!name) {
    return undefined;
  }

  const attributes = new Map<string, string | true>();
  for (const part of parts.slice(1)) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey?.trim().toLowerCase();
    if (!key) {
      continue;
    }
    attributes.set(key, rest.length > 0 ? rest.join("=").trim() : true);
  }

  const domain = stringAttribute(attributes.get("domain"))?.replace(/^\./, "") ?? fallbackHostname;
  const cookieParty = classifyCookieParty(domain, firstPartyHostname);
  const firstParty = cookieParty === "first_party";
  const thirdParty = cookieParty === "third_party";

  return {
    name,
    domain,
    path: stringAttribute(attributes.get("path")),
    expires: stringAttribute(attributes.get("expires")),
    maxAge: stringAttribute(attributes.get("max-age")),
    sameSite: stringAttribute(attributes.get("samesite")),
    secure: attributes.has("secure"),
    httpOnly: attributes.has("httponly"),
    firstParty,
    thirdParty,
  };
}

export function redactSetCookieHeader(setCookieHeader: string): string {
  const metadata = parseSetCookieMetadata(setCookieHeader, undefined, undefined);
  if (!metadata) {
    return "[redacted_set_cookie]";
  }
  const attributes = [
    metadata.domain ? `Domain=${metadata.domain}` : undefined,
    metadata.path ? `Path=${metadata.path}` : undefined,
    metadata.expires ? "Expires=[redacted]" : undefined,
    metadata.maxAge ? `Max-Age=${metadata.maxAge}` : undefined,
    metadata.sameSite ? `SameSite=${metadata.sameSite}` : undefined,
    metadata.secure ? "Secure" : undefined,
    metadata.httpOnly ? "HttpOnly" : undefined,
  ].filter((value): value is string => Boolean(value));
  return `${metadata.name}=[redacted]${attributes.length > 0 ? `; ${attributes.join("; ")}` : ""}`;
}

function stringAttribute(value: string | true | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function classifyKnownCookiePurpose(name: string): CookieEvent["cookiePurpose"] {
  if (/^(OptanonConsent|OptanonAlertBoxClosed|CookieConsent|didomi_token|euconsent-v2)$/i.test(name)) {
    return "consent_management";
  }
  if (/^(_abck|bm_sz|ak_bmsc|akaas_|akamai_|__cf_bm)/i.test(name)) {
    return "security";
  }
  if (/^_ga(?:_.+)?$|^_gid$|^_gat/i.test(name)) {
    return "analytics";
  }
  return "unknown";
}

function payloadSignalsFromRequest(request: Request): NetworkEvent["requestPayloadSignals"] {
  const postData = request.postData();
  if (!postData) {
    return {
      bodyPresent: false,
      bodyFieldNames: [],
    };
  }

  return {
    bodyPresent: true,
    bodySizeBytes: Buffer.byteLength(postData),
    bodyFieldNames: bodyFieldNames(postData),
  };
}

function bodyFieldNames(body: string): string[] {
  if (body.length > 20_000) {
    return [];
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed);
    }
  } catch {
    // Try form-encoded below.
  }
  try {
    return unique([...new URLSearchParams(body).keys()]);
  } catch {
    return [];
  }
}

function isCollectionEndpoint(
  url: string,
  resourceType: string | undefined,
): { observed: boolean; category?: string } {
  const hostname = getHostname(url) ?? "";
  const path = pathFromUrl(url) ?? "";
  if (/^(?:www\.)?google\.com$/i.test(hostname)) {
    if (/^\/ccm\/collect\b/i.test(path)) {
      return { observed: true, category: "google_consent_or_tag_support" };
    }
    if (/^\/(?:pagead|ads|aclk|gmp\/conversion)\b/i.test(path) || /\/conversion\b/i.test(path)) {
      return { observed: true, category: "advertising_collection" };
    }
    if (/^\/recaptcha\//i.test(path)) {
      return { observed: false, category: "google_recaptcha_or_security" };
    }
  }
  const endpointPatterns: Array<[RegExp, string]> = [
    [/google-analytics\.com$/i, "analytics_collection"],
    [/doubleclick\.net$/i, "advertising_collection"],
    [/facebook\.com$/i, "advertising_collection"],
    [/clarity\.ms$/i, "session_replay_collection"],
    [/hotjar\.(?:com|io)$/i, "session_replay_collection"],
    [/fullstory\.com$/i, "session_replay_collection"],
    [/analytics\.tiktok\.com$/i, "advertising_collection"],
    [/px\.ads\.linkedin\.com$/i, "advertising_collection"],
    [/p\.tvpixel\.com$/i, "runtime_collection"],
    [/\.omtrdc\.net$/i, "analytics_collection"],
    [/\.2o7\.net$/i, "analytics_collection"],
    [/\.demdex\.net$/i, "analytics_collection"],
    [/\.amazon-adsystem\.com$/i, "advertising_collection"],
    [/\.adsrvr\.org$/i, "advertising_collection"],
    [/\.criteo\.(?:com|net)$/i, "advertising_collection"],
    [/\.rlcdn\.com$/i, "advertising_collection"],
    [/\.crwdcntrl\.net$/i, "advertising_collection"],
    [/\.pubmatic\.com$/i, "advertising_collection"],
    [/\.rubiconproject\.com$/i, "advertising_collection"],
    [/\.openx\.net$/i, "advertising_collection"],
    [/\.casalemedia\.com$/i, "advertising_collection"],
    [/\.quantserve\.com$/i, "advertising_collection"],
    [/\.amplitude\.com$/i, "analytics_collection"],
    [/\.mixpanel\.com$/i, "analytics_collection"],
    [/\.posthog\.com$/i, "analytics_collection"],
    [/\.px-cloud\.net$/i, "security_or_performance_support"],
    [/\.go-mpulse\.net$/i, "security_or_performance_support"],
    [/\.nr-data\.net$/i, "security_or_performance_support"],
    [/\.newrelic\.com$/i, "security_or_performance_support"],
    [/\.forter\.com$/i, "security_or_performance_support"],
    [/^(?:prod\d+-)?live-chat\.sprinklr\.com$/i, "customer_support"],
    [/\.tapad\.com$/i, "advertising_collection"],
    [/\.singular\.net$/i, "advertising_collection"],
    [/^pixel-config\.reddit\.com$/i, "advertising_collection"],
  ];
  const pathPatterns: Array<[RegExp, string]> = [
    [/\/(?:g\/)?collect\b/i, "analytics_collection"],
    [/\/j\/collect\b/i, "analytics_collection"],
    [/\/tr\b/i, "advertising_collection"],
    [/\/events?\b/i, "advertising_collection"],
    [/\/pagead\//i, "advertising_collection"],
    [/\/activityi\b/i, "advertising_collection"],
    [/\/rec\//i, "session_replay_collection"],
  ];
  for (const [pattern, category] of [...endpointPatterns, ...pathPatterns]) {
    const target = endpointPatterns.some(([item]) => item === pattern) ? hostname : path;
    if (pattern.test(target)) {
      return { observed: true, category };
    }
  }
  if (resourceType && ["xhr", "fetch", "beacon"].includes(resourceType) && /collect|event|pixel/i.test(url)) {
    return { observed: true, category: "runtime_collection" };
  }
  return { observed: false };
}

function classifyEndpointAttribution(input: {
  url: string;
  hostname: string | undefined;
  registrableDomain: string | undefined;
  firstPartyDomain: string | undefined;
  resourceType: string | undefined;
  collectionEndpoint: { observed: boolean; category?: string };
}): {
  status: NonNullable<NetworkEvent["attributionStatus"]>;
  reason: string;
  basis: string[];
  subtype?: NetworkEvent["endpointSubtype"];
} {
  const hostname = input.hostname ?? "";
  const path = pathFromUrl(input.url) ?? "";
  const queryParamNames = querySignalsFromUrl(input.url).queryParamNames;
  const basis = [
    hostname ? `hostname:${hostname}` : undefined,
    path ? `path:${path}` : undefined,
    input.resourceType ? `resource_type:${input.resourceType}` : undefined,
    input.collectionEndpoint.category ? `endpoint_category:${input.collectionEndpoint.category}` : undefined,
    ...queryParamNames.map((name) => `query_param:${name}`),
  ].filter((value): value is string => Boolean(value));

  const googleSubtype = classifyGoogleEndpointSubtype({
    hostname,
    path,
    queryParamNames,
    resourceType: input.resourceType,
    collectionEndpoint: input.collectionEndpoint,
  });
  if (googleSubtype) {
    if (googleSubtype === "google_ads_or_measurement" || googleSubtype === "google_analytics_collection") {
      return {
        status: "resolved",
        reason: `resolved_to_${googleSubtype}`,
        basis: [...basis, `google_endpoint_subtype:${googleSubtype}`],
        subtype: googleSubtype,
      };
    }
    if (googleSubtype === "google_owned_unresolved_meaningful") {
      return {
        status: "unresolved_meaningful",
        reason: "google_owned_collection_like_endpoint_without_product_attribution",
        basis: [...basis, `google_endpoint_subtype:${googleSubtype}`],
        subtype: googleSubtype,
      };
    }
    return {
      status: "site_owned_infrastructure",
      reason: googleSubtype,
      basis: [...basis, `google_endpoint_subtype:${googleSubtype}`],
      subtype: googleSubtype,
    };
  }

  if (/\.clarity\.ms$/i.test(hostname) && /^\/(?:collect|tag)\b/i.test(path)) {
    return {
      status: "resolved",
      reason: "resolved_to_microsoft_clarity_collection_endpoint",
      basis: [...basis, "known_vendor_endpoint:microsoft_clarity"],
      subtype: undefined,
    };
  }

  if (/\.demdex\.net$/i.test(hostname) && /^\/(?:id(?:\/rd)?|event|ibs:|demconf\.jpg)\b/i.test(path)) {
    return {
      status: "resolved",
      reason: "resolved_to_adobe_audience_manager_endpoint",
      basis: [...basis, "known_vendor_endpoint:adobe_demdex_audience_manager"],
      subtype: undefined,
    };
  }

  const knownEndpoint = classifyKnownNonGoogleEndpoint(hostname);
  if (knownEndpoint) {
    return {
      status: "resolved",
      reason: knownEndpoint.reason,
      basis: [...basis, knownEndpoint.basis],
      subtype: undefined,
    };
  }

  if (/\.doubleclick\.net$/i.test(hostname) && input.collectionEndpoint.observed) {
    return {
      status: "resolved",
      reason: "resolved_to_google_ads_doubleclick_endpoint",
      basis: [...basis, "known_vendor_endpoint:doubleclick"],
      subtype: "google_ads_or_measurement",
    };
  }

  if (
    hostname === "video-ads-module.ad-tech.nbcuni.com" ||
    (hostname.endsWith(".ad-tech.nbcuni.com") && /video/i.test(hostname))
  ) {
    return {
      status: "site_owned_infrastructure",
      reason: "nbcuniversal_video_ad_infrastructure_without_third_party_vendor_attribution",
      basis: [...basis, "site_owned_affiliate:nbcuniversal"],
    };
  }

  if (
    input.registrableDomain !== undefined &&
    input.firstPartyDomain !== undefined &&
    input.registrableDomain === input.firstPartyDomain
  ) {
    return {
      status: input.collectionEndpoint.observed ? "site_owned_infrastructure" : "ignored_noise",
      reason: input.collectionEndpoint.observed
        ? "first_party_collection_like_endpoint"
        : "first_party_request_without_collection_or_vendor_signal",
      basis,
      subtype: input.collectionEndpoint.observed ? undefined : undefined,
    };
  }

  if (input.collectionEndpoint.observed) {
    return {
      status: "unresolved_meaningful",
      reason: "collection_like_endpoint_without_confident_vendor_mapping",
      basis,
      subtype: undefined,
    };
  }

  return {
    status: "ignored_noise",
    reason: "request_without_collection_or_vendor_signal",
    basis,
    subtype: undefined,
  };
}

function classifyKnownNonGoogleEndpoint(hostname: string): { reason: string; basis: string } | undefined {
  const mappings: Array<[RegExp, string, string]> = [
    [/^ct\.pinterest\.com$/i, "resolved_to_pinterest_tag_endpoint", "known_vendor_endpoint:pinterest_tag"],
    [/^analytics\.tiktok\.com$/i, "resolved_to_tiktok_pixel_endpoint", "known_vendor_endpoint:tiktok_pixel"],
    [/\.amazon-adsystem\.com$/i, "resolved_to_amazon_ads_endpoint", "known_vendor_endpoint:amazon_ads"],
    [/^ara\.paa-reporting-advertising\.amazon$/i, "resolved_to_amazon_ads_reporting_endpoint", "known_vendor_endpoint:amazon_ads_reporting"],
    [/^prod\.tahoe-analytics\.publishers\.advertising\.a2z\.com$/i, "resolved_to_amazon_ads_reporting_endpoint", "known_vendor_endpoint:amazon_ads_reporting"],
    [/\.doubleverify\.com$/i, "resolved_to_doubleverify_endpoint", "known_vendor_endpoint:doubleverify"],
    [/\.adsrvr\.org$/i, "resolved_to_trade_desk_endpoint", "known_vendor_endpoint:the_trade_desk"],
    [/\.criteo\.(?:com|net)$/i, "resolved_to_criteo_endpoint", "known_vendor_endpoint:criteo"],
    [/\.crwdcntrl\.net$/i, "resolved_to_lotame_endpoint", "known_vendor_endpoint:lotame"],
    [/\.rlcdn\.com$/i, "resolved_to_liveramp_endpoint", "known_vendor_endpoint:liveramp"],
    [/\.openx\.net$/i, "resolved_to_openx_endpoint", "known_vendor_endpoint:openx"],
    [/\.rubiconproject\.com$/i, "resolved_to_magnite_rubicon_endpoint", "known_vendor_endpoint:magnite_rubicon"],
    [/\.casalemedia\.com$/i, "resolved_to_index_exchange_endpoint", "known_vendor_endpoint:index_exchange"],
    [/\.pubmatic\.com$/i, "resolved_to_pubmatic_endpoint", "known_vendor_endpoint:pubmatic"],
    [/\.taboola\.com$/i, "resolved_to_taboola_endpoint", "known_vendor_endpoint:taboola"],
    [/\.quantserve\.com$/i, "resolved_to_quantcast_endpoint", "known_vendor_endpoint:quantcast"],
    [/\.adsafeprotected\.com$/i, "resolved_to_integral_ad_science_endpoint", "known_vendor_endpoint:integral_ad_science"],
    [/^px\.ads\.linkedin\.com$/i, "resolved_to_linkedin_insight_endpoint", "known_vendor_endpoint:linkedin_insight"],
    [/^ep\d+\.adtrafficquality\.google$/i, "resolved_to_google_ad_traffic_quality_endpoint", "known_vendor_endpoint:google_ad_traffic_quality"],
    [/\.attentivemobile\.com$/i, "resolved_to_attentive_event_endpoint", "known_vendor_endpoint:attentive"],
    [/\.agkn\.com$/i, "resolved_to_neustar_agkn_endpoint", "known_vendor_endpoint:neustar_agkn"],
    [/\.revjet\.com$/i, "resolved_to_revjet_endpoint", "known_vendor_endpoint:revjet"],
    [/^(?:pixel\.byspotify\.com|pixels\.spotify\.com)$/i, "resolved_to_spotify_pixel_endpoint", "known_vendor_endpoint:spotify_pixel"],
    [/\.digital-cloud\.medallia\.com$/i, "resolved_to_medallia_digital_endpoint", "known_vendor_endpoint:medallia_digital"],
    [/\.brightline\.tv$/i, "resolved_to_brightline_video_ad_endpoint", "known_vendor_endpoint:brightline_video_ad_measurement"],
    [/\.fullstory\.com$/i, "resolved_to_fullstory_endpoint", "known_vendor_endpoint:fullstory"],
    [/^pixel-config\.reddit\.com$/i, "resolved_to_reddit_pixel_endpoint", "known_vendor_endpoint:reddit_pixel"],
    [/\.tapad\.com$/i, "resolved_to_tapad_endpoint", "known_vendor_endpoint:tapad"],
    [/\.singular\.net$/i, "resolved_to_singular_attribution_endpoint", "known_vendor_endpoint:singular_attribution"],
    [/\.px-cloud\.net$/i, "resolved_to_human_perimeterx_security_endpoint", "known_vendor_endpoint:human_perimeterx_security"],
    [/\.go-mpulse\.net$/i, "resolved_to_akamai_mpulse_endpoint", "known_vendor_endpoint:akamai_mpulse"],
    [/\.nr-data\.net$/i, "resolved_to_new_relic_monitoring_endpoint", "known_vendor_endpoint:new_relic"],
    [/\.newrelic\.com$/i, "resolved_to_new_relic_monitoring_endpoint", "known_vendor_endpoint:new_relic"],
    [/\.forter\.com$/i, "resolved_to_forter_security_endpoint", "known_vendor_endpoint:forter_security"],
    [/^(?:prod\d+-)?live-chat\.sprinklr\.com$/i, "resolved_to_sprinklr_live_chat_endpoint", "known_vendor_endpoint:sprinklr_live_chat"],
  ];
  const match = mappings.find(([pattern]) => pattern.test(hostname));
  return match ? { reason: match[1], basis: match[2] } : undefined;
}

function classifyGoogleEndpointSubtype(input: {
  hostname: string;
  path: string;
  queryParamNames: string[];
  resourceType: string | undefined;
  collectionEndpoint: { observed: boolean; category?: string };
}): NetworkEvent["endpointSubtype"] | undefined {
  const hostname = input.hostname.toLowerCase();
  const path = input.path.toLowerCase();
  const params = new Set(input.queryParamNames.map((name) => name.toLowerCase()));
  if (/google-analytics\.com$/i.test(hostname) && /^\/(?:g\/collect|collect|j\/collect)\b/i.test(path)) {
    return "google_analytics_collection";
  }
  if (
    (/doubleclick\.net$/i.test(hostname) || /googleadservices\.com$/i.test(hostname) || hostname === "pagead2.googlesyndication.com") &&
    (/\/(?:pagead|gampad|activityi)\b/i.test(path) || /\/conversion\b/i.test(path) || /^\/pcs\/activeview\b/i.test(path))
  ) {
    return "google_ads_or_measurement";
  }
  if (isGoogleStaticAssetHost(hostname, path, input.resourceType)) {
    return "google_owned_infrastructure";
  }
  const isGoogleHost =
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    hostname === "gstatic.com" ||
    hostname.endsWith(".gstatic.com");
  if (!isGoogleHost) {
    return undefined;
  }
  if (path.startsWith("/recaptcha/")) {
    return "google_recaptcha_or_security";
  }
  if (path.startsWith("/ccm/collect") || params.has("gcd") || params.has("gtm") || params.has("tag_exp")) {
    return "google_consent_or_tag_support";
  }
  if (
    path.startsWith("/pagead/") ||
    path.startsWith("/ads/") ||
    path.startsWith("/gmp/conversion") ||
    path.startsWith("/aclk") ||
    path.includes("/conversion")
  ) {
    return "google_ads_or_measurement";
  }
  if (input.collectionEndpoint.observed) {
    return "google_owned_unresolved_meaningful";
  }
  return "google_owned_infrastructure";
}

function isGoogleStaticAssetHost(
  hostname: string,
  path: string,
  resourceType: string | undefined,
) {
  if (hostname !== "gstatic.com" && !hostname.endsWith(".gstatic.com")) {
    return false;
  }
  if (/^\/recaptcha\//i.test(path)) {
    return false;
  }
  if (resourceType && ["document", "xhr", "fetch", "beacon", "websocket", "eventsource"].includes(resourceType)) {
    return /\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|webp|woff2?|ttf|otf)(?:$|[?#])/i.test(path);
  }
  return true;
}

function redirectChainIds(
  request: Request,
  requestIds: WeakMap<Request, string>,
): string[] {
  const ids: string[] = [];
  let current = request.redirectedFrom();
  while (current) {
    const id = requestIds.get(current);
    if (id) {
      ids.unshift(id);
    }
    current = current.redirectedFrom();
  }
  return ids;
}

function stableFrameId(frameUrl: string | undefined): string | undefined {
  if (!frameUrl || frameUrl === "about:blank") {
    return undefined;
  }
  let hash = 0;
  for (const char of frameUrl) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `frame_${hash.toString(16)}`;
}

function shouldCapturePreConsentScreenshot(input: {
  cmpRuntimeObservations: CmpRuntimeObservation[];
  consentObservation: ConsentUiObservation;
  screenshotMode: "always" | "selective" | "never";
}) {
  if (input.screenshotMode === "never") {
    return false;
  }
  if (input.screenshotMode === "always") {
    return true;
  }
  return input.consentObservation.likelyPresent || input.cmpRuntimeObservations.length > 0;
}

type SupplementalFullPageScreenshotResult = {
  errorMessage?: string;
  screenshot?: ScreenshotArtifact;
  visualCapture?: VisualCaptureSummary;
};

async function captureSupplementalFullPagePreConsentScreenshot(
  page: Page,
  input: PreConsentRuntimeScannerInput,
  options: { timeoutMs: number },
): Promise<SupplementalFullPageScreenshotResult | null> {
  const screenshotPath = input.artifactWriter.artifactPath("screenshot-pre-consent-full-page.jpg");
  try {
    await page.screenshot({
      fullPage: true,
      path: screenshotPath,
      quality: 70,
      type: "jpeg",
      timeout: options.timeoutMs,
    });
    const screenshot: ScreenshotArtifact = {
      artifactId: "screenshot_pre_consent_full_page",
      capturedAtMs: elapsed(input.scanStartedAtMs),
      captureMethod: "primary_full_page",
      path: screenshotPath,
      url: page.url(),
      pagePhase: "dom_content_loaded",
      consentStateAtTime: "pre_consent",
    };
    return {
      screenshot,
      visualCapture: visualCaptureFromScreenshotSummary(
        {
          status: "available",
          captureMethod: "primary_full_page",
          artifactRefs: [],
          notes: ["Full-page pre-consent screenshot retained by bounded same-page supplemental capture."],
        },
        screenshotPath,
        screenshot.artifactId,
      ),
    };
  } catch (error) {
    const message = errorMessageFromUnknown(error);
    if (/timeout/i.test(message)) {
      return null;
    }
    return {
      errorMessage: `Supplemental full-page screenshot failed: ${message}`,
    };
  }
}

function mergeVisualCaptureWithFullPageArtifact(
  existing: VisualCaptureSummary,
  fullPage: VisualCaptureSummary | undefined,
): VisualCaptureSummary {
  if (!fullPage) {
    return existing;
  }
  return {
    ...fullPage,
    artifactRefs: uniqueEvidenceRefs([
      ...fullPage.artifactRefs,
      ...existing.artifactRefs,
    ]),
    notes: unique([
      ...fullPage.notes,
      ...existing.notes,
      "Viewport pre-consent screenshot retained as fallback before the bounded full-page attempt.",
    ]),
  };
}

async function capturePreConsentScreenshot(
  page: Page,
  screenshotPath: string,
  options: {
    captureMode: "full_page_first" | "viewport_first";
    screenshotErrors: string[];
    timeoutMs: number;
  },
  captureMethods: {
    fullPage: NonNullable<VisualCaptureSummary["captureMethod"]>;
    placeholder: NonNullable<VisualCaptureSummary["captureMethod"]>;
    viewportFallback: NonNullable<VisualCaptureSummary["captureMethod"]>;
    viewportPrimary: NonNullable<VisualCaptureSummary["captureMethod"]>;
  } = {
    fullPage: "primary_full_page",
    placeholder: "primary_placeholder",
    viewportFallback: "primary_viewport_fallback",
    viewportPrimary: "primary_viewport_fallback",
  },
): Promise<VisualCaptureSummary> {
  const viewportTimeoutMs = Math.max(1_500, Math.min(options.timeoutMs, 4_000));
  if (options.captureMode === "viewport_first") {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false, timeout: viewportTimeoutMs });
      return {
        status: "available",
        captureMethod: captureMethods.viewportPrimary,
        artifactRefs: [],
        notes: ["Viewport pre-consent screenshot retained for fast planned-DAG evidence capture."],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      options.screenshotErrors.push(`Viewport screenshot failed: ${errorMessage}`);
    }
  }
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: options.timeoutMs });
    return {
      status: "available",
      captureMethod: captureMethods.fullPage,
      artifactRefs: [],
      notes: ["Full-page pre-consent screenshot retained."],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    options.screenshotErrors.push(`Full-page screenshot failed: ${errorMessage}`);
  }
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: viewportTimeoutMs });
    options.screenshotErrors.push("Viewport screenshot fallback used after full-page screenshot failure.");
    return {
      status: "available",
      captureMethod: captureMethods.viewportFallback,
      artifactRefs: [],
      notes: ["Viewport pre-consent screenshot retained after full-page screenshot failure."],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    options.screenshotErrors.push(`Viewport screenshot fallback failed: ${errorMessage}`);
  }
  await writeFile(screenshotPath, ONE_PIXEL_TRANSPARENT_PNG);
  options.screenshotErrors.push("1x1 screenshot placeholder used after screenshot capture failures.");
  return {
    status: "placeholder",
    failureReason: "placeholder_used",
    captureMethod: captureMethods.placeholder,
    artifactRefs: [],
    notes: ["A 1x1 screenshot placeholder was retained after full-page and viewport screenshot capture failed."],
  };
}

function visualCaptureFromScreenshotSummary(
  summary: VisualCaptureSummary,
  screenshotPath: string,
  artifactId = "screenshot_pre_consent",
): VisualCaptureSummary {
  return {
    status: summary.status,
    failureReason: summary.failureReason,
    captureMethod: summary.captureMethod,
    artifactRefs: [{
      artifactId,
      artifactType: "screenshot",
      path: screenshotPath,
      label: "Pre-consent screenshot",
      sensitivity: "safe",
      redactionStatus: "not_needed",
      relatedEventIds: [],
    }],
    notes: summary.notes,
  };
}

function preferredPreConsentScreenshotRef(screenshots: ScreenshotArtifact[]): string | undefined {
  return (
    screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent_geometry_proof")?.path ??
    screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent_full_page")?.path ??
    screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent")?.path ??
    screenshots[0]?.path
  );
}

function hasConfirmedFirstLayerGeometryControls(geometry: ConsentControlGeometryArtifact): boolean {
  return confirmedFirstLayerGeometryControlCount(geometry) > 0;
}

function confirmedFirstLayerGeometryControlCount(geometry: ConsentControlGeometryArtifact): number {
  return geometry.candidates.filter((candidate) =>
    isAroGeometryAction(candidate.actionType) &&
    candidate.layer === "first_layer" &&
    candidate.decisionStatus === "confirmed_visible"
  ).length;
}

function hasBelowFoldFirstLayerGeometryControls(geometry: ConsentControlGeometryArtifact): boolean {
  return geometry.candidates.some((candidate) =>
    isAroGeometryAction(candidate.actionType) &&
    candidate.layer === "first_layer" &&
    candidate.decisionStatus === "dom_present_not_visible" &&
    candidate.reasons.includes("outside_viewport") &&
    candidate.boundingBox.width > 0 &&
    candidate.boundingBox.height > 0 &&
    candidate.boundingBox.top >= geometry.viewport.height &&
    candidate.boundingBox.top <= geometry.viewport.height + 2_400
  );
}

type AroGeometryAction = Extract<
  ConsentControlGeometryArtifact["candidates"][number]["actionType"],
  "accept_all" | "reject_all" | "manage_preferences"
>;

const GEOMETRY_CONSENT_OBSERVATION_CONTEXT_PATTERN =
  /cookie|cookies|consent|privacy|preference|preferences|settings|choices|tracking|advertising|marketing|optanon|onetrust|cmp|trustarc|didomi|usercentrics|cookiebot|consentmanager|datenschutz|einwilligung|zustimmung|préférences|confidentialité|consentement|privacidad|preferencias|configuración|opciones|preferenze|impostazioni|pubblicitarie/i;

function isAroGeometryAction(
  actionType: ConsentControlGeometryArtifact["candidates"][number]["actionType"],
): actionType is AroGeometryAction {
  return actionType === "accept_all" ||
    actionType === "reject_all" ||
    actionType === "manage_preferences";
}

export function consentUiObservationFromConfirmedGeometryControls(input: {
  artifactPath?: string;
  geometry: ConsentControlGeometryArtifact;
  scanStartedAtMs: number;
  text?: string;
}): ConsentUiObservation | null {
  const text = [
    input.text,
    ...input.geometry.containers.map((container) => container.textExcerpt),
  ].filter(Boolean).join(" ").slice(0, 12_000);
  if (
    input.geometry.cmp.detected !== true &&
    !GEOMETRY_CONSENT_OBSERVATION_CONTEXT_PATTERN.test(text)
  ) {
    return null;
  }

  const controls = input.geometry.candidates
    .flatMap((candidate): ConsentUiObservation["controls"] => {
      const actionType = candidate.actionType;
      if (
        !isAroGeometryAction(actionType) ||
        candidate.layer !== "first_layer" ||
        candidate.decisionStatus !== "confirmed_visible" ||
        isCompositeConfirmedGeometryControl(candidate, input.geometry.candidates)
      ) {
        return [];
      }
      return [{
        actionType,
        classifierReasonCodes: candidate.classifierReasonCodes,
        label: candidate.label.slice(0, 120),
        matchStrength: candidate.matchStrength as ConsentUiObservation["controls"][number]["matchStrength"],
        matchedLocale: candidate.matchedLocale as ConsentUiObservation["controls"][number]["matchedLocale"],
        matchedTerm: candidate.matchedTerm,
        role: candidate.role,
        selectorHint: candidate.selectorHint,
        tagName: candidate.tagName.slice(0, 32),
        visible: true,
      }];
    })
    .filter((control) => control.label.length > 0);

  if (controls.length === 0) {
    return null;
  }

  const observation = buildConsentUiObservationFromEvidence({
    controls,
    fallbackBasis: ["geometry:confirmed_first_layer_controls"],
    scanStartedAtMs: input.scanStartedAtMs,
    text: [
      text,
      ...controls.map((control) => control.label),
    ].filter(Boolean).join(" ").slice(0, 12_000),
  });
  observation.evidenceRefs = [{
    artifactId: "consent_control_geometry",
    eventType: "consent_control_geometry",
    label: "Confirmed visible first-layer consent controls from bounded geometry evidence",
    path: input.artifactPath,
    refId: "consent_control_geometry_evidence",
  }];
  return observation;
}

function isCompositeConfirmedGeometryControl(
  candidate: ConsentControlGeometryArtifact["candidates"][number],
  candidates: ConsentControlGeometryArtifact["candidates"],
): boolean {
  if (["button", "a", "input", "select", "textarea"].includes(candidate.tagName.toLowerCase())) {
    return false;
  }

  return candidates.some((other) =>
    other.candidateId !== candidate.candidateId &&
    isAroGeometryAction(other.actionType) &&
    other.layer === "first_layer" &&
    other.decisionStatus === "confirmed_visible" &&
    geometryBoxContains(candidate.boundingBox, other.boundingBox)
  );
}

function geometryBoxContains(
  parent: ConsentControlGeometryArtifact["candidates"][number]["boundingBox"],
  child: ConsentControlGeometryArtifact["candidates"][number]["boundingBox"],
): boolean {
  if (parent.width <= 0 || parent.height <= 0 || child.width <= 0 || child.height <= 0) {
    return false;
  }
  const tolerancePx = 1;
  const parentArea = parent.width * parent.height;
  const childArea = child.width * child.height;
  return childArea < parentArea * 0.98 &&
    child.left >= parent.left - tolerancePx &&
    child.right <= parent.right + tolerancePx &&
    child.top >= parent.top - tolerancePx &&
    child.bottom <= parent.bottom + tolerancePx;
}

async function recaptureConsentGeometryAfterBoundedScroll(
  page: Page,
  geometry: ConsentControlGeometryArtifact,
  options: {
    screenshotArtifactRef?: string;
  },
): Promise<ConsentControlGeometryArtifact | null> {
  const target = geometry.candidates
    .filter((candidate) =>
      isAroGeometryAction(candidate.actionType) &&
      candidate.layer === "first_layer" &&
      candidate.decisionStatus === "dom_present_not_visible" &&
      candidate.reasons.includes("outside_viewport") &&
      candidate.boundingBox.width > 0 &&
      candidate.boundingBox.height > 0
    )
    .sort((left, right) => left.boundingBox.top - right.boundingBox.top)[0];
  if (!target) {
    return null;
  }

  const didScroll = await page.evaluate((top) => {
    const before = window.scrollY;
    const maxTop = Math.max(0, (document.scrollingElement?.scrollHeight ?? document.body.scrollHeight) - window.innerHeight);
    const nextTop = Math.max(0, Math.min(maxTop, top - 96));
    window.scrollTo(0, nextTop);
    return Math.abs(window.scrollY - before) > 4;
  }, target.boundingBox.top).catch(() => false);

  if (!didScroll) {
    return null;
  }

  await page.waitForTimeout(350).catch(() => undefined);
  return captureConsentControlGeometry(page, {
    screenshotArtifactRef: options.screenshotArtifactRef,
    timeoutMs: 2_000,
  });
}

function rewriteConsentGeometryScreenshotRefs(
  geometry: ConsentControlGeometryArtifact,
  screenshotArtifactRef: string,
): void {
  for (const candidate of geometry.candidates) {
    if (candidate.layer === "first_layer" && candidate.decisionStatus === "confirmed_visible") {
      candidate.screenshotArtifactRef = screenshotArtifactRef;
    }
  }
}

async function captureConsentGeometryProofScreenshot(
  page: Page,
  input: PreConsentRuntimeScannerInput,
  options: {
    screenshotErrors: string[];
    timeoutMs: number;
  },
): Promise<ScreenshotArtifact | null> {
  const screenshotPath = input.artifactWriter.artifactPath("screenshot-pre-consent-geometry-proof.png");
  try {
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: screenshotPath,
      timeout: options.timeoutMs,
    });
    return consentGeometryProofScreenshotArtifact(input, page, screenshotPath, "primary_viewport_fallback");
  } catch (error) {
    options.screenshotErrors.push(`Consent geometry proof screenshot failed: ${errorMessageFromUnknown(error)}`);
  }
  try {
    const client = await page.context().newCDPSession(page);
    const screenshot = await client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    return consentGeometryProofScreenshotArtifact(input, page, screenshotPath, "independent_visual_fallback_viewport");
  } catch (error) {
    options.screenshotErrors.push(`Consent geometry proof CDP screenshot failed: ${errorMessageFromUnknown(error)}`);
    return null;
  }
}

function consentGeometryProofScreenshotArtifact(
  input: PreConsentRuntimeScannerInput,
  page: Page,
  screenshotPath: string,
  captureMethod: ScreenshotArtifact["captureMethod"],
): ScreenshotArtifact {
  return {
    artifactId: "screenshot_pre_consent_geometry_proof",
    capturedAtMs: elapsed(input.scanStartedAtMs),
    captureMethod,
    path: screenshotPath,
    url: page.url(),
    pagePhase: "network_idle",
    consentStateAtTime: "pre_consent",
  };
}

async function writeConsentGeometryNoGoArtifact(
  artifactWriter: ArtifactWriter,
  normalizedUrl: string,
  errorMessage: string,
  httpStatus: number | undefined,
): Promise<void> {
  await artifactWriter.writeJsonArtifact("ConsentControlGeometryEvidence.json", {
    artifactVersion: "consent_control_geometry.v1",
    sourceScanner: "consent_control_geometry_diagnostic",
    pageUrl: normalizedUrl,
    capturedAt: new Date().toISOString(),
    viewport: {
      width: 0,
      height: 0,
    },
    cmp: {
      detected: false,
      confidence: 0,
      reasonCodes: [],
      matchedSignals: [],
      detections: [],
    },
    containers: [],
    candidates: [],
    summary: {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: false,
      cmpDetected: false,
      confidence: 0,
      limitations: ["A/R/O not evaluated because page access did not reach a loaded pre-consent state."],
    },
    access: classifyConsentGeometryAccess({
      errorMessage,
      httpStatus,
    }),
    egress: buildConsentGeometryEgressDiagnostic(),
    artifactOnly: true,
    productionFindingIntegration: false,
  });
}

async function retryPreConsentScreenshotInFreshContext(input: {
  browser: Browser;
  input: PreConsentRuntimeScannerInput;
  screenshotErrors: string[];
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
}): Promise<{
  screenshot: ScreenshotArtifact;
  visualCapture: VisualCaptureSummary;
  consentUiObservation?: ConsentUiObservation;
  domSnapshot?: DomSnapshotArtifact;
} | null> {
  const screenshotPath = input.input.artifactWriter.artifactPath("screenshot-pre-consent.png");
  return recordTiming(
    input.timingBreakdown,
    "fresh-context screenshot retry",
    "One bounded screenshot-only retry in a fresh browser context after the primary page/context closed.",
    async () => {
      const retryContext = await input.browser.newContext(chromiumContextOptions());
      try {
        await installConsentInventoryProbe(retryContext);
        for (const fulfiller of input.input.routeFulfillers ?? []) {
          await retryContext.route(fulfiller.urlPattern, async (route: Route) => {
            await route.fulfill({
              status: fulfiller.status ?? 200,
              contentType: fulfiller.contentType ?? "text/plain",
              body: fulfiller.body ?? "",
              headers: fulfiller.headers,
            });
          });
        }
        if (input.input.stubHeavyResources) {
          await retryContext.route("**/*", async (route) => {
            if (await maybeFulfillHeavyResource(route)) {
              return;
            }
            await route.continue();
          });
        }
        const retryPage = await retryContext.newPage();
        await retryPage.goto(input.input.normalizedUrl, {
          waitUntil: "domcontentloaded",
          timeout: Math.min(input.input.internalBudgetMs, input.input.screenshotTimeoutMs ?? 15_000),
        });
        const capture = await capturePreConsentScreenshot(
          retryPage,
          screenshotPath,
          {
            captureMode: input.input.screenshotCaptureMode ?? "full_page_first",
            screenshotErrors: input.screenshotErrors,
            timeoutMs: Math.max(1_000, Math.min(input.input.screenshotTimeoutMs ?? 5_000, 15_000)),
          },
          {
            fullPage: "fresh_context_full_page",
            placeholder: "fresh_context_placeholder",
            viewportFallback: "fresh_context_viewport_fallback",
            viewportPrimary: "fresh_context_viewport_fallback",
          },
        );
        const domText = await retryPage.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
        const domPath = domText
          ? await input.input.artifactWriter.writeTextArtifact(
            "dom-text-pre-consent.txt",
            domText.slice(0, 100_000),
          )
          : undefined;
        const consentUiObservation = await detectConsentUi(
          retryPage,
          input.input.scanStartedAtMs,
          1_500,
        ).catch(() => undefined);
        if (consentUiObservation && domPath) {
          consentUiObservation.evidenceRefs = [
            { refId: "dom_text_pre_consent", artifactId: "dom_text_pre_consent", path: domPath },
          ];
        }
        return {
          screenshot: {
            artifactId: "screenshot_pre_consent",
            capturedAtMs: elapsed(input.input.scanStartedAtMs),
            captureMethod: capture.captureMethod,
            path: screenshotPath,
            url: retryPage.url(),
            pagePhase: "dom_content_loaded",
            consentStateAtTime: "pre_consent",
          },
          visualCapture: {
            ...visualCaptureFromScreenshotSummary(capture, screenshotPath),
            notes: unique([
              ...capture.notes,
              "Screenshot retained by a fresh-context retry after the primary page/context closed.",
            ]),
          },
          consentUiObservation,
          domSnapshot: domPath
            ? {
              artifactId: "dom_text_pre_consent",
              capturedAtMs: elapsed(input.input.scanStartedAtMs),
              path: domPath,
              url: retryPage.url(),
              textExcerpt: domText.slice(0, 2_000),
              pagePhase: "dom_content_loaded",
              consentStateAtTime: "pre_consent",
            }
            : undefined,
        };
      } finally {
        await retryContext.close().catch(() => undefined);
      }
    },
  );
}

function classifyVisualCaptureFailureReason(message: string): VisualCaptureSummary["failureReason"] {
  const normalized = message.toLowerCase();
  if (/target page, context or browser has been closed|page\/context closed/.test(normalized)) {
    return "page_closed";
  }
  if (/timeout|timed out/.test(normalized)) {
    return "screenshot_timeout";
  }
  if (/crash|browser has disconnected|browser closed/.test(normalized)) {
    return "browser_crash";
  }
  return "unknown";
}

function boundedVisualCaptureNote(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 180);
}

function errorMessageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueEvidenceRefs<T extends { refId?: string; artifactId?: string; eventId?: string; path?: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.refId ?? value.artifactId ?? value.eventId ?? value.path;
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function safeEvidenceId(value: string): string {
  const normalized = value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
  return (normalized || "unknown").slice(0, 80);
}

function elapsed(startMs: number): number {
  return Math.max(0, Date.now() - startMs);
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence}`;
}
