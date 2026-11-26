import type { ActionResourceInventory } from "./action-resource-inventory";
import { type GpcBoundedObservation, sanitizeRuntimeGraphUrl } from "@certscore/contracts";
import type { ReportRequestDetail, ReportReviewFocus } from "@certscore/api-contracts";
import { getDomain } from "tldts";
import type { ShadowReportData } from "../../components/scans/report-lab/shadow-report-data";
import { readPreconsentTrackingTiming } from "./preconsent-tracking-timing";
import { formatReportSeconds } from "./report-time";

const choiceList = new Intl.ListFormat("en-US", {style: "long", type: "conjunction"});

const storageByCode: Record<string, string | undefined> = {
  G100: "ad and analytics storage denied",
  G101: "ad storage denied and analytics storage granted",
  G110: "ad storage granted and analytics storage denied",
  G111: "ad and analytics storage granted",
};

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

type RetainedRequestSources = {
  scanId: string;
  documentOrigin?: string;
  preConsentEvidence?: unknown;
  rejectInventory?: ActionResourceInventory | null;
  gpcObservation?: GpcBoundedObservation;
};

function preChoice(source: RetainedRequestSources, rows: ReportRequestDetail[]) {
  const retained = object(source.preConsentEvidence);
  if (!retained) return;
  for (const request of readPreconsentTrackingTiming(retained.trackingRequestTiming)) {
    const mode = request.googleConsentMode;
    if (!mode || mode.storageDeclaration === "unknown" || !request.eventId) continue;
    const { observation } = mode;
    const storage = storageByCode[observation.gcs];
    if (!storage) continue;
    const nonPersonalized = observation.nonPersonalizedAds === "declared";
    rows.push({
      kind: "consent_mode", phase: "before_choice", title: "Google Analytics before consent",
      evidenceRef: request.eventId, elapsedMs: request.firstSeenMs,
      endpoint: observation.requestOrigin + observation.requestPath,
      fields: nonPersonalized ? [observation.gcs, "npa"] : [observation.gcs],
      summary: "At " + formatReportSeconds(request.firstSeenMs) + ", the request declared " + storage +
        " (" + observation.gcs + ")" + (nonPersonalized ? " and requested non-personalized ads." : "."),
    });
  }
  const page = source.documentOrigin && URL.parse(source.documentOrigin);
  const site = page && getDomain(page.hostname, {allowPrivateDomains:true});
  if (!site || !Array.isArray(retained.findingEntities)) return;
  for (const finding of retained.findingEntities) {
    const entry = object(finding);
    if (entry?.id !== "preconsent_tracking") continue;
    const urls = object(entry.entities)?.runtimeRequestUrls;
    if (!Array.isArray(urls)) continue;
    for (const raw of urls) {
      const url = typeof raw === "string" ? URL.parse(raw) : null;
      if (!url || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/g/collect" ||
        getDomain(url.hostname, {allowPrivateDomains: true}) !== site || !url.searchParams.get("tid") || !url.searchParams.get("cid")) continue;
      const fields = ["tid", "cid", "gcs", "gcd"].filter(key => url.searchParams.has(key));
      const endpoint = url.origin + url.pathname;
      if (rows.some(prior => prior.kind === "same_site_measurement" && prior.endpoint === endpoint && prior.fields?.join() === fields.join())) continue;
      rows.push({
        kind: "same_site_measurement", phase: "before_choice", title: "Same-site measurement",
        endpoint, fields, evidenceRef: "pre_consent_third_party_tracking",
        summary: `Before consent, the request included measurement and client ID fields${fields.length > 2 ? " and consent fields" : ""} (${fields.join(", ")}).`});
    }
  }
}

function postReject(source: RetainedRequestSources, rows: ReportRequestDetail[]) {
  const inventory = source.rejectInventory;
  if (!inventory?.measurement?.execution.clickCompleted || inventory.measurement.documentChanged) return;
  if (inventory.clockLabel !== "Times from the Reject click" || inventory.scope !== "retained_capture") return;
  const resources = new Map(inventory.inventory.resources.map(resource => [resource.key, resource]));
  // Older serialized inventories can still identify an individual event for a singleton.
  const events = inventory.rejectAdEvents ?? inventory.inventory.resources.flatMap(resource => {
    const { occurrence } = resource;
    if (resource.eventCount !== 1 || resource.inventoryEvidence !== "Non-essential" || occurrence.purpose !== "advertising" ||
        occurrence.firstSeenMs === null || !occurrence.evidenceRefs?.some(ref => ref.startsWith("post-reject:") && ref.endsWith(":" + occurrence.id))) return [];
    return [{resourceKey: resource.key, evidenceRef: occurrence.id, elapsedMs: occurrence.firstSeenMs}];
  });
  for (const event of events) {
    const resource = resources.get(event.resourceKey);
    if (!resource || resource.kind !== "request" || !resource.pageIds.includes(source.scanId) || event.elapsedMs < 0) continue;
    const endpoint = sanitizeRuntimeGraphUrl(resource.name);
    if (!endpoint) continue;
    const method = resource.occurrence.details?.method;
    const product = resource.context.identity?.product;
    const recipient = product === "Microsoft Advertising / Bing UET" ? "Microsoft Ads (Bing UET)" :
      product ?? resource.occurrence.vendor ?? resource.occurrence.domain ?? new URL(endpoint).hostname;
    rows.push({
      kind: "reject_ad", phase: "after_reject_click", title: "Ad requests post reject", summary: "",
      elapsedMs: event.elapsedMs, evidenceRef: event.evidenceRef, recipient, endpoint,
      ...(method === "GET" || method === "POST" || method === "PUT" || method === "HEAD" || method === "PATCH" || method === "DELETE" || method === "OPTIONS" ? {method} : {}),
    });
  }
}

