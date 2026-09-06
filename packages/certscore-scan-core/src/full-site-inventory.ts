import { createHash } from "node:crypto";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import {
  resolveCanonicalVendor,
  type VendorResolverInput,
} from "@certscore/vendor-resolver";
import {
  crawlDisplayUrl,
  crawlExclusion,
  robotsAllows,
  type RobotsPolicy,
  crawlObservationSchema,
  FULL_SITE_CONDITION,
  FULL_SITE_CONTRACT,
  type CrawlObservation,
  type CrawlOccurrence,
} from "@website-signal-risk-scanner/shared";
import {
  preConsentRuntimeScanner,
  type PreConsentRuntimeScannerResult,
} from "./scanners/pre-consent-runtime-scanner";
import { createArtifactWriter } from "./artifact-writer";
import { chromiumContextOptions } from "./playwright-runtime";
import { classifyScanNoGoTextForCalibration } from "./index";
import {
  assertPublicNetworkUrl,
  publicNetworkGuardEnabled,
} from "./public-network-guard";
import { classifyCookieParty, classifyParty } from "./domain-utils";

export function inventoryConfiguration(
  region: string,
  profile: "standard" | "tiny",
  waitMode: "fast" | "full" = "full",
) {
  return {
    region,
    profile,
    browser: "chromium",
    context: chromiumContextOptions(),
    globalPrivacyControl: false,
    consentAction: false,
    waitMode,
    observationProtocol: "passive_runtime.v1",
  };
}
export function inventoryHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
type Evidence = Pick<
  CanonicalEvidenceBundle,
  | "networkEvents"
  | "networkResponseEvents"
  | "cookieEvents"
  | "cookieSnapshots"
  | "storageSnapshots"
  | "scriptEvents"
  | "iframeEvents"
  | "domSnapshots"
>;

