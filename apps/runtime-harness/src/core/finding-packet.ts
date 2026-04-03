import type { CookieDetectionRecord, FindingPacket, FindingPacketItem, FindingSeverity, RuntimeRunResult } from "./types";

type FindingPacketSource = Omit<RuntimeRunResult, "findingPacket">;

type CookieRule = {
  cookieNames: string[];
  id: string;
  match: (cookie: CookieDetectionRecord) => boolean;
  severity: FindingSeverity;
  title: string;
  vendorNames: string[];
};

const COOKIE_RULES: CookieRule[] = [
  {
    cookieNames: ["_gcl_au"],
    id: "cookie_google_ads_conversion_linker",
    match: (cookie) => cookie.cookieName === "_gcl_au",
    severity: "high",
    title: "Google Ads conversion linker cookie observed before consent",
    vendorNames: ["Google"]
  },
  {
    cookieNames: ["_ga", "_ga_*"],
    id: "cookie_google_analytics",
    match: (cookie) => cookie.cookieName === "_ga" || cookie.cookieName.startsWith("_ga_"),
    severity: "high",
    title: "Google Analytics cookie observed before consent",
    vendorNames: ["Google Analytics", "Google"]
  },
  {
    cookieNames: ["_fbp"],
    id: "cookie_meta_pixel",
    match: (cookie) => cookie.cookieName === "_fbp",
    severity: "critical",
    title: "Meta Pixel cookie observed before consent",
    vendorNames: ["Meta Pixel"]
  },
  {
    cookieNames: ["IDE"],
    id: "cookie_doubleclick",
    match: (cookie) => cookie.cookieName === "IDE",
    severity: "critical",
    title: "DoubleClick retargeting cookie observed before consent",
    vendorNames: ["DoubleClick / Floodlight"]
  },
  {
    cookieNames: ["_rdt_uuid"],
    id: "cookie_reddit_ads",
    match: (cookie) => cookie.cookieName === "_rdt_uuid",
    severity: "high",
    title: "Reddit Ads cookie observed before consent",
    vendorNames: ["Reddit Ads"]
  },
  {
    cookieNames: ["_ttp", "_tt_enable_cookie", "ttcsid*"],
    id: "cookie_tiktok",
    match: (cookie) => cookie.cookieName === "_ttp" || cookie.cookieName === "_tt_enable_cookie" || cookie.cookieName.startsWith("ttcsid"),
    severity: "high",
    title: "TikTok tracking cookie observed before consent",
    vendorNames: ["TikTok"]
  }
];

function makeItem(item: FindingPacketItem): FindingPacketItem {
  return item;
}

function topVendorHosts(run: FindingPacketSource, vendorNames: string[]) {
  const allowed = new Set(vendorNames);
  return run.leakMap
    .filter((row) => row.vendorName && allowed.has(row.vendorName))
    .slice(0, 5)
    .map((row) => row.endpointHostname);
}

function cnameRequestHosts(run: FindingPacketSource) {
  return run.domainVendorRegistry
    .filter((row) => row.isCnameCloaked)
    .sort((left, right) => right.beforeConsentUiRequestCount - left.beforeConsentUiRequestCount || right.requestCount - left.requestCount)
    .slice(0, 5)
    .map((row) => row.endpointHostname);
}

