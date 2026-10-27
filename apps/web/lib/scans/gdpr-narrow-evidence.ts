import { GDPR_NARROW_KINDS, GDPR_NARROW_RULES, readGdprNarrowPosture, isActiveGdprNarrowKind, type GdprNarrowKind, type GdprNarrowIssue } from "@certscore/contracts";

export { GDPR_NARROW_KINDS, GDPR_NARROW_RULES };
export function readBoundGdprNarrow(value: Record<string, unknown> | null | undefined) {
  const assessment = readGdprNarrowPosture(value?.gdprNarrowPosture);
  const source = value?.gdprNarrowPostureSource as Record<string, unknown> | undefined;
  return assessment && source?.verificationStatus === "verified" && source.sha256 === assessment.sourceBundleSha256 &&
    source.scanId === assessment.scanId && source.targetUrl === assessment.targetUrl ? assessment : null;
}
export function narrowKindForRow(rowId: string): GdprNarrowKind | undefined {
  return GDPR_NARROW_KINDS.find(kind => GDPR_NARROW_RULES[kind].rowId === rowId);
}
export const GDPR_NARROW_REMEDIATION: Record<GdprNarrowKind, string> = {
  optional_defaults: "Leave optional cookie purposes unselected until the visitor makes an affirmative choice.",
  implied_consent: "Remove wording that treats ordinary browsing as consent and request a clear affirmative choice for optional cookies.",
  legal_basis: "Explain the legal basis for each relevant personal-data processing purpose in the governing notice.",
  retention: "State the applicable personal-data storage periods or substantive criteria used to determine them.",
  complaint: "Explain the right to lodge a complaint with a supervisory authority in the applicable privacy notice.",
};
/** Customer copy states the factual scoped conclusion. Internal reviewer
 * rationale is not report copy and may contain diagnostic/scoring language. */
export function gdprNarrowSummary(issue: GdprNarrowIssue) {
  if (issue.kind === "optional_defaults") return `Optional cookie purposes were selected before an interaction: ${issue.optionalLabels?.join(", ")}.`;
  if (issue.kind === "implied_consent") return "The retained first-layer request presented continuing to browse as consent to cookies used for advertising or marketing.";
  if (issue.kind === "legal_basis") return "The reviewed governing privacy notice did not state a legal-basis explanation for the described personal-data processing.";
  if (issue.kind === "retention") return "The reviewed governing privacy notice did not state personal-data storage periods or substantive criteria for determining them.";
  return "The reviewed governing privacy notice did not state the right to lodge a complaint with a supervisory authority.";
}
export function gdprNarrowCustomerEvidence(retained: Record<string, unknown>) {
  const assessment = readBoundGdprNarrow(retained);
  const { gdprNarrowPosture: _assessment, gdprNarrowPostureSource: _source, ...rest } = retained;
  if (!assessment) return rest;
  const issues = assessment.issues.filter(i => isActiveGdprNarrowKind(i.kind) && i.kind === retained.gdprNarrowKind);
  return { ...rest, reviewedPostureEvidence: issues.map(issue => ({
    finding: GDPR_NARROW_RULES[issue.kind].title, summary: gdprNarrowSummary(issue),
    sourceUrl: issue.sourceUrl, evidenceRef: issue.evidenceRef,
    ...(issue.optionalLabels ? { selectedOptionalPurposes: issue.optionalLabels } : {}),
    ...(issue.kind === "implied_consent" ? { firstLayerText: issue.evidenceText } : {}),
    ...(issue.documents ? { reviewedDocuments: issue.documents.map(d => ({ sourceUrl: d.url, textSha256: d.textSha256 })) } : {}),
  })) };
}
