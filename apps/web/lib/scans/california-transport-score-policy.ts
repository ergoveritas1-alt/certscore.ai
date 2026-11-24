import {
  CALIFORNIA_TRANSPORT_FINDING_ID, californiaTransportProjectionSchema,
  type CaliforniaTransportProjection,
} from "@certscore/contracts";
import type { NormalizedConcernScoreEffect } from "./normalized-concerns";
import { SCORING_FAMILIES, SCORING_RULE_BY_ID } from "./scoring-policy";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export const CALIFORNIA_TRANSPORT_SCORE_VERSION = "california-regulatory-posture.v28-transport";
const policyKey = "california.personal_data_transport";
const weight = {
  plaintext_page: SCORING_RULE_BY_ID.get("transport_security_https_delivery")!.points,
  plaintext_form_destination: SCORING_RULE_BY_ID.get("transport_security_form_transport")!.points,
  certificate_validation_failure: SCORING_RULE_BY_ID.get("transport_security_tls_certificate")!.points,
};

export function transportDocumentUrl(value: string | null | undefined) {
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
  url.hash = "";
  url.search = "";
  return url;
}

function transportPoints(issues: CaliforniaTransportProjection["issues"]) {
  const byAuthority = new Map<string, number>();
  for (const issue of issues) {
    const highest = Math.max(...issue.defects.map(defect => weight[defect]));
    byAuthority.set(issue.authority, Math.max(byAuthority.get(issue.authority) ?? 0, highest));
  }
  return Math.min(SCORING_FAMILIES.transport_security.cap, [...byAuthority.values()].reduce((sum, value) => sum + value, 0));
}

export function californiaTransportScoreEffect(raw: unknown): NormalizedConcernScoreEffect[] {
  const parsed = californiaTransportProjectionSchema.safeParse(raw);
  if (!parsed.success) return [];
  const proof = parsed.data;
  return [{ appliesTo: "california_posture", framework: "california", policyVersion: CALIFORNIA_TRANSPORT_SCORE_VERSION,
    policyKey, reasonCode: "verified_personal_data_form_transport", deductionPoints: transportPoints(proof.issues),
    evidenceRefs: [`sha256:${proof.sourceHash}`, "CanonicalEvidenceBundle.json#transportSecurityObservations"],
    observedActivity: proof.issues.map(issue => issue.authority).sort() }];
}

function sameValues(a: readonly string[], b: readonly string[]) {
  const expected = [...b].sort();
  return a.length === b.length && [...a].sort().every((value, i) => value === expected[i]);
}

export function verifiedCaliforniaTransportFinding(finding: UnifiedFindingDisplayPacket) {
  if (finding.unifiedFindingId !== CALIFORNIA_TRANSPORT_FINDING_ID || finding.presentationDecision.status !== "surface" ||
      !finding.surfacingDecision?.reportable || !finding.concernContext?.promotionEligibilities.includes("eligible") ||
      !finding.concernContext?.externalSurfacingEligibilities.includes("eligible") || finding.details?.family !== "california_transport_security") return null;
  const parsed = californiaTransportProjectionSchema.safeParse(finding.details.projection);
  if (!parsed.success) return null;
  const expected = californiaTransportScoreEffect(parsed.data)[0]!;
  return finding.scoreEffects?.some(effect => effect.appliesTo === expected.appliesTo && effect.framework === expected.framework &&
    effect.policyVersion === expected.policyVersion && effect.policyKey === expected.policyKey && effect.reasonCode === expected.reasonCode &&
    effect.deductionPoints === expected.deductionPoints && sameValues(effect.evidenceRefs, expected.evidenceRefs) &&
    sameValues(effect.observedActivity, expected.observedActivity)) ? parsed.data : null;
}

export function californiaTransportDeduction(findings: readonly UnifiedFindingDisplayPacket[], scanId: string, documentUrl: string) {
  const document = transportDocumentUrl(documentUrl)?.href;
  const issues = findings.flatMap(finding => {
    const proof = verifiedCaliforniaTransportFinding(finding);
    return proof?.scanId === scanId && proof.documentUrl === document ? proof.issues : [];
  });
  return { points: transportPoints(issues), policyKey };
}
