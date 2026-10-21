import { projectRejectPresenceDetails } from "./reject-presence-details";
import {
  detailedEvidenceReportSchema, publicCmpAuditSchema, publicCmsSecuritySchema,
  type DetailedEvidenceReport, type DetailedEvidenceRow, type DetailedEvidenceSection,
} from "@certscore/api-contracts";
import { cmsSecurityProjectionSchema } from "@certscore/contracts";
import type { ShadowEvidenceRow, ShadowReportData } from "../../components/scans/report-lab/shadow-report-data";
import { californiaPrivacyEvidence } from "./california-privacy-evidence";
import { resolveReportReviewFocus } from "./report-review-focus";
import { detailedEvidenceCopy, policyFindingSummary } from "./detailed-evidence-copy";
import { accessibilityFindingCopy } from "./accessibility-finding-copy";
import { accessibilityRuleTitle } from "./accessibility-report";
import { CMP_AUDIT_CRITERIA, cmpDetailsExperience, cmpDetailsRecap } from "./cmp-audit-projection";
import { cmpCorrectionSteps } from "./cmp-correction-steps";
import { getCorrectionGuidance } from "./checklist-correction-guidance";
import { detailedEvidenceLayout, type SharedEvidenceLink } from "./detailed-evidence-layout";
import { evidenceRowAnchor, HIDDEN_DETAILED_EVIDENCE_ROW_IDS } from "./report-evidence-navigation";
import {
  EVIDENCE_SECTION_TITLES, EVIDENCE_SECTION_ORDER, accessibilityEvidenceRecap, cmsEvidenceRecap, cmsEvidenceVersionLabel,
  evidenceHeaderStatus, evidenceSectionCounts, evidenceSectionRecap,
  CMS_CORRECTION_STEPS, cmsAdvisoryDisplayCopy,
} from "./detailed-evidence-presentation";

