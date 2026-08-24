import { consentControlAssessmentSchema } from "@certscore/contracts";
import {
  buildRuntimeInventoryProjectionFromScan,
  classifyInventoryEvidence,
  deriveRuntimeInventoryPresentationState,
} from "../../lib/scans/runtime-inventory-projection";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";

export const CANONICAL_REPORT_EXPORT_VERSION = "canonical-report-export-v2" as const;
const MAX_APPENDIX_INVENTORY_ROWS = 500;
const MAX_APPENDIX_ARRAY_ITEMS = 50;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function consentAssessment(scanRecord: ScanDetailResponse) {
  const runtime = record(scanRecord.runtimeArtifacts);
  const hybrid = record(runtime?.hybridRuntimeEvidence ?? runtime?.hybrid_runtime_evidence);
  for (const candidate of [
    runtime?.consentControlAssessment,
    runtime?.consent_control_assessment,
    hybrid?.consentControlAssessment,
    hybrid?.consent_control_assessment,
  ]) {
    const parsed = consentControlAssessmentSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinCounts(values: Array<{ count: number; label: string }>) {
  const retained = values.filter((value) => value.count > 0)
    .map((value) => countLabel(value.count, value.label));
  if (retained.length === 0) return "no observed gaps or review signals";
  if (retained.length === 1) return retained[0]!;
  return `${retained.slice(0, -1).join(", ")}, and ${retained.at(-1)}`;
}

function findingName(finding: Record<string, unknown>) {
  const presentation = record(finding.presentation);
  for (const value of [presentation?.findingName, finding.title, finding.unifiedFindingId]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "retained finding";
}

function buildExecutiveSummary(input: {
  assessment: ReturnType<typeof consentAssessment>;
  checklistPresentation: NonNullable<ReturnType<typeof getPersistedCanonicalReportProjection>>["checklistPresentation"];
  findings: Array<Record<string, unknown>>;
}) {
  const counts = input.checklistPresentation?.summaryCounts;
  const gapCount = counts?.gap_observed ?? 0;
  const potentialConcernCount = counts?.potential_concern ?? 0;
  const reviewSignalCount = counts?.review_signal ?? 0;
  const technicalLimitationCount = counts?.technical_limitation ?? 0;
  const highPriorityFindings = input.findings.filter((finding) =>
    finding.severity === "high" || finding.severity === "critical"
  );
  const posture = !counts
    ? "evidence limited"
    : highPriorityFindings.length > 0 || gapCount > 0
      ? "elevated review priority"
      : potentialConcernCount > 0 || reviewSignalCount > 0
        ? "targeted review priority"
        : "routine monitoring priority";
  const inScopeCount = input.checklistPresentation?.rows.length ?? 0;
  const reviewCounts = joinCounts([
    { count: gapCount, label: "observed gap" },
    { count: potentialConcernCount, label: "additional potential concern" },
    { count: reviewSignalCount, label: "review signal" },
  ]);
  const sentenceOne = inScopeCount > 0
    ? `The retained evidence indicates ${posture}, with ${reviewCounts} across ${inScopeCount} in-scope GDPR/ePrivacy checklist rows.`
    : `The retained evidence indicates ${posture}; a complete GDPR/ePrivacy checklist presentation was not available for this scan.`;
  const leadFinding = highPriorityFindings[0] ?? input.findings[0];
  const coverageText = input.checklistPresentation?.reviewSummary.coverageText;
  const assessmentText = input.assessment
    ? `first-layer consent-control coverage was ${input.assessment.coverage.status}`
    : "a canonical first-layer consent-control assessment was not retained";
  const sentenceTwo = [
    leadFinding ? `The highest-priority retained finding was ${findingName(leadFinding).toLowerCase()}` : "No unified finding was retained",
    coverageText?.replace(/\.$/, ""),
    assessmentText,
  ].filter(Boolean).join("; ") + ".";
  const sentenceThree = "This is a technical risk-signal summary for review prioritization, not a determination of legal compliance or legal advice.";
  return {
    posture,
    sentences: [sentenceOne, sentenceTwo, sentenceThree],
    counts: {
      gapObserved: gapCount,
      potentialConcern: potentialConcernCount,
      reviewSignal: reviewSignalCount,
      technicalLimitation: technicalLimitationCount,
      highPriorityFindings: highPriorityFindings.length,
      inScopeChecklistRows: inScopeCount,
    },
  };
}

function buildRuntimeAppendix(scanRecord: ScanDetailResponse, normalizedConcerns: Array<Record<string, unknown>>) {
  let projection: ReturnType<typeof buildRuntimeInventoryProjectionFromScan>;
  try {
    projection = buildRuntimeInventoryProjectionFromScan({
      ...scanRecord,
      trackerVendors: Array.isArray(scanRecord.trackerVendors) ? scanRecord.trackerVendors : [],
    });
  } catch {
    return {
      title: "Appendix: Detailed cookie and tracker inventory",
      scopeNote: "Each retained cookie or tracker observation is listed separately. Missing activity means not observed within the bounded scan scope; it does not prove that the activity is absent from every page, session, geography, or consent state.",
      presentationStatus: "insufficient_evidence" as const,
      presentationMessage: "Cookie and tracker inventory was unavailable because the retained runtime projection could not be verified.",
      summary: {
        totalRows: 0,
        includedRows: 0,
        omittedRows: 0,
        cookieRows: 0,
        trackerRows: 0,
        groupedEntities: 0,
        requestEvidenceRows: 0,
        dataFlowRows: 0,
      },
      rows: [],
    };
  }
  const runtimeCoverageLimited = normalizedConcerns.some((concern) => {
    const evidenceBundle = record(concern.evidenceBundle);
    const rawEvidence = record(evidenceBundle?.rawEvidence);
    return concern.originType === "runtime_artifact" &&
      typeof concern.originKey === "string" &&
      concern.originKey.startsWith("scan_quality.runtime_coverage.") &&
      rawEvidence?.runtimeCoverageStatus !== "usable";
  });
  const presentation = deriveRuntimeInventoryPresentationState({
    groupedRowCount: projection.groupedRows.length,
    runtimeCoverageLimited,
    scanCompleted: scanRecord.scan.status === "completed",
  });
  const retainedRows = projection.ungroupedRows.slice(0, MAX_APPENDIX_INVENTORY_ROWS);
  return {
    title: "Appendix: Detailed cookie and tracker inventory",
    scopeNote: "Each retained cookie or tracker observation is listed separately. Missing activity means not observed within the bounded scan scope; it does not prove that the activity is absent from every page, session, geography, or consent state.",
    presentationStatus: presentation.status,
    presentationMessage: presentation.message,
    summary: {
      totalRows: projection.ungroupedRows.length,
      includedRows: retainedRows.length,
      omittedRows: Math.max(0, projection.ungroupedRows.length - retainedRows.length),
      cookieRows: projection.ungroupedRows.filter((row) => row.type === "cookie").length,
      trackerRows: projection.ungroupedRows.filter((row) => row.type === "tracker").length,
      groupedEntities: projection.groupedRows.length,
      requestEvidenceRows: projection.requestRows.length,
      dataFlowRows: projection.dataFlows.length,
    },
    rows: retainedRows.map((row, index) => ({
      rowNumber: index + 1,
      type: row.type,
      vendor: row.vendor,
      purpose: row.purposes.length > 0 ? row.purposes : [row.purpose],
      evidenceClassification: classifyInventoryEvidence(row),
      firstSeenMs: row.firstSeenMs,
      preConsent: row.preConsent,
      cookieNames: row.cookieNames.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
      domains: row.domains.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
      confidence: row.confidence,
      relationship: {
        party: row.party,
        site: row.siteRelationship,
        entity: row.entityRelationship,
      },
      category: row.macroCategory,
      priority: row.priority,
      observedRecordCount: row.observedRecordCount,
      requestCount: row.requestCount,
      setByThirdPartyScript: row.setByThirdPartyScript,
      timingEvidence: row.timingEvidence ?? null,
      attributionSignatures: row.attributionSignatures.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
      regulatoryRelevance: row.regulatoryRelevance.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
      requestDetails: (row.requestDetails ?? []).slice(0, 20).map((request) => ({
        method: request.method,
        hostname: request.hostname,
        path: request.path,
        vendor: request.vendor,
        responseObserved: request.responseObserved,
        responseStorageAttempted: request.responseStorageAttempted,
        cookieNamesSent: request.cookieNamesSent.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
        responseCookieNamesSet: request.responseCookieNamesSet.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
        identifierParameterNames: request.identifierParameterNames.slice(0, MAX_APPENDIX_ARRAY_ITEMS),
        essentiality: request.essentiality,
      })),
      dataFlows: row.dataFlows.slice(0, 20).map((flow) => ({
        endpoint: flow.endpoint,
        idSync: flow.idSync,
        controllingEntity: flow.controllingEntity,
        networkDestination: flow.networkDestination,
        transferMechanism: flow.transferMechanism,
      })),
      cookieDetails: row.cookieDetails.slice(0, 20).map((cookie) => ({
        cookieName: cookie.cookieName,
        category: cookie.category,
        description: cookie.description ?? null,
        domain: cookie.domain,
        path: cookie.cookiePath ?? null,
        expiresAt: cookie.expiresAt ?? null,
        lifespanSeconds: cookie.lifespanSeconds ?? null,
        party: cookie.party,
        essentiality: cookie.essentiality ?? null,
        essentialityConfidence: cookie.essentialityConfidence ?? null,
        essentialityReasonCodes: cookie.essentialityReasonCodes?.slice(0, MAX_APPENDIX_ARRAY_ITEMS) ?? [],
        firstObservedAtMs: cookie.firstObservedAtMs,
        setAtMs: cookie.setAtMs,
        setMethod: cookie.setMethod,
        initiatorDomain: cookie.initiatorDomain,
        initiatorVendor: cookie.initiatorVendor,
        sourceRequestUrl: cookie.sourceRequestUrl,
        setterScriptUrl: cookie.setterScriptUrl ?? null,
        timingEvidence: cookie.timingEvidence,
        evidenceGrade: cookie.evidenceGrade,
      })),
    })),
  };
}

export function buildCanonicalReportExport(scanRecord: ScanDetailResponse) {
  const canonical = getPersistedCanonicalReportProjection(scanRecord);
  if (!canonical) return null;
  const assessment = consentAssessment(scanRecord);
  const findings = canonical.ownerUnifiedFindings as Array<Record<string, unknown>>;
  const normalizedConcerns = canonical.normalizedConcerns as Array<Record<string, unknown>>;

  return {
    artifactType: "certscore_canonical_report_export",
    artifactVersion: CANONICAL_REPORT_EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    scan: {
      id: scanRecord.scan.id,
      domainHostname: scanRecord.scan.domainHostname,
      status: scanRecord.scan.status,
      scanType: scanRecord.scan.scanType,
      scanFrom: scanRecord.scan.scanFromValue,
      createdAt: scanRecord.scan.createdAt,
      startedAt: scanRecord.scan.startedAt,
      completedAt: scanRecord.scan.completedAt,
      durationMs: scanRecord.scan.durationMs,
      pagesRequested: scanRecord.scan.pagesRequested,
      pagesScanned: scanRecord.scan.pagesScanned,
    },
    executiveSummary: buildExecutiveSummary({
      assessment,
      checklistPresentation: canonical.checklistPresentation,
      findings,
    }),
    gdprEprivacyReview: canonical.checklistPresentation
      ? {
          checklistScore: canonical.checklistPresentation.checklistScore,
          reviewSummary: canonical.checklistPresentation.reviewSummary,
          summaryCounts: canonical.checklistPresentation.summaryCounts,
          rows: canonical.checklistPresentation.rows,
        }
      : null,
    projection: {
      artifactVersion: canonical.artifactVersion,
      normalizedConcerns: canonical.normalizedConcerns,
      unifiedFindings: canonical.ownerUnifiedFindings,
      topFindingIds: canonical.topFindingIds,
      checklist: canonical.checklistRows,
      checklistPresentation: canonical.checklistPresentation ?? null,
      evidenceIndex: canonical.evidenceIndex ?? null,
      scoreAssessmentInput: canonical.legacyScoreAssessmentInput,
    },
    consentControlAssessment: assessment,
    limitations: [
      {
        code: "pre_interaction_observation_only",
        detail: "The scan did not click Accept, Reject, Options, Save, or other consent controls.",
      },
      {
        code: "post_choice_effectiveness_not_tested",
        detail: "Post-choice blocking, withdrawal, and consent-control effectiveness were not tested.",
      },
      ...(assessment?.limitations ?? []).map((limitation) => ({
        code: limitation.code,
        detail: limitation.detail,
        affectedFields: limitation.affectedFields,
      })),
    ],
    appendix: {
      cookieAndTrackerInventory: buildRuntimeAppendix(scanRecord, normalizedConcerns),
    },
    notice: "CertScore reports observed risk signals and retained evidence. It is not a legal certification, a determination of compliance, or legal advice.",
  };
}

export type CanonicalReportExport = NonNullable<ReturnType<typeof buildCanonicalReportExport>>;
