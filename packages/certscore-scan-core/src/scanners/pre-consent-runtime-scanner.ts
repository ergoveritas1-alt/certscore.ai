import {
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
  type ConsentUiObservation,
  type VisualCaptureSummary,
} from "@certscore/contracts";
import { resolveEndpointGeography, resolveVendorObservations, type VendorResolverInput } from "@certscore/vendor-resolver";
import { writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response, type Route } from "playwright";
import type { ArtifactWriter } from "../artifact-writer.js";
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
  screenshots: ScreenshotArtifact[];
  visualCapture: VisualCaptureSummary;
  domSnapshots: DomSnapshotArtifact[];
  vendorResolverInputs: VendorResolverInput[];
}

export async function preConsentRuntimeScanner(
  input: PreConsentRuntimeScannerInput,
): Promise<PreConsentRuntimeScannerResult> {
  const moduleStartedAtMs = Date.now();
  const moduleStartedAt = new Date(moduleStartedAtMs).toISOString();
  const timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]> = [];
  const firstPartyHostname = getHostname(input.normalizedUrl) ?? undefined;
  const firstPartyDomain = getRegistrableDomainFromUrl(input.normalizedUrl) ?? undefined;
  const networkEvents: NetworkEvent[] = [];
  const networkResponseEvents: NetworkResponseEvent[] = [];
  const cookieEvents: CookieEvent[] = [];
  const scriptEvents: ScriptEvent[] = [];
  const iframeEvents: IframeEvent[] = [];
  const browserApiAccessEvents: RuntimeEvidenceEvent[] = [];
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

  const screenshots: ScreenshotArtifact[] = [];
  const screenshotErrors: string[] = [];
  let earlyScreenshotCaptured = false;
  const fallbackConsentUiObservations: ConsentUiObservation[] = [];
  const fallbackDomSnapshots: DomSnapshotArtifact[] = [];

  try {
    await recordTiming(timingBreakdown, "page navigation", "Initial navigation until DOMContentLoaded.", () =>
      page.goto(input.normalizedUrl, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(input.internalBudgetMs, 15_000),
      })
    );
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
    const cmpRuntimeObservations = await recordTiming(
      timingBreakdown,
      "CMP runtime probe",
      "Low-latency cookie, storage, and global CMP probe.",
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
    );

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
    }

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
      screenshots,
      visualCapture,
      domSnapshots: [domSnapshot],
      vendorResolverInputs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
      screenshots,
      visualCapture,
      domSnapshots: fallbackDomSnapshots,
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
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
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
  options: { waitForControlsOnTextOnlySurface?: boolean } = {},
): Promise<ConsentUiObservation> {
  const immediateObservation = await readConsentUiObservation(page, scanStartedAtMs);
  if (
    immediateObservation.controls.length > 0 ||
    (immediateObservation.likelyPresent && !options.waitForControlsOnTextOnlySurface) ||
    waitForControlTimeoutMs <= 0
  ) {
    return immediateObservation;
  }

  await page.waitForFunction(String.raw`(() => {
    const consentLabelPattern =
      /cookie|privacy|choice|choices|consent|preference|preferences|settings|options|accept|agree|allow|reject|decline|deny|refuse|necessary|essential|purpose|purposes|do not sell|do not share|opt[- ]out|targeted advertising/i;
    const actionFor = (label) => {
      const normalized = label.replace(/\s+/g, " ").trim().toLowerCase();
      if (/do not sell|do not share|do not sell or share|your privacy choices|privacy choices|opt[- ]out|targeted advertising|limit use of (?:my )?sensitive/.test(normalized)) {
        return "do_not_sell_share";
      }
      if (/^(?:accept all|allow all|accept cookies|i agree|agree and continue)$/.test(normalized) || /\baccept all\b/.test(normalized)) {
        return "accept_all";
      }
      if (/reject all|decline all|deny all|refuse all|only necessary|necessary only|only essential|essential only|essential cookies only|accept essential|accept necessary/i.test(normalized)) {
        return "reject_all";
      }
      if (/show purposes|manage|preferences|settings|choices|customi[sz]e|options|privacy center/i.test(normalized)) {
        return "manage_preferences";
      }
      if (/save|confirm|apply/.test(normalized)) {
        return "save_preferences";
      }
      return "other";
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
    return Array.from(document.querySelectorAll("button, [role='button'], a, input[type='button'], input[type='submit']")).some((element) => {
      const label = (
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        (element instanceof HTMLInputElement ? element.value : "") ||
        element.textContent ||
        ""
      ).replace(/\s+/g, " ").trim();
      const actionType = actionFor(label);
      return isVisible(element) && isFirstLayerPosition(element) && consentLabelPattern.test(label) && actionType !== "other";
    });
  })()`, { timeout: waitForControlTimeoutMs }).catch(() => undefined);

  return readConsentUiObservation(page, scanStartedAtMs);
}

