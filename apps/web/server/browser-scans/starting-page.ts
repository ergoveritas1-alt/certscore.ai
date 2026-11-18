import type { ScanNoGoAssessment } from "@certscore/contracts";
import { resolveScanNoGoPresentation, type ScanNoGoReasonCode } from "@website-signal-risk-scanner/shared";
import type { BrowserScanArtifactRow, BrowserScanEventRow } from "./evidence-summary";

function documentUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function limit(reason: ScanNoGoReasonCode, detail: string, status?: number) {
  const assessment: ScanNoGoAssessment = {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision: "no_go",
    scanNoGoConfidence: 1,
    reasonCodes: [reason],
    corroboratorCodes: [],
    contradictorCodes: [],
    supportingSignals: { assessmentPolicy: "browser_extension_starting_page.v1", detail, mainDocumentStatus: status ?? null },
    evidenceRefs: ["browser_scan_events.main_frame", "browser_scan_artifacts.page_evidence"],
  };
  return { assessment, presentation: resolveScanNoGoPresentation(reason) };
}

/** Input rows belong to one intake session. Only the selected tab's final main document can qualify. */
export function assessBrowserStartingPage(target: string, events: BrowserScanEventRow[], artifacts: BrowserScanArtifactRow[]) {
  const documents = events.map(row => row.event_json)
    .filter(event => event.eventType === "network_request")
    .filter(event => event.resourceType === "main_frame");
  const first = documents[0];
  const last = documents.at(-1);
  const requested = documentUrl(target);
  const final = documentUrl(last?.url);
  if (!requested || !first || !last || !final || documentUrl(first.url)?.href !== requested.href ||
      typeof first.tabId !== "number" || documents.some(doc => doc.tabId !== first.tabId)) {
    return limit("runtime_capture_unverified", "starting_document_unverified");
  }
  for (let i = 1; i < documents.length; i++) {
    const previous = documents[i - 1]!;
    const next = documentUrl(documents[i]!.url);
    // Older clients retain no redirect destination. They can still verify a direct visit.
    if (next?.href === documentUrl(previous.url)?.href && last.statusCode && last.statusCode >= 400) continue;
    if (!next || !(next.origin === requested.origin ||
        (requested.protocol === "http:" && next.protocol === "https:" && next.host === requested.host)) ||
        ![301, 302, 303, 307, 308].includes(previous.statusCode ?? 0) ||
        documentUrl(previous.redirectUrl)?.href !== next.href) {
      return limit("runtime_capture_unverified", "document_navigation_unverified", last.statusCode);
    }
  }
  const status = last.statusCode;
  if (status === 403) return limit("access_denied_or_forbidden_page", "main_document_forbidden", status);
  if (status === 401) return limit("authentication_required", "main_document_requires_sign_in", status);
  if (status === 429) return limit("rate_limited_429", "main_document_rate_limited", status);
  if (status === 404 || status === 410) return limit("not_found_404", "main_document_missing", status);
  if (status && status >= 500) return limit("server_error_5xx", "main_document_server_error", status);
  if (!status || status < 200 || status >= 300 || [202, 204, 205, 206].includes(status)) {
    return limit("runtime_capture_unverified", "main_document_content_unverified", status);
  }
  const pages = artifacts.filter(a => a.artifact_type === "page_evidence" && a.artifact_json.pageType === "homepage");
  const page = pages.length === 1 ? pages[0]!.artifact_json : undefined;
  if (!page || documentUrl(page.finalUrl)?.href !== final.href || typeof page.capturedAtMs !== "number" ||
      page.capturedAtMs < last.observedAtMs || page.sourceId !== "BX01" || page.sourceType !== "browser_extension") {
    return limit("runtime_capture_unverified", "rendered_document_unverified", status);
  }
  const title = typeof page.title === "string" ? page.title.trim() : "";
  if (page.challengeScreen === true || /^(?:verify (?:you are|you're) human|checking your browser|security verification|attention required!\s*\|\s*cloudflare)[.!…\s]*$/i.test(title)) {
    return limit("captcha_or_challenge", "rendered_challenge", status);
  }
  if (page.accessDeniedScreen === true || /^(?:access denied|403 forbidden|forbidden)[.!\s]*$/i.test(title)) {
    return limit("access_denied_or_forbidden_page", "rendered_denial", status);
  }
  const headings = (page.accessibilitySummary as { headingCount?: unknown } | undefined)?.headingCount;
  // Published 0.2.0 lacks the readable-content marker. Require independent structured page evidence.
  const legacyContent = Boolean(title && typeof headings === "number" && headings > 0 &&
    Array.isArray(page.policyLinks) && page.policyLinks.length);
  if (/^(?:just a moment|loading|please wait)[.!…\s]*$/i.test(title) ||
      !(page.hasReadableContent === true || (page.hasReadableContent === undefined && legacyContent))) {
    return limit("runtime_capture_unverified", "representative_content_unverified", status);
  }
  return null;
}