/** This projection describes observed resources. It never executes concern policy or assessment/scoring. */
export function projectFullSiteInventory(input: {
  evidence: Evidence;
  parentScanId: string;
  pageJobId: string;
  attemptId: string;
  configurationHash: string;
  requestedUrl: string;
  finalUrl: string | null;
  startedAt: string;
  completedAt: string;
  profile: "homepage_baseline" | "inventory_only";
  status: "completed" | "partial" | "failed";
  failureKind?: "navigation_timeout" | "collection_failure";
  sourceHash: string;
  links: string[];
  limitations: string[];
}): CrawlObservation {
  const { evidence } = input;
  const baseline = (event: { scenario?: string; consentStateAtTime: string }) =>
    event.consentStateAtTime === "pre_consent" &&
    (!event.scenario || event.scenario === "fresh_pre_consent");
  const mainIds = new Set(
    evidence.networkEvents
      .filter(
        (e) => e.isMainFrame && e.resourceType === "document" && baseline(e),
      )
      .map((e) => e.requestId),
  );
  const mainResponses = evidence.networkResponseEvents.filter(
    (e) => e.requestId && mainIds.has(e.requestId),
  );
  const response = mainResponses.at(-1);
  const httpStatus = response?.status ?? null;
  const noGo = classifyScanNoGoTextForCalibration(
    evidence.domSnapshots
      .filter(baseline)
      .map((d) => d.textExcerpt ?? "")
      .join("\n"),
  );
  const failureKind: CrawlObservation["failureKind"] =
    httpStatus === 429
      ? "rate_limit"
      : ["captcha_or_challenge", "challenge_or_robot_page"].includes(
            noGo?.visualPageState ?? "",
          ) || noGo?.reasonCode?.includes("challenge")
        ? "challenge"
        : (httpStatus !== null && httpStatus >= 400) || noGo
          ? "http_error"
          : input.status === "failed"
            ? (input.failureKind ?? "collection_failure")
            : null;
  const status =
    failureKind === "rate_limit" || failureKind === "challenge"
      ? "blocked"
      : failureKind
        ? "failed"
        : input.status;
  const occurrences: CrawlOccurrence[] = [];
  const services = new Map<string, CrawlOccurrence>();
  function add(
    data: Pick<
      CrawlOccurrence,
      "id" | "identity" | "kind" | "label" | "firstSeenMs" | "details"
    > &
      Partial<CrawlOccurrence>,
    resolver?: VendorResolverInput,
  ) {
    const resolved = resolver ? resolveCanonicalVendor(resolver) : null;
    const vendor = resolved?.observation;
    const serviceId = vendor?.registryAttribution?.serviceId ?? null;
    const row: CrawlOccurrence = {
      domain: null,
      vendor: vendor?.vendor ?? null,
      serviceId,
      purpose: vendor?.purpose ?? "unknown",
      resourceType: data.kind,
      relationship: "unknown",
      confidence: vendor ? String(vendor.confidence) : "unknown",
      assessment: "Not assessed",
      eventCount: 1,
      evidenceRefs: [data.id],
      ...data,
    };
    occurrences.push(row);
    if (serviceId) {
      const classificationKey = JSON.stringify([
        serviceId,
        row.purpose,
        row.relationship,
        row.confidence,
      ]);
      const previous = services.get(classificationKey);
      if (!previous)
        services.set(classificationKey, {
          ...row,
          kind: "service",
          identity: serviceId,
          id: `service:${inventoryHash(classificationKey)}`,
          label: vendor!.product ?? vendor!.vendor,
          resourceType: "service",
        });
      else {
        if (row.firstSeenMs !== null)
          previous.firstSeenMs = Math.min(
            previous.firstSeenMs ?? Infinity,
            row.firstSeenMs,
          );
        if (previous.evidenceRefs.length < 20)
          previous.evidenceRefs.push(row.id);
      }
    }
  }
  const finalUrl = input.finalUrl ?? input.requestedUrl;
  for (const event of evidence.networkEvents.filter(baseline)) {
    const responseObserved = evidence.networkResponseEvents.some(
      (r) => r.requestId === event.requestId,
    );
    add(
      {
        id: event.eventId,
        identity: inventoryHash([event.method, event.requestUrl]),
        kind: "request",
        label: crawlDisplayUrl(event.requestUrl),
        domain: event.requestHostname ?? null,
        resourceType: event.resourceType ?? "unknown",
        relationship: classifyParty(event.requestUrl, finalUrl),
        firstSeenMs: event.timestampMs,
        details: {
          method: event.method,
          responseObserved,
          frame: event.isSubFrame
            ? "subframe"
            : event.isMainFrame
              ? "main frame"
              : "worker or unknown",
          initiator: event.initiatorUrl
            ? crawlDisplayUrl(event.initiatorUrl)
            : null,
        },
      },
      { type: "request", url: event.requestUrl, evidenceId: event.eventId },
    );
  }
  // Snapshot identity includes all browser-supplied scope, including the partition. Cookie values never enter this projection.
  const cookieIds = new Set<string>();
  for (const snapshot of evidence.cookieSnapshots.filter(baseline))
    for (const cookie of snapshot.cookies) {
      const identity = inventoryHash([
        cookie.name,
        cookie.domain,
        cookie.path ?? null,
        cookie.partitionKey ?? null,
      ]);
      if (cookieIds.has(identity)) continue;
      cookieIds.add(identity);
      const classified = evidence.cookieEvents.find(
        (e) =>
          baseline(e) &&
          e.operation === "browser_snapshot" &&
          e.cookieName === cookie.name &&
          e.cookieDomain === cookie.domain &&
          e.cookiePath === cookie.path &&
          e.partitionKey === cookie.partitionKey,
      );
      add(
        {
          id: `${snapshot.artifactId}:${identity}`,
          identity,
          kind: "cookie",
          label: cookie.name || "(empty cookie name)",
          domain: cookie.domain,
          purpose: classified?.cookiePurpose ?? "unknown",
          relationship: classifyCookieParty(
            cookie.domain,
            new URL(finalUrl).hostname,
          ),
          firstSeenMs: classified?.timestampMs ?? snapshot.capturedAtMs,
          details: {
            path: cookie.path ?? null,
            partition: cookie.partitionKey ?? null,
            persistence:
              cookie.expires === undefined
                ? "unknown"
                : cookie.expires > 0
                  ? "persistent"
                  : "session",
            secure: cookie.secure ?? null,
            httpOnly: cookie.httpOnly ?? null,
          },
        },
        {
          type: "cookie",
          cookieName: cookie.name,
          hostname: cookie.domain,
          evidenceId: classified?.eventId,
        },
      );
    }
  for (const event of evidence.iframeEvents.filter(baseline))
    add(
      {
        id: event.eventId,
        identity: inventoryHash(event.frameUrl ?? event.eventId),
        kind: "embed",
        label: event.frameUrl
          ? crawlDisplayUrl(event.frameUrl)
          : "Unresolved frame",
        firstSeenMs: event.timestampMs,
        relationship: event.frameUrl
          ? classifyParty(event.frameUrl, finalUrl)
          : "unknown",
        details: {
          observation: "declared iframe",
          frameName: event.frameName ?? null,
        },
      },
      { type: "iframe", url: event.frameUrl, evidenceId: event.eventId },
    );
  for (const event of evidence.scriptEvents.filter(baseline))
    add(
      {
        id: event.eventId,
        identity: inventoryHash(event.scriptUrl ?? event.eventId),
        kind: "script",
        label: event.scriptUrl
          ? crawlDisplayUrl(event.scriptUrl)
          : "Inline script",
        firstSeenMs: event.timestampMs,
        details: { inline: event.inline },
        relationship: event.scriptUrl
          ? classifyParty(event.scriptUrl, finalUrl)
          : "first_party",
      },
      { type: "script", url: event.scriptUrl, evidenceId: event.eventId },
    );
  const storageIds = new Set<string>();
  for (const snapshot of evidence.storageSnapshots.filter(baseline))
    for (const type of ["localStorage", "sessionStorage"] as const) {
      for (const key of snapshot[`${type}Keys`]) {
        const origin = new URL(snapshot.url).origin,
          identity = inventoryHash([origin, type, key]);
        if (storageIds.has(identity)) continue;
        storageIds.add(identity);
        add({
          id: `${snapshot.artifactId}:${identity}`,
          identity,
          kind: "storage",
          label: key || "(empty storage key)",
          firstSeenMs: snapshot.capturedAtMs,
          domain: new URL(origin).hostname,
          resourceType: type,
          relationship: classifyParty(origin, finalUrl),
          details: { origin, type, valuesRedacted: true },
        });
      }
    }
  occurrences.push(...services.values());
  const retryHeader = response?.responseHeaders?.retryAfter;
  const retryAfter =
    typeof retryHeader === "string"
      ? /^\d+$/.test(retryHeader)
        ? Number(retryHeader)
        : Math.max(
            0,
            (Date.parse(retryHeader) - Date.parse(input.completedAt)) / 1000,
          )
      : NaN;
  const overflow = occurrences.length > 30000;
  return crawlObservationSchema.parse({
    contractVersion: FULL_SITE_CONTRACT,
    parentScanId: input.parentScanId,
    pageJobId: input.pageJobId,
    attemptId: input.attemptId,
    executionProfile: input.profile,
    condition: FULL_SITE_CONDITION,
    configurationHash: input.configurationHash,
    requestedUrl: crawlDisplayUrl(input.requestedUrl),
    finalUrl: input.finalUrl ? crawlDisplayUrl(input.finalUrl) : null,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: overflow && status === "completed" ? "partial" : status,
    limitations: [
      ...input.limitations,
      ...(overflow ? ["inventory_projection_limit"] : []),
      ...(failureKind ? [failureKind] : []),
    ].slice(0, 50),
    sourceHash: input.sourceHash,
    occurrences: ["blocked", "failed"].includes(status)
      ? []
      : occurrences.slice(0, 30000),
    links: input.links.slice(0, 5000),
    redirects: mainResponses
      .map((r) => crawlDisplayUrl(r.responseUrl))
      .slice(0, 20),
    httpStatus,
    retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
    failureKind,
  });
}

