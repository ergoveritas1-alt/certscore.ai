import { cmsSecurityProjectionSchema, formDestinationProjectionSchema, postRefusalReportProjectionSchema, type ConsentControlAssessment } from "@certscore/contracts";
import { getCorrectionGuidance } from "../../lib/scans/checklist-correction-guidance";
import { projectCmpAudit } from "../../lib/scans/cmp-audit-projection";
import { retainedConsentVendor } from "../../lib/scans/retained-consent-vendor";
import { hydrateChecklistPolicyEvidence } from "../../lib/scans/checklist-evidence-index";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { PersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import { pdfTopicForRow } from "./report-pdf-topics";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const scalar = (value: unknown) => typeof value === "string" ? value : typeof value === "boolean" ? value ? "Yes" : "No" : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

/** Public details selected from the persisted concern-policy/checklist output, never raw browser signals. */
export function buildReportAppendixEvidence(scan: ScanDetailResponse, canonical: PersistedCanonicalReportProjection, assessment: ConsentControlAssessment | null) {
  const vendor = retainedConsentVendor(scan);
  const cmpAudit = projectCmpAudit({ scanId: scan.scan.id, consentVendor: vendor, consentControlAssessment: assessment,
    checklistRows: canonical.checklistRows, unifiedFindings: canonical.ownerUnifiedFindings, normalizedConcerns: canonical.normalizedConcerns });
  const cms = cmsSecurityProjectionSchema.safeParse(scan.runtimeArtifacts?.cmsSecurity);
  const forms = formDestinationProjectionSchema.safeParse(scan.runtimeArtifacts?.formDestinations);
  const refusal = postRefusalReportProjectionSchema.safeParse(scan.runtimeArtifacts?.postRefusalEvidenceProjection);
  const canonicalRefusal = object(canonical.checklistRows.find(row => row.id === "post_reject_tracking_reduction")?.criticalEvidence?.retainedEvidence);
  const sourceHash = object(canonicalRefusal.afterRejectScoringAssessment).sourcePacketSha256;
  const refusalProjection = refusal.success && refusal.data.packetSha256 && refusal.data.packetSha256 === sourceHash && assessment?.scan.scanId === scan.scan.id ? refusal.data : null;
  const eligibleRequestIds = refusalProjection?.postRefusalActivity.filter(row => row.activityType === "network_request").map(row => row.requestId).filter((id): id is string => Boolean(id)) ?? [];
  const eligibleRequests = refusalProjection?.scoringEvidence?.requests.filter(request => eligibleRequestIds.includes(request.requestId)) ?? [];
  const rejectTiming = refusalProjection ? { inFlightExclusionVerified: eligibleRequestIds.length > 0 && eligibleRequests.length === new Set(eligibleRequestIds).size &&
    eligibleRequests.every(request => !request.inFlightAtRefusalRegistration && typeof request.msOffsetFromRefusal === "number" && request.msOffsetFromRefusal >= 0),
    windowMs: refusalProjection.observationWindowMs,
    networkRequestCount: refusalProjection.postRefusalActivity.filter(row => row.activityType === "network_request").length,
    storageWriteCount: refusalProjection.postRefusalActivity.filter(row => row.activityType === "storage_write").length,
    networkRequests: eligibleRequests.filter(request => !request.inFlightAtRefusalRegistration && typeof request.msOffsetFromRefusal === "number" && request.msOffsetFromRefusal >= 0)
      .map(request => ({ url: request.sanitizedUrl, vendor: request.vendor ?? null, millisecondsAfterConfirmation: request.msOffsetFromRefusal! })),
    registrationTimeIsUpperBound: refusalProjection.limitations.includes("registration_timestamp_is_observation_upper_bound"),
  } : null;
  const checklistDetails = hydrateChecklistPolicyEvidence(canonical.checklistRows, canonical.evidenceIndex).map(row => {
    const retained = object(row.criticalEvidence?.retainedEvidence);
    const facts: Array<{ label: string; value: string }> = [];
    const add = (label: string, value: unknown) => { const text = scalar(value); if (text !== null && text !== "") facts.push({ label, value: text }); };
    if (row.id.startsWith("transport_security_")) {
      const fields = row.id === "transport_security_tls_certificate"
        ? ["tlsProbeAttempted", "validTlsCertificate", "tlsProbeErrorCategory", "tlsProbeErrorMessage"]
        : row.id === "transport_security_form_transport"
          ? ["formTransportCount", "formInventoryState", "insecureFormTransportObserved"]
          : row.id === "transport_security_https_delivery" ? ["finalUrl", "finalScheme", "pageHttpsObserved"]
            : row.id === "transport_security_http_redirect" ? ["httpProbeAttempted", "httpProbeStatus", "httpProbeFinalScheme", "httpProbeFinalUrl", "httpProbeOutcome", "httpRedirectsToHttps", "httpProbeErrorCategory", "httpProbeErrorMessage"]
              : ["mixedContentObserved", "mixedContentObservedCount"];
      for (const key of fields) add(key, retained[key]);
      const arrays = row.id === "transport_security_tls_certificate" ? ["tlsCertificateObservations"]
        : row.id === "transport_security_form_transport" ? ["insecureFormTransports"]
          : row.id === "transport_security_http_redirect" ? ["httpProbeRedirectChain"]
            : row.id === "transport_security_mixed_content" ? ["mixedContentSamples"] : ["sampledPageUrls"];
      for (const key of arrays) for (const [index, value] of (Array.isArray(retained[key]) ? retained[key] as unknown[] : []).entries()) {
        if (scalar(value) !== null) add(`${key} ${index + 1}`, value);
        else for (const field of ["inputUrl", "subject", "issuer", "validFrom", "validTo", "validCertificate", "chainCertificateCount", "url", "pageUrl", "hostname", "resourceType", "disposition", "evidenceSource", "formId", "method", "actionUrl", "actionScheme", "insecureTransportObserved"])
          add(`${key} ${index + 1} / ${field}`, object(value)[field]);
      }
    }
    for (const key of ["smokingGunEvidence", "runtimeCookieEvidenceRows", "runtimeVendorDisclosureRows"]) {
      for (const [index, item] of (Array.isArray(retained[key]) ? retained[key] as unknown[] : []).entries()) {
        const evidence = object(item);
        for (const field of ["cookieName", "name", "vendor", "hostname", "host", "domain", "path", "cookiePath", "pageUrl", "sourceUrl", "url", "category", "purpose", "activityType", "observedAtMs", "firstSeenMs", "msAfterReject", "preConsent", "secure", "httpOnly", "sameSite", "evidenceRef"])
          add(`${key} ${index + 1} / ${field}`, evidence[field]);
      }
    }
    for (const key of ["rowSpecificSectionEvidence", "article13Signal", "article_13_signal"]) {
      const source = object(retained[key]);
      for (const field of ["evidenceText", "evidence_text", "excerpt", "selectedPolicySectionExcerpt", "sourceUrl", "documentUrl", "policyUrl", "selectedPolicySectionUrl", "surfaceUrl", "sectionHeading", "selectedPolicySectionHeading", "evidenceRef", "sourceHash"])
        add(field, source[field]);
    }
    const provenance = object(retained.policyEvidenceProvenance);
    for (const field of ["contractVersion", "sourceUrl", "capturedAt", "sourceHash", "contentSha256", "documentOwnerEntity", "documentTitle", "documentHeading", "policyTitle", "sectionHeading", "detectedLanguage", "ownershipStatus", "ownershipConfidence", "effectiveDate", "lastUpdatedText", "retrievalTimestamp", "targetRelationship", "directlyLinkedFromScannedPage", "translationApplied", "translationTargetLanguage", "discoveryMethod"])
      add(`Policy provenance / ${field}`, provenance[field]);
    if (Array.isArray(provenance.artifactRefs)) add("Policy provenance / artifacts", strings(provenance.artifactRefs).join(", "));
    for (const field of ["selectedPolicySectionHeading", "selectedPolicySectionExcerpt", "candidatePolicyExcerpt"]) add(field, retained[field]);
    return { id: row.id, topic: pdfTopicForRow(row.id), label: row.label, status: row.status,
      explanation: row.explanation, note: row.note, correctionSteps: getCorrectionGuidance(JSON.stringify({ checklistItemId: row.id, status: row.status, assessmentStatus: row.assessmentStatus, evidenceState: row.evidenceState, coverageArea: row.label, retainedEvidence: retained })).steps, evidenceRefs: strings(row.evidenceRefs), facts,
      subchecks: (row.subchecks ?? []).map(check => ({ id: check.id, label: check.label, status: check.status, note: check.note, evidenceRefs: strings(check.evidenceRefs) })) };
  });
  return { cmp: { provider: vendor, audit: cmpAudit }, checklistDetails, ...(rejectTiming ? { rejectTiming } : {}),
    cmsSecurity: cms.success && cms.data.scanId === scan.scan.id ? cms.data : null,
    formDestinations: forms.success && forms.data.scanId === scan.scan.id ? forms.data : null };
}