async function readConsentUiObservation(
  page: Page,
  scanStartedAtMs: number,
): Promise<ConsentUiObservation> {
  const text = await page.evaluate(() => (document.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 12_000)).catch(() => "");
  const controls = await page.evaluate<ConsentUiObservation["controls"]>(String.raw`(() => {
    const consentLabelPattern =
      /cookie|privacy|choice|choices|consent|preference|preferences|settings|options|accept|agree|allow|reject|decline|deny|refuse|necessary|essential|purpose|purposes|save|confirm|do not sell|do not share|opt[- ]out|targeted advertising/i;
    const actionFor = (label) => {
      const normalized = label.replace(/\s+/g, " ").trim().toLowerCase();
      if (/do not sell|do not share|do not sell or share|your privacy choices|privacy choices|opt[- ]out|targeted advertising|limit use of (?:my )?sensitive/.test(normalized)) {
        return "do_not_sell_share";
      }
      if (/^(?:accept all|allow all|accept cookies|i agree|agree and continue)$/.test(normalized) || /\baccept all\b/.test(normalized)) {
        return "accept_all";
      }
      if (
        /reject all|decline all|deny all|refuse all|only necessary|necessary only|only essential|essential only|essential cookies only|accept essential|accept necessary/i.test(normalized)
      ) {
        return "reject_all";
      }
      if (/show purposes|manage|preferences|settings|choices|customi[sz]e|options|privacy center/i.test(normalized)) {
        return "manage_preferences";
      }
      if (/save|confirm|apply/.test(normalized)) {
        return "save_preferences";
      }
      return "other";
    };
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
    const isPotentialCustomControl = (element) => {
      const role = (element.getAttribute("role") || "").toLowerCase();
      const tabIndex = element.getAttribute("tabindex");
      const className = element.getAttribute("class") || "";
      const id = element.getAttribute("id") || "";
      return (
        role === "button" ||
        role === "link" ||
        tabIndex === "0" ||
        element.hasAttribute("onclick") ||
        /\b(?:btn|button|choice|option|preference|purpose)\b/i.test(className) ||
        /(?:btn|button|choice|option|preference|purpose)/i.test(id)
      );
    };
    const directCandidates = Array.from(document.querySelectorAll("button, [role='button'], a, input[type='button'], input[type='submit']"));
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
    const directSet = new Set(directCandidates);
    const textCandidates = Array.from(document.querySelectorAll(customControlSelectors))
      .filter((element) => !directSet.has(element))
      .slice(0, 250)
      .filter((element) => {
        if (element.querySelector("button, [role='button'], a, input[type='button'], input[type='submit']")) {
          return false;
        }
        if (!isPotentialCustomControl(element)) {
          return false;
        }
        const label = labelFor(element);
        if (!label || label.length > 140 || !consentLabelPattern.test(label)) {
          return false;
        }
        const actionType = actionFor(label);
        if (actionType === "other") {
          return false;
        }
        if (
          actionType === "manage_preferences" &&
          !/(cookie|privacy|consent|purpose|preference|choice|show purposes|^settings$|^options$)/i.test(label)
        ) {
          return false;
        }
        return !Array.from(element.children).slice(0, 20).some((child) => {
          const childLabel = labelFor(child);
          return childLabel && childLabel !== label && consentLabelPattern.test(childLabel);
        });
      });
    const candidates = [...directCandidates.slice(0, 500), ...textCandidates];
    const seen = new Set();
    return candidates.flatMap((element) => {
      if (!isVisible(element)) {
        return [];
      }
      const label = labelFor(element).slice(0, 120);
      if (!label || !consentLabelPattern.test(label)) {
        return [];
      }
      const actionType = actionFor(label);
      if (actionType === "other") {
        return [];
      }
      if (
        actionType === "manage_preferences" &&
        !/(cookie|privacy|consent|purpose|preference|choice|show purposes|^settings$|^options$)/i.test(label)
      ) {
        return [];
      }
      if (!isFirstLayerPosition(element)) {
        return [];
      }
      const dedupeKey = actionType + ":" + label.toLowerCase();
      if (seen.has(dedupeKey)) {
        return [];
      }
      seen.add(dedupeKey);
      return [{
        actionType,
        label,
        role: element.getAttribute("role") || undefined,
        selectorHint: selectorHintFor(element),
        tagName: element.tagName.toLowerCase(),
        visible: true,
      }];
    }).slice(0, 12);
  })()`).catch((): ConsentUiObservation["controls"] => {
    return [];
  });
  return buildConsentUiObservationFromEvidence({
    scanStartedAtMs,
    text,
    controls,
  });
}

function buildConsentUiObservationFromEvidence(input: {
  controls: ConsentUiObservation["controls"];
  fallbackBasis?: string[];
  scanStartedAtMs: number;
  text: string;
}): ConsentUiObservation {
  const { controls, fallbackBasis = [], scanStartedAtMs, text } = input;
  const normalized = text.toLowerCase();
  const keywords = [
    "cookie",
    "cookies",
    "consent",
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
    control.actionType === "manage_preferences" || control.actionType === "do_not_sell_share"
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
    acceptControlObserved,
    rejectControlObserved,
    managePreferencesControlObserved,
    controls,
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
  return /\b(?:cookie|cookies|consent|privacy preferences|privacy choices)\b/i.test(normalized) &&
    /\b(?:accept|agree|allow|reject|decline|deny|refuse|settings|preferences|choices|options|necessary|essential)\b/i.test(normalized);
}

function hasTextBackedConsentSurface(observation: ConsentUiObservation): boolean {
  if (!observation.likelyPresent || observation.controls.length > 0) {
    return false;
  }
  const keywordBasisCount = observation.basis.filter((basis) => basis.startsWith("keyword:")).length;
  return keywordBasisCount >= 2 && (observation.textExcerpt ?? "").trim().length >= 80;
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
  return !current.likelyPresent && candidate.likelyPresent;
}

function mergeConsentUiObservations(
  current: ConsentUiObservation,
  candidate: ConsentUiObservation,
  basis: string,
): ConsentUiObservation {
  return {
    ...candidate,
    basis: unique([
      ...current.basis,
      ...candidate.basis,
      basis,
    ]),
    confidence: Math.max(current.confidence, candidate.confidence),
    evidenceRefs: uniqueEvidenceRefs([
      ...current.evidenceRefs,
      ...candidate.evidenceRefs,
    ]),
  };
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
  const isGoogleHost = hostname === "google.com" || hostname.endsWith(".google.com");
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