export async function runInventoryOnly(input: {
  url: string;
  region: string;
  profile: "standard" | "tiny";
  hosts: string[];
  robots?: RobotsPolicy;
  waitMode?: "fast" | "full";
  configurationHash: string;
  outDir: string;
  signal: AbortSignal;
}) {
  if (publicNetworkGuardEnabled()) await assertPublicNetworkUrl(input.url);
  if (
    inventoryHash(
      inventoryConfiguration(input.region, input.profile, input.waitMode),
    ) !== input.configurationHash
  )
    throw new Error(
      "Observation configuration differs from homepage baseline.",
    );
  const startedAt = new Date().toISOString();
  let finalUrl: string | null = null;
  let links: string[] = [];
  const evidence: PreConsentRuntimeScannerResult =
    await preConsentRuntimeScanner({
      url: input.url,
      normalizedUrl: input.url,
      scanStartedAtMs: Date.parse(startedAt),
      internalBudgetMs: input.profile === "tiny" ? 15000 : 35000,
      artifactWriter: await createArtifactWriter(input.outDir),
      executionProfile: "inventory_only",
      captureScope: "runtime_evidence",
      screenshotMode: "never",
      stubHeavyResources: false,
      globalPrivacyControlEnabled: false,
      waitMode: input.waitMode ?? "full",
      navigationHosts: input.hosts,
      navigationAllowed: (url) =>
        !crawlExclusion(url, input.hosts) &&
        (!input.robots || robotsAllows(url, input.robots)),
      signal: input.signal,
      onInventoryPage: async (page) => {
        finalUrl = page.url();
        links = await page
          .locator("a[href]")
          .evaluateAll((nodes) =>
            nodes
              .slice(0, 5000)
              .map((node) => (node as HTMLAnchorElement).href),
          );
      },
    });
  return {
    evidence,
    startedAt,
    completedAt: new Date().toISOString(),
    finalUrl,
    links,
  };
}
