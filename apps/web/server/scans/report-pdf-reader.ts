import type { CanonicalReportExport } from "./report-export";
import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { pdfTopicForFinding, pdfTopicForRow, type PdfReportTopic } from "./report-pdf-topics";
import { detailedEvidenceCopy } from "../../lib/scans/detailed-evidence-copy";
import { readChecklistRemediation } from "../../lib/scans/checklist-remediation";
import { SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { SITE_INTEGRITY_REMEDIATION } from "../../lib/scans/site-integrity-remediation";
import { reportRowInFocus } from "../../lib/scans/report-framework-scope";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const findingRows: Record<string, string> = {
  preconsent_tracking: "pre_consent_third_party_tracking", session_replay_observed: "session_replay_fingerprinting_review",
  post_refusal_non_essential_activity: "post_reject_tracking_reduction", post_reject_click_tracking: "post_reject_tracking_reduction",
};
const groups: Record<string, { key: string; title: string }> = {
  pre_consent_third_party_tracking: { key: "initial-tracking", title: "Tracking before a consent choice" },
  pre_consent_cookies_storage: { key: "initial-tracking", title: "Tracking before a consent choice" },
  social_media_embed_pre_consent: { key: "initial-tracking", title: "Tracking before a consent choice" },
  embedded_content_pre_consent: { key: "initial-tracking", title: "Tracking before a consent choice" },
  third_party_iframe_pre_consent: { key: "initial-tracking", title: "Tracking before a consent choice" },
  session_replay_fingerprinting_review: { key: "initial-tracking", title: "Tracking before a consent choice" },
  post_reject_tracking_reduction: { key: "refusal", title: "Activity after the Reject confirmation" },
  privacy_notice_availability: { key: "privacy-notice", title: "Privacy policy not found" },
  device_identification_fingerprinting_signal_observed: { key: "device-identification", title: "Device-identification signals to review" },
};

export type PdfReviewObservation = {
  id: string; title: string; status: string; explanation: string; steps: string[]; topic: PdfReportTopic;
  severity?: string; confidence?: string;
};
export type PdfReviewGroup = { id: string; title: string; status: string; observations: PdfReviewObservation[]; topic: PdfReportTopic };

export function pdfTestedUrl(report: CanonicalReportExport) {
  return report.scan.requestedUrl ?? report.consentControlAssessment?.scan.requestedUrl ?? report.appendix.dataCollectionSurfaces?.pageUrl ?? null;
}

export function pdfRegionLabel(region: unknown) {
  return region === "eu_ie" ? "Ireland (EU)" : region === "eu_de" ? "Germany (EU)" :
    region === "california" || region === "us_ca" ? "California (US)" : "Location unavailable";
}

export function pdfConfidenceLabel(value: unknown) {
  const score = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(score) || score < 0 || score > 1) return "Confidence not established";
  return score >= 0.8 ? "High confidence" : score >= 0.5 ? "Moderate confidence" : "Limited confidence - verify first";
}

export function pdfReviewGroups(report: CanonicalReportExport): PdfReviewGroup[] {
  const rows = (report.gdprEprivacyReview?.rows ?? []).filter(row=>reportRowInFocus(row.id,report.reviewFocus));
  const findings = pdfNarrativeFindings(report);
  const details = report.appendix.evidenceDossier?.checklistDetails ?? [];
  const observations: PdfReviewObservation[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error("Duplicate canonical PDF checklist identity.");
    seen.add(row.id);
    if (!["Gap observed", "Review signal"].includes(row.status)) continue;
    const canonical = report.projection.checklist?.find(item => item.id === row.id);
    const detail = details.find(item => item.id === row.id);
    const finding = findings.find(item => findingRows[string(item.unifiedFindingId)] === row.id || item.unifiedFindingId === row.id);
    const presentation = object(finding?.presentation);
    const titles: Record<string, string> = { social_media_embed_pre_consent: "Social / advertising service requests before consent", embedded_content_pre_consent: "Embedded-service requests before consent" };
    const copy = detailedEvidenceCopy({ id: row.id, title: row.id === "privacy_notice_availability" && row.status === "Gap observed" ? "Privacy policy not found" : titles[row.id] ?? row.label, status: row.status,
      summary: row.id === "privacy_notice_availability" && canonical?.criticalEvidence?.statusBasis ? canonical.criticalEvidence.statusBasis : row.rationale });
    const remediation = readChecklistRemediation(canonical?.criticalEvidence?.retainedEvidence?.remediation);
    const explanation = copy.summary ?? row.rationale;
    observations.push({ id: row.id, title: titles[row.id] ?? copy.title, status: row.status,
      explanation: row.id === "post_reject_tracking_reduction" && row.status === "Gap observed" ? explanation.replace(/^Potential issue based on scan evidence;\s*/, "") : explanation,
      steps: remediation?.steps.length ? [...remediation.steps] : detail?.correctionSteps ?? [],
      topic: pdfTopicForRow(row.id) ?? "policy", severity: string(finding?.severity) || undefined,
      confidence: finding ? pdfConfidenceLabel(presentation.confidenceScore) : undefined });
  }
  for (const finding of findings) {
    const id = string(finding.unifiedFindingId);
    if (id === "gpc_response" || observations.some(observation => observation.id === (findingRows[id] ?? id))) continue;
    const presentation = object(finding.presentation);
    observations.push({ id, title: string(presentation.findingName ?? finding.title) || id, status: string(finding.status) || "Finding",
      explanation: string(finding.summary), steps: id === SITE_INTEGRITY_FINDING_ID ? [...SITE_INTEGRITY_REMEDIATION.steps] : [string(presentation.suggestedFix)].filter(Boolean),
      topic: pdfTopicForFinding(finding) ?? "policy", severity: string(finding.severity), confidence: pdfConfidenceLabel(presentation.confidenceScore) });
  }
  const result = new Map<string, PdfReviewGroup>();
  for (const observation of observations) {
    const definition = groups[observation.id] ?? { key: observation.id, title: observation.title };
    const current = result.get(definition.key);
    if (current) {
      current.observations.push(observation);
      if (observation.status === "Gap observed") current.status = "Gap observed";
    } else result.set(definition.key, { id: definition.key, title: definition.title, status: observation.status, topic: observation.topic, observations: [observation] });
  }
  return [...result.values()].sort((left, right) => Number(right.status === "Gap observed") - Number(left.status === "Gap observed"));
}