export function buildFindingPacket(run: FindingPacketSource): FindingPacket {
  const items: FindingPacketItem[] = [];
  const hasSufficientDepthForAbsence = run.runQualitySummary.evidenceDepth === "full" || run.runQualitySummary.evidenceDepth === "moderate";

  items.push(
    makeItem({
      confidence: run.classification.blockerSummary.confidence,
      cookieNames: [],
      evidence:
        run.classification.blockerSummary.evidence.length > 0
          ? run.classification.blockerSummary.evidence
          : ["No blocker evidence observed in this run"],
      firstSeenTimestampMs: run.timings.firstChallengeTimestampMs,
      id: "blocker_summary",
      kind: "timeline",
      requestHosts: [],
      severity:
        run.classification.blockerSummary.outcome === "hard_block"
          ? "critical"
          : run.classification.blockerSummary.outcome === "challenge_wall"
            ? "high"
            : "none",
      sourceArtifacts: ["blocker-summary.json", "timings.json", "comparison.json"],
      status: run.classification.blockerSummary.outcome === "no_blocker_detected" ? "not_observed" : "confirmed",
      title:
        run.classification.blockerSummary.outcome === "no_blocker_detected"
          ? "No blocker detected"
          : `Blocker evidence observed${run.classification.blockerSummary.vendorHint ? ` (${run.classification.blockerSummary.vendorHint})` : ""}`,
      vendorNames: run.classification.blockerSummary.vendorHint ? [run.classification.blockerSummary.vendorHint] : []
    })
  );

  items.push(
    makeItem({
      confidence: run.consentUi.detected ? 0.95 : run.preConsentTimeline.length > 0 || run.cookiesBeforeConsent.length > 0 ? 0.9 : 0.6,
      cookieNames: [],
      evidence: run.consentUi.detected
        ? [`Consent UI detected at ${run.consentUi.firstDetectedTimestampMs ?? "unknown"} ms`, run.consentUi.textSnippet ?? "Consent UI text snippet unavailable"]
        : [
            `${run.preConsentTimeline.length} third-party request(s) observed before any consent UI was detected`,
            `${run.cookiesBeforeConsent.length} cookie(s) observed before consent UI detection`
          ],
      firstSeenTimestampMs: run.consentUi.firstDetectedTimestampMs,
      id: "consent_ui_detection",
      kind: "consent_ui",
      requestHosts: [],
      severity: run.consentUi.detected ? "none" : "critical",
      sourceArtifacts: ["consent-ui.json", "preconsent-timeline.json", "cookies-before-consent.json"],
      status: run.consentUi.detected ? "confirmed" : run.preConsentTimeline.length > 0 || run.cookiesBeforeConsent.length > 0 ? "confirmed" : "inconclusive",
      title: run.consentUi.detected ? "Consent UI detected during passive scan" : "No consent UI detected before pre-consent signals",
      vendorNames: []
    })
  );

  items.push(
    makeItem({
      confidence: run.preConsentTimeline.length > 0 ? 0.96 : 0.7,
      cookieNames: [],
      evidence:
        run.preConsentTimeline.length > 0
          ? [
              `${run.preConsentTimeline.length} third-party request(s) observed before consent`,
              ...run.preConsentTimeline.slice(0, 5).map((row) => `${row.vendorName ?? "unknown"} ${row.url} @ ${row.timestampMs} ms`)
            ]
          : ["No third-party pre-consent requests observed in this run"],
      firstSeenTimestampMs: run.timings.firstThirdPartyRequestTimestampMs,
      id: "preconsent_tracking_timeline",
      kind: "timeline",
      requestHosts: run.preConsentTimeline.slice(0, 5).map((row) => {
        try {
          return new URL(row.url).hostname;
        } catch {
          return row.url;
        }
      }),
      severity: run.preConsentTimeline.length > 0 ? "critical" : "none",
      sourceArtifacts: ["preconsent-timeline.json", "timings.json"],
      status: run.preConsentTimeline.length > 0 ? "confirmed" : "not_observed",
      title: run.preConsentTimeline.length > 0 ? "Pre-consent tracking observed" : "No pre-consent tracking observed",
      vendorNames: run.preConsentVendorSummary.normalizedVendors
    })
  );

  items.push(
    makeItem({
      confidence:
        run.fingerprinting.tier >= 3
          ? 0.95
          : run.fingerprinting.tier >= 2
            ? 0.85
            : run.fingerprinting.tier >= 1
              ? 0.7
              : 0.5,
      cookieNames: [],
      evidence:
        run.fingerprinting.tier > 0
          ? run.fingerprinting.reasons.length > 0
            ? run.fingerprinting.reasons
            : [run.fingerprinting.summary]
          : ["No fingerprinting-specific evidence surfaced in this run"],
      firstSeenTimestampMs: run.fingerprintApiEventSamples[0]?.tsMs ?? null,
      id: "fingerprinting_detection",
      kind: "timeline",
      requestHosts: run.requestObservations
        .filter((row) => row.identifierLike || row.deviceDataLike)
        .slice(0, 5)
        .map((row) => row.domain),
      severity:
        run.fingerprinting.tier >= 3
          ? "high"
          : run.fingerprinting.tier >= 2
            ? "medium"
            : run.fingerprinting.tier >= 1
              ? "low"
              : "none",
      sourceArtifacts: ["fingerprinting.json", "fingerprint-api-event-samples.json", "request-observations.json"],
      status: run.fingerprinting.tier > 0 ? "confirmed" : hasSufficientDepthForAbsence ? "not_observed" : "inconclusive",
      title:
        run.fingerprinting.tier >= 3
          ? "Likely browser fingerprinting detected"
          : run.fingerprinting.tier >= 2
            ? "Potential browser fingerprinting detected"
            : run.fingerprinting.tier >= 1
              ? "Suspicious anti-bot or fingerprint-related telemetry detected"
              : "No fingerprinting-specific evidence detected",
      vendorNames: [
        ...new Set(
          [run.fingerprinting.signals.knownBotLibraryMatch, run.fingerprinting.signals.knownFingerprintLibraryMatch].filter(
            (value): value is string => typeof value === "string" && value.length > 0
          )
        )
      ]
    })
  );

  for (const rule of COOKIE_RULES) {
    const matches = run.cookiesBeforeConsent.filter(rule.match);
    items.push(
      makeItem({
        confidence: matches.length > 0 ? 0.98 : run.timings.firstCookieTimestampMs !== null ? 0.75 : 0.55,
        cookieNames: matches.map((cookie) => cookie.cookieName),
        evidence:
          matches.length > 0
            ? matches.map((cookie) => `${cookie.cookieName} @ ${cookie.cookieDomain ?? "unknown-domain"} (${cookie.firstSeenTimestampMs} ms)`)
            : ["Cookie not observed in this run"],
        firstSeenTimestampMs: matches[0]?.firstSeenTimestampMs ?? null,
        id: rule.id,
        kind: "cookie",
        requestHosts: topVendorHosts(run, rule.vendorNames),
        severity: matches.length > 0 ? rule.severity : "none",
        sourceArtifacts: ["cookies-before-consent.json", "preconsent-timeline.json", "leak-map.json"],
        status: matches.length > 0 ? "confirmed" : run.timings.firstCookieTimestampMs !== null && hasSufficientDepthForAbsence ? "not_observed" : "inconclusive",
        title: rule.title,
        vendorNames: rule.vendorNames
      })
    );
  }

  const topVendors = Object.entries(run.preConsentVendorSummary.vendorCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5);

  for (const [vendorName, count] of topVendors) {
    items.push(
      makeItem({
        confidence: count >= 10 ? 0.85 : 0.75,
        cookieNames: [],
        evidence: [`${vendorName} matched ${count} pre-consent request(s)`],
        firstSeenTimestampMs: run.preConsentTimeline.find((row) => row.vendorName === vendorName)?.timestampMs ?? null,
        id: `vendor_${vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        kind: "vendor",
        requestHosts: topVendorHosts(run, [vendorName]),
        severity: count >= 10 ? "medium" : "low",
        sourceArtifacts: ["preconsent-vendor-summary.json", "leak-map.json", "preconsent-timeline.json"],
        status: "confirmed",
        title: `${vendorName} observed in pre-consent/runtime vendor graph`,
        vendorNames: [vendorName]
      })
    );
  }

  items.push(
    makeItem({
      confidence: run.cnameCloaking.length > 0 ? 0.9 : 0.7,
      cookieNames: [],
      evidence:
        run.cnameCloaking.length > 0
          ? run.cnameCloaking.map((record) => {
              const registryRow = run.domainVendorRegistry.find((row) => row.endpointHostname === record.cloakedHost);
              const beforeConsentCount = registryRow?.beforeConsentUiRequestCount ?? 0;
              return `${record.cloakedHost} -> ${record.chain.join(" -> ")}${record.vendorName ? ` (${record.vendorName})` : ""}; before-consent requests: ${beforeConsentCount}`;
            })
          : ["No CNAME cloaking matches observed in this run"],
      firstSeenTimestampMs: null,
      id: "cname_cloaking",
      kind: "cname",
      requestHosts: run.cnameCloaking.length > 0 ? cnameRequestHosts(run) : [],
      severity: run.cnameCloaking.length > 0 ? "high" : "none",
      sourceArtifacts: ["cname-cloaking.json", "domain-vendor-registry.json"],
      status: run.cnameCloaking.length > 0 ? "confirmed" : hasSufficientDepthForAbsence ? "not_observed" : "inconclusive",
      title: run.cnameCloaking.length > 0 ? "CNAME cloaking detected" : "No CNAME cloaking detected",
      vendorNames: run.cnameCloaking.map((record) => record.vendorName).filter((value): value is string => Boolean(value))
    })
  );

  const postReject = run.postRejectPersistence;
  items.push(
    makeItem({
      confidence: postReject?.attempted ? 0.8 : 0.5,
      cookieNames: [],
      evidence: postReject
        ? [
            `Attempted: ${postReject.attempted}`,
            `Reject found: ${postReject.rejectFound}`,
            `Reject worked: ${postReject.rejectWorked}`,
            `Third-party requests after reject: ${postReject.thirdPartyRequestsAfterReject}`
          ]
        : ["Post-reject persistence was not evaluated in this run"],
      firstSeenTimestampMs: postReject?.observedRejectTimestampMs ?? null,
      id: "post_reject_persistence",
      kind: "reject_persistence",
      requestHosts: [],
      severity: postReject?.attempted && postReject.thirdPartyRequestsAfterReject > 0 ? "high" : "none",
      sourceArtifacts: ["post-reject-persistence.json"],
      status: !postReject || !postReject.attempted ? "inconclusive" : postReject.thirdPartyRequestsAfterReject > 0 ? "confirmed" : "not_observed",
      title:
        !postReject || !postReject.attempted
          ? "Post-reject persistence not evaluated"
          : postReject.thirdPartyRequestsAfterReject > 0
            ? "Post-reject script persistence observed"
            : "No post-reject script persistence observed",
      vendorNames: postReject?.persistedVendors ?? []
    })
  );

  const summary = items.reduce(
    (acc, item) => {
      if (item.status === "confirmed") acc.confirmed += 1;
      if (item.status === "likely") acc.likely += 1;
      if (item.status === "possible") acc.possible += 1;
      if (item.status === "not_observed") acc.notObserved += 1;
      if (item.status === "inconclusive") acc.inconclusive += 1;
      return acc;
    },
    {
      confirmed: 0,
      inconclusive: 0,
      likely: 0,
      notObserved: 0,
      possible: 0
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    items,
    summary,
    targetUrl: run.requestedUrl
  };
}
