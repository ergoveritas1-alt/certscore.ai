import {
  isScanNoGoSnapshotOutcome,
  resolveScanNoGoPresentation,
  type ScanNoGoLimitationKind,
} from "@website-signal-risk-scanner/shared";

type JsonRecord = Record<string, unknown> | null | undefined;

export type AdminNoGoProjection = {
  isNoGo: boolean;
  limitationKind: ScanNoGoLimitationKind | null;
  reason: string | null;
  source: "snapshot" | "response" | "runtime_assessment" | "visual_review" | "access_posture" | "blocked" | "captcha" | null;
};

export type AdminNoGoProjectionInput = {
  accessPostureClass?: string | null;
  blockedFlag?: boolean | null;
  captchaFlag?: boolean | null;
  responseDisposition?: string | null;
  runtimeAssessment?: JsonRecord;
  snapshotRuntimeAssessment?: JsonRecord;
  snapshotOutcome?: string | null;
  snapshotStopReasonCode?: string | null;
  visualAccessReview?: JsonRecord;
  snapshotVisualAccessReview?: JsonRecord;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(value: unknown) {
  return Array.isArray(value)
    ? value.find((entry): entry is string => typeof entry === "string" && entry !== "scan_no_go_corroborated") ?? null
    : null;
}

export function projectAdminNoGo(input: AdminNoGoProjectionInput): AdminNoGoProjection {
  const persistedNoGoReason = isScanNoGoSnapshotOutcome(input.snapshotOutcome)
    ? input.snapshotOutcome
    : isScanNoGoSnapshotOutcome(input.snapshotStopReasonCode)
      ? input.snapshotStopReasonCode
      : null;
  if (persistedNoGoReason) {
    const presentation = resolveScanNoGoPresentation(persistedNoGoReason);
    return {
      isNoGo: true,
      limitationKind: persistedNoGoReason === "no_go"
        ? null
        : presentation.limitationKind,
      reason: persistedNoGoReason === "no_go" ? "No-go" : presentation.customerTitle,
      source: "snapshot",
    };
  }
  if (input.responseDisposition === "no_go") {
    return { isNoGo: true, limitationKind: null, reason: "API result disposition", source: "response" };
  }

  const assessments = [record(input.runtimeAssessment), record(input.snapshotRuntimeAssessment)];
  const assessment = assessments.find((candidate) => stringValue(candidate?.decision ?? candidate?.scan_no_go_decision) === "no_go");
  if (assessment) {
    const reasonCodes = assessment?.reasonCodes ?? assessment?.reason_codes;
    const reason = firstString(reasonCodes);
    return {
      isNoGo: true,
      limitationKind: reason ? resolveScanNoGoPresentation(reason).limitationKind : null,
      reason: reason ?? "Runtime no-go assessment",
      source: "runtime_assessment"
    };
  }

  const visualReviews = [record(input.visualAccessReview), record(input.snapshotVisualAccessReview)];
  const visualReview = visualReviews.find((candidate) => {
    const decision = stringValue(candidate?.goNoGo ?? candidate?.go_no_go)?.toUpperCase();
    return decision === "NO_GO";
  });
  const visualDecision = stringValue(visualReview?.goNoGo ?? visualReview?.go_no_go)?.toUpperCase();
  if (visualDecision === "NO_GO") {
    return {
      isNoGo: true,
      limitationKind: resolveScanNoGoPresentation(
        stringValue(visualReview?.reasonCode ?? visualReview?.reason_code),
        stringValue(visualReview?.pageState ?? visualReview?.page_state),
      ).limitationKind,
      reason: stringValue(visualReview?.reasonCode ?? visualReview?.reason_code) ?? "Visual access review",
      source: "visual_review"
    };
  }
  if (input.accessPostureClass === "early_loss") {
    return { isNoGo: true, limitationKind: null, reason: "Early access loss", source: "access_posture" };
  }
  if (input.captchaFlag) {
    return { isNoGo: true, limitationKind: "scanner_access_limitation", reason: "CAPTCHA or challenge", source: "captcha" };
  }
  if (input.blockedFlag) {
    return { isNoGo: true, limitationKind: "scanner_access_limitation", reason: "Access blocked", source: "blocked" };
  }
  return { isNoGo: false, limitationKind: null, reason: null, source: null };
}

export function adminNoGoSql(input: {
  accessPosture: string;
  blockedFlag: string;
  captchaFlag: string;
  responseSummary?: string;
  runtimeArtifacts: string;
  snapshotRuntimeAssessment?: string;
  snapshotOutcome: string;
  snapshotStopReasonCode?: string;
  snapshotVisualAccessReview?: string;
  outcomesParameter?: string;
}) {
  const responseDisposition = input.responseSummary
    ? `or ${input.responseSummary} ->> 'resultDisposition' = 'no_go'`
    : "";
  return `(
    ${input.snapshotOutcome} = any(${input.outcomesParameter ?? "$5"}::text[])
    ${input.snapshotStopReasonCode ? `or ${input.snapshotStopReasonCode} = any(${input.outcomesParameter ?? "$5"}::text[])` : ""}
    ${responseDisposition}
    or coalesce(${input.runtimeArtifacts}.scan_no_go_assessment ->> 'decision', ${input.runtimeArtifacts}.scan_no_go_assessment ->> 'scan_no_go_decision') = 'no_go'
    ${input.snapshotRuntimeAssessment ? `or coalesce(${input.snapshotRuntimeAssessment} ->> 'decision', ${input.snapshotRuntimeAssessment} ->> 'scan_no_go_decision') = 'no_go'` : ""}
    or upper(coalesce(${input.runtimeArtifacts}.visual_access_review ->> 'goNoGo', ${input.runtimeArtifacts}.visual_access_review ->> 'go_no_go', '')) = 'NO_GO'
    ${input.snapshotVisualAccessReview ? `or upper(coalesce(${input.snapshotVisualAccessReview} ->> 'goNoGo', ${input.snapshotVisualAccessReview} ->> 'go_no_go', '')) = 'NO_GO'` : ""}
    or ${input.accessPosture} = 'early_loss'
    or coalesce(${input.blockedFlag}, false)
    or coalesce(${input.captchaFlag}, false)
  )`;
}