export function pdfChoiceWindows(report: CanonicalReportExport) {
  const rows = report.appendix.evidenceDossier?.cmp?.audit.rows ?? [];
  return rows.flatMap(row => row.supportingEvidence?.inventory?.choiceActivity ?? [])
    .filter((item, index, all) => all.findIndex(candidate => candidate.action === item.action) === index);
}

export function pdfInventoryRows(report: CanonicalReportExport) {
  const rows = report.appendix.cookieAndTrackerInventory.rows;
  const storage = rows.filter(row => row.type === "cookie" || row.type === "storage");
  const external = rows.filter(row => row.type !== "cookie" && row.type !== "storage").filter((row, index, all) => {
    const identity = (candidate: typeof row) => JSON.stringify([candidate.vendor, candidate.purpose, candidate.domains, candidate.cookieNames, candidate.requestDetails]);
    return all.findIndex(candidate => identity(candidate) === identity(row)) === index;
  });
  return { storage, external };
}

export function pdfRelatedCookieServices(report: CanonicalReportExport, cookieNames: string[]) {
  return pdfInventoryRows(report).external.filter(row => row.confidence === "high" && row.cookieNames.some(name => cookieNames.includes(name)))
    .map(row => `${row.vendor} (${row.purpose.join(", ")})`)
    .filter((item, index, all) => all.indexOf(item) === index);
}

export function pdfTimingEvents(report: CanonicalReportExport) {
  const finding = report.projection.unifiedFindings.find(item => item.unifiedFindingId === "preconsent_tracking");
  const packet = object(finding?.evidence);
  const counts = object(packet.counts);
  const events: Array<{ label: string; milliseconds: number }> = [];
  for (const [key, label] of [["firstThirdPartyRequestMs", "First third-party request"], ["cmpVisibleMs", "Banner visible"]]) {
    if (typeof counts[key!] === "number") events.push({ label: label!, milliseconds: counts[key!] as number });
  }
  const cookieTimes = report.appendix.cookieAndTrackerInventory.rows.filter(row => row.type === "cookie" && row.preConsent).map(row => row.firstSeenMs).filter((value): value is number => typeof value === "number");
  if (cookieTimes.length) events.push({ label: "Cookies first observed", milliseconds: Math.min(...cookieTimes) });
  return events.sort((left, right) => left.milliseconds - right.milliseconds);
}

export function pdfRejectTimingEvents(report: CanonicalReportExport) {
  const timing = report.appendix.evidenceDossier?.rejectTiming;
  if (!timing?.inFlightExclusionVerified || !pdfReviewGroups(report).some(group => group.id === "refusal")) return [];
  const request = timing.networkRequests?.slice().sort((left, right) => left.millisecondsAfterConfirmation - right.millisecondsAfterConfirmation)[0];
  return request ? [{ label: "Reject confirmed", milliseconds: 0 }, { label: "Request started", milliseconds: request.millisecondsAfterConfirmation }] : [];
}

export function pdfRemediationOwner(group: PdfReviewGroup) {
  return group.id === "privacy-notice" || group.topic === "policy" ? "Legal / privacy owner · M" :
    ["refusal", "initial-tracking"].includes(group.id) ? "Marketing / tag manager + developer · M" : "Developer · M";
}

export function pdfReportCounts(report: CanonicalReportExport) {
  const reviewGroups = pdfReviewGroups(report);
  const observations = reviewGroups.flatMap(group => group.observations);
  return { groups: reviewGroups.length, observations: observations.length,
    gaps: observations.filter(row => row.status === "Gap observed").length,
    review: observations.filter(row => row.status === "Review signal").length };
}

export function pdfPublicWords(value: string) {
  return value.replace(/\bretained\s+/gi, "").replace(/\b3rd[- ]party\b/gi, "third-party")
    .replace(/\bURLS\b/g, "URLs").replace(/\b1 review signals\b/g, "1 review signal")
    .replace(/\s+;/g, ";").replace(/Sccs Assumed Unverified/gi, "SCCs assumed, not verified")
    .replace(/\bredirected_to_https\b/g, "redirected to HTTPS").replace(/\bperiodic_cookie_snapshot\b/g, "periodic cookie snapshot")
    .replace(/\bcross_site_tracking\b/g, "cross-site tracking");
}