function underGpc(source: RetainedRequestSources, rows: ReportRequestDetail[]) {
  const obs = source.gpcObservation;
  if (!obs || obs.scanId !== source.scanId || !obs.sourceSha256 || !obs.sessionSha256 || !obs.documentUrlSha256 ||
    obs.status === "unavailable" || !obs.delivery.httpHeaderRetained || !obs.delivery.mainNavigatorReadbackRetained) return;
  const acknowledgment = obs.cmpStatusReadback?.source === "visible_cookiebot_gpc_notification"
    ? " The page displayed a GPC acknowledgment." : " The site acknowledged GPC.";
  rows.push({
    kind: "gpc_signal", phase: "gpc_visit", evidenceRef: obs.sourceSha256,
    title: obs.acknowledgment.observed ? "GPC acknowledged" : "GPC delivered",
    summary: "The page request carried Sec-GPC: 1 and the browser exposed the GPC preference." +
      (obs.acknowledgment.observed ? acknowledgment : ""),
  });
  for (const request of obs.requests.collectionReview?.rows ?? []) {
    if (request.httpStatus < 200 || request.httpStatus >= 300) continue;
    const { qualification } = request;
    const signals = qualification.processingSignals;
    const common = {
      phase: "gpc_visit" as const, recipient: request.label,
      elapsedMs: request.observedAtMs, evidenceRef: request.evidenceId,
    };
    const at = "At " + formatReportSeconds(request.observedAtMs) + ", ";
    const consistent = !signals.includes("privacy_signal_invalid") && !signals.includes("privacy_signal_conflict");

    if (consistent && qualification.basis === "google_advertising_conversion_identifier") {
      const fields = signals.filter(signal => signal === "google_rdp" || signal === "google_npa");
      const labels = fields.map(field => field === "google_rdp" ? "restricted data processing" : "non-personalized ads");
      if (fields.length) rows.push({
        ...common, kind: "google_processing", title: "Google conversion request", fields,
        summary: at + "the request carried an advertising ID and declared " + labels.join(" and ") + ".",
      });
    }
    if (qualification.basis === "meta_pixel_identifier" || qualification.basis === "meta_advanced_matching_identifier") {
      const fields = [String(qualification.basis)];
      let summary = at + "the pixel sent " + (qualification.basis === "meta_pixel_identifier"
        ? "an advertising ID" : "an advanced matching identifier");
      if (consistent && signals.includes("meta_ldu")) {
        fields.push("meta_ldu");
        summary += " and requested Limited Data Use";
        if (qualification.metaLduGeography === "automatic") {
          fields.push("automatic_geography");
          summary += " with automatic country and state selection";
        }
      }
      rows.push({...common, kind: "meta_pixel", title: "Meta pixel request", fields, summary: summary + "."});
    }
    const gpp = qualification.gpp;
    if (!consistent || gpp?.status !== "decoded" || gpp.requestSignals !== "consistent" ||
        !gpp.applicableSections.includes(8)) continue;
    const california = gpp.sections.find(section => section.sectionId === 8);
    if (!california) continue;
    const fields: string[] = [];
    if (california.saleOptOut === 1) fields.push("sale opt-out");
    if (california.sharingOptOut === 1) fields.push("sharing opt-out");
    if (california.gpc === true) fields.push("GPC");
    if (fields.length) rows.push({
      ...common, kind: "california_gpp", title: "California opt-outs · " + request.label, fields,
      summary: at + "the request declared " + choiceList.format(fields) + " on.",
    });
  }
}

export function projectRetainedAdTechRequestDetails(source: RetainedRequestSources, focus: ReportReviewFocus) {
  const rows: ReportRequestDetail[] = [];
  if (focus === "ccpa_cpra") {
    underGpc(source, rows);
  } else {
    preChoice(source, rows);
    postReject(source, rows);
  }
  return rows.sort((a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity));
}

export function projectAdTechRequestDetails(report: ShadowReportData, focus: ReportReviewFocus) {
  const row = [...report.preConsentRuntimeRows, ...report.trackingExternalRows]
    .find(item => item.id === "pre_consent_third_party_tracking");
  const gpc = report.gpcResponse?.assessment;
  return projectRetainedAdTechRequestDetails({
    scanId: report.scan.id,
    documentOrigin: report.scan.documentOrigin,
    preConsentEvidence: row?.evidenceJson.retainedEvidence,
    rejectInventory: report.actionInventories?.reject,
    gpcObservation: gpc?.contractVersion === "certscore.gpc-response-assessment.v3" ? gpc.observation : undefined,
  }, focus);
}
