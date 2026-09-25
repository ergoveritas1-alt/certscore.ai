import { z } from "zod";
import { apiV2GpcResponseSchema, privacyAuditEvidenceSchema } from "@certscore/api-contracts";

// Offline review only. Do not import this module into report or scoring paths.
const exportEnvelope = z.object({
  artifactType: z.literal("certscore_canonical_report_export"),
  artifactVersion: z.literal("canonical-report-export-v6"),
  generatedAt: z.string().datetime(),
  scan: z.object({
    id: z.string().min(1),
    status: z.literal("completed"),
    scanFrom: z.string().min(1).nullable(),
  }),
  privacyAuditEvidence: z.unknown(),
  gpcResponse: z.unknown(),
});

type Check = {
  status: "observed" | "limited" | "not_assessed";
  reason: string;
  evidenceRefs: string[];
};

/** Summarize already-exported evidence; never create findings or calculate a score. */
export function reviewCcpaScoring(input: unknown) {
  const report = exportEnvelope.parse(input);
  const parsedPrivacy = privacyAuditEvidenceSchema.safeParse(report.privacyAuditEvidence);
  const privacy = parsedPrivacy.success && parsedPrivacy.data.scanId === report.scan.id
    ? parsedPrivacy.data : null;
  const parsedGpc = apiV2GpcResponseSchema.safeParse(report.gpcResponse);
  const gpc = parsedGpc.success ? parsedGpc.data : null;
  const modernGpc = gpc?.contractVersion === "certscore.gpc-response-assessment.v2" ||
    gpc?.contractVersion === "certscore.gpc-response-assessment.v3";
  const determinateGpc = modernGpc && gpc.status !== "indeterminate";
  const choices = privacy?.controls.filter(control => control.kind !== "cookie_settings") ?? [];
  const notices = privacy?.notices.filter(notice => notice.passages.length > 0) ?? [];
  const noticeLimited = !notices.length || privacy?.truncated ||
    privacy?.notices.some(notice => notice.coverage === "partial");

  const checks: Record<"gpc_response" | "sale_share_choice_surface" |
    "sale_share_opt_out_effectiveness" | "notice_evidence", Check> = {
    gpc_response: {
      status: determinateGpc ? "observed" : "limited",
      reason: !gpc ? "Valid exported GPC evidence is unavailable."
        : !modernGpc ? "Historical GPC result retained; current delivery and comparison coverage are not established."
        : !determinateGpc ? "GPC comparison is indeterminate. Observation completion does not establish a response."
        : `Retained comparison: ${gpc.status}. This does not establish vendor-specific GPC honoring.`,
      evidenceRefs: gpc ? [gpc.evidenceUrl] : [],
    },
    sale_share_choice_surface: {
      status: choices.length ? "observed" : "limited",
      reason: choices.length
        ? "A Do Not Sell/Share or Your Privacy Choices surface was observed; execution was not tested."
        : "No verified sale/share choice surface is retained. Absence is unproven; Cookie Settings alone does not satisfy this check.",
      evidenceRefs: choices.map(control => control.evidenceRef),
    },
    sale_share_opt_out_effectiveness: {
      status: "not_assessed",
      reason: "Sale/share opt-out execution is not assessed. Cookie Accept/Reject results cannot substitute for it.",
      evidenceRefs: [],
    },
    notice_evidence: {
      status: noticeLimited ? "limited" : "observed",
      reason: !notices.length ? "Usable notice topic passages are unavailable; notice absence is unproven."
        : noticeLimited ? "Notice topic passages are retained with partial or truncated coverage. Adequacy and placement at collection remain unassessed."
        : "Notice topic passages are retained. Topic presence does not establish notice adequacy or placement at collection.",
      evidenceRefs: notices.map(notice => notice.evidenceRef),
    },
  };

  return {
    contractVersion: "certscore.ccpa-scoring-review.v1" as const,
    internalOnly: true as const,
    productionProjectable: false as const,
    score: null,
    source: {
      artifactVersion: report.artifactVersion,
      generatedAt: report.generatedAt,
      scanId: report.scan.id,
      scanFrom: report.scan.scanFrom,
      privacySourceHash: privacy?.sourceHash ?? null,
      privacyCapturedAt: privacy?.capturedAt ?? null,
      gpcContractVersion: gpc?.contractVersion ?? null,
      gpcBaselineHash: gpc?.comparison.baselineArtifact?.sha256 ?? null,
      gpcSourceHash: gpc?.comparison.gpcArtifact?.sha256 ?? null,
    },
    scope: "Retained starting-page evidence at the recorded scan origin. This review does not test another geography or verify source bytes again.",
    checks,
    gpcOutcome: gpc?.status ?? null,
    // Copied for review only: never applied again or treated as a standalone score.
    existingGpcPolicy: gpc?.californiaPolicy ?? null,
    noticeTopics: [...new Set(notices.flatMap(notice => notice.passages.map(passage => passage.topic)))],
    coverageLimitations: [
      ...(!privacy ? ["Privacy evidence is missing, malformed or belongs to another scan."] : []),
      ...(privacy?.truncated ? ["Privacy workpaper is truncated."] : []),
      ...(gpc?.comparison.limitationKeys ?? []),
    ],
    scoreReadiness: "not_ready" as const,
    blockers: [
      "A standalone CCPA/CPRA rubric and weights have not been approved or calibrated.",
      "Sale/share opt-out effectiveness is not assessed.",
      "Notice adequacy and placement at collection are not assessed.",
    ],
  };
}