/** Read-only presentation over the same report model as the website. Never creates findings or changes assessments. */
export function buildDetailedEvidenceExport(report: ShadowReportData) {
  const layout = detailedEvidenceLayout(report);
  const privacy = californiaPrivacyEvidence(report.privacyAuditEvidence, report.scan.id);
  const sourceRows = [...report.consentRows, ...report.gdprTransparencyRows, ...report.preConsentRuntimeRows, ...report.trackingExternalRows];
  const audit = report.cmpAudit?.scanId === report.scan.id ? report.cmpAudit : undefined;
  const experience = cmpDetailsExperience(audit, report.consentVendor);
  const cmpAudit = publicCmpAuditSchema.parse({
    version: audit?.version ?? "cmp_audit_report.v1", limitationGroups: audit?.limitationGroups, scanId: report.scan.id, scope: "starting_page",
    assessmentSourceHash: audit?.assessmentSourceHash ?? null,
    inspectionSupport: audit?.inspectionSupport,
    experience,
    rows: (audit?.rows ?? CMP_AUDIT_CRITERIA.map(criterion => ({ ...criterion, status: "Not assessed", sourceIds: [] }))).map(row => ({
      id: row.id, label: row.label, status: row.status, limitation: "limitation" in row ? row.limitation : undefined, detail: "detail" in row ? row.detail : undefined,
      sourceIds: row.sourceIds, evidenceAnchor: "evidenceAnchor" in row ? row.evidenceAnchor : undefined,
      supportingEvidence: "supportingEvidence" in row ? row.supportingEvidence : undefined,
    })),
  });
  const cmsParsed = cmsSecurityProjectionSchema.safeParse(report.cmsSecurity);
  const cms = cmsParsed.success && cmsParsed.data.scanId === report.scan.id ? cmsParsed.data : null;
  const cmsSecurity = cms ? publicCmsSecuritySchema.parse({
    version: "certscore.cms-report.v1", scanId: cms.scanId, assessmentContractVersion: cms.contractVersion,
    sourceHash: cms.sourceHash, capturedAt: cms.capturedAt, documentUrl: cms.documentUrl, evidenceRef: cms.evidenceRef,
    catalogueVersion: cms.assessment.catalogueVersion, catalogueReviewedAt: cms.assessment.catalogueReviewedAt,
    detections: cms.assessment.detections.map(row => ({
      evidenceRef: row.evidenceRef, product: row.product, name: row.name, version: row.version,
      versionLabel: cmsEvidenceVersionLabel(row), versionStatus: row.versionStatus, versionBasis: row.versionBasis,
      confidence: row.confidence, observedVersions: row.observedVersions, informationalOnly: row.informationalOnly,
      evidenceRefs: row.evidenceRefs,
      branchVersion: row.branchVersion, versionGranularity: row.versionGranularity, runtimeVersionConfirmed: row.runtimeVersionConfirmed,
    })),
    advisories: cms.assessment.matches.map(row => ({
      evidenceRef: row.evidenceRef, detectionRef: row.detectionRef, observedVersion: row.observedVersion,
      confidence: row.confidence, kind: row.record.kind, title: row.record.title, sourceUrl: row.record.sourceUrl,
      fixedVersions: row.record.fixedVersions ?? [], matchedRange: row.matchedRange,
      advisoryId: row.record.id, qualification: row.record.qualification, severity: row.record.severity,
    })),
    plugins: cms.pluginInventory?.detections ?? [],
    identification: cms.signals.map(({ evidenceRef, kind, value, sourceUrl, artifactRef }) => ({ evidenceRef, kind, value, sourceUrl, artifactRef })),
  }) : null;

  function rowDisplay(row: ShadowEvidenceRow, field: string, sharedEvidence?: SharedEvidenceLink, policy = false): DetailedEvidenceRow {
    const summary = policy ? policyFindingSummary({ ...row, hasSupportingEvidence: Boolean(row.policyEvidence?.sections.length) }) : row.summary;
    const copy = detailedEvidenceCopy({ ...row, id: evidenceRowAnchor(row.id), summary });
    const observations=projectRejectPresenceDetails(row.evidenceJson);
    return {
      id: row.id, title: copy.title, summary: copy.summary ?? null, status: row.status, displayStatus: row.status,
      ...(observations.length?{afterRejectObservations:observations}:{}),
      correctionSteps: row.canonicalEvidenceJson ? getCorrectionGuidance(row.canonicalEvidenceJson).steps : row.correctionSteps.filter(step => step.trim().length > 0), evidenceRefs: row.evidenceRefs ?? [], evidenceTarget: evidenceRowAnchor(row.id),
      source: { field, rowId: row.id }, ...(sharedEvidence ? { sharedEvidence } : {}),
    };
  }
  function section(id: DetailedEvidenceSection["id"], rows: readonly ShadowEvidenceRow[], field: string,
    shared: Record<string, SharedEvidenceLink> = {}, policy = false): DetailedEvidenceSection {
    const assessed = rows.filter(row => !HIDDEN_DETAILED_EVIDENCE_ROW_IDS.includes(row.id));
    const visible = assessed.filter(row => shared[row.id]?.showLink !== false);
    return { id, title: EVIDENCE_SECTION_TITLES[id], recap: evidenceSectionRecap(assessed),
      displayStatus: evidenceHeaderStatus(assessed)?.label ?? null,
      counts: evidenceSectionCounts(assessed), rows: visible.map(row => rowDisplay(row, field, shared[row.id], policy)) };
  }
  const cmpRows = cmpAudit.rows.map(row => {
    const source = sourceRows.find(item => row.sourceIds.includes(item.id) || evidenceRowAnchor(item.id) === row.evidenceAnchor);
    const copy = detailedEvidenceCopy({ id: `cmp-criterion-${row.id}`, title: row.label, summary: row.detail, status: row.status });
    return { id: row.id, title: copy.title, summary: copy.summary ?? null, status: row.status,
      displayStatus: row.status === "Review recommended" ? "Review" : row.status,
      correctionSteps: source?.canonicalEvidenceJson ? getCorrectionGuidance(source.canonicalEvidenceJson).steps : source?.correctionSteps ?? cmpCorrectionSteps(row), evidenceRefs: source?.evidenceRefs ?? row.sourceIds,
      evidenceTarget: `cmp-criterion-${row.id}`, source: { field: "cmpAudit.rows", rowId: row.id },
      ...(layout.cmpLinks[row.id] ? { sharedEvidence: layout.cmpLinks[row.id] } : {}),
    };
  });
  const sections: DetailedEvidenceSection[] = [{
    id: "cmp", title: experience.title, recap: cmpDetailsRecap(experience, evidenceSectionRecap(cmpAudit.rows)),
    displayStatus: experience.mode === "capture_limited" ? "Limited" : evidenceHeaderStatus(experience.mode === "cmp_details"
      ? cmpAudit.rows : cmpAudit.rows.filter(row => experience.defaultCriterionIds.includes(row.id) && row.status === "Review recommended"))?.label ?? null,
    counts: evidenceSectionCounts(cmpAudit.rows), rows: cmpRows,
  }];
  const consent = section("consent", layout.consentRows, "consentRows", layout.consentLinks);
  // Visibility counts follow the existing reportability projection; action registration is separate.
  consent.recap = report.consentControlsAvailable !== false
    ? `${Object.values(report.controls).filter(value => value === "Observed").length} of 3 controls observed` : "Control evidence unavailable";
  sections.push(consent, section("tracking", report.trackingExternalRows, "trackingExternalRows"),
    section("policy", layout.policyRows, "gdprTransparencyRows", {}, true),
    section("runtime", report.preConsentRuntimeRows, "preConsentRuntimeRows"),
    section("transport", report.transportRows, "transportRows"));
  if (resolveReportReviewFocus(report.reviewFocus, report.scan.originCode) === "ccpa_cpra") sections.push(privacy.section);
  // Cookie disclosures are displayed in Policies but retain their canonical consent-row identity.
  const policy = sections.find(item => item.id === "policy")!;
  for (const row of policy.rows) if (layout.cookieRows.some(cookie => cookie.id === row.id)) row.source.field = "consentRows";
  if (report.accessibilityAudit) {
    const a = report.accessibilityAudit;
    const issues = a.failedRuleCount ?? 0, review = a.reviewRuleCount ?? 0;
    const rows = [
      ...(report.accessibilityEvidence?.violations ?? []).map(rule => ({ rule, manual: false, field: "accessibilityEvidence.violations" })),
      ...(report.accessibilityEvidence?.reviewItems ?? []).map(rule => ({ rule, manual: true, field: "accessibilityEvidence.reviewItems" })),
    ].map(({ rule, manual, field }) => ({
      id: rule.ruleId, title: accessibilityRuleTitle(rule), summary: `${rule.nodeCount} ${rule.nodeCount === 1 ? "element" : "elements"}${manual ? " to review" : " affected"}`,
      status: manual ? "Review" : "Issues found", displayStatus: manual ? "Review" : "Issues found",
      description: accessibilityFindingCopy(rule, manual).description,
      correctionSteps: [accessibilityFindingCopy(rule, manual).correction], evidenceRefs: [rule.ruleId],
      evidenceTarget: "accessibility-evidence", source: { field, rowId: rule.ruleId },
    }));
    sections.push({ id: "accessibility", title: EVIDENCE_SECTION_TITLES.accessibility, recap: accessibilityEvidenceRecap(a, report.accessibilityEvidence?.limitations),
      displayStatus: issues || review ? "Review" : a.status !== "completed" ? "Limited" : null,
      counts: { checks: issues + review, review: issues + review, limited: 0, observed: 0, unsupported: 0 }, rows });
  }

  if (cms && cmsSecurity && (cms.assessment.detections.length || cmsSecurity.plugins.length)) sections.push({
    id: "cms", title: EVIDENCE_SECTION_TITLES.cms, recap: cmsEvidenceRecap(cms.assessment.detections, cmsSecurity.plugins.length),
    displayStatus: cms.assessment.matches.length ? "Review" : null,
    counts: { checks: cms.assessment.detections.length, review: new Set(cms.assessment.matches.map(row => row.detectionRef)).size, limited: 0, observed: cms.assessment.detections.length, unsupported: 0 },
    rows: cmsSecurity.advisories.map(row => {
      const detection = cmsSecurity.detections.find(detection => detection.evidenceRef === row.detectionRef);
      return { id: row.evidenceRef, ...cmsAdvisoryDisplayCopy(detection?.name ?? "CMS", detection?.versionLabel ?? row.observedVersion, row.kind),
        status: "Warning", displayStatus: "Review", correctionSteps: CMS_CORRECTION_STEPS,
        evidenceRefs: [row.evidenceRef, row.detectionRef], evidenceTarget: row.evidenceRef, source: { field: "cmsSecurity.advisories", rowId: row.evidenceRef } };
    }),
  });
  const detailedEvidence: DetailedEvidenceReport = detailedEvidenceReportSchema.parse({
    version: "certscore.detailed-evidence.v1", scanId: report.scan.id, sections: sections.sort((a, b) => EVIDENCE_SECTION_ORDER.indexOf(a.id) - EVIDENCE_SECTION_ORDER.indexOf(b.id)),
    interpretation: "Section recaps and display labels describe existing report assessments. Audit rows are not additional findings. Source fields retain evidence and provenance; findings and score remain authoritative. Missing evidence does not establish absence.",
  });
  return { detailedEvidence, cmpAudit, cmsSecurity, privacyAuditEvidence: privacy.evidence };
}
