import { californiaPrivacyReviewFindingIds, californiaPrivacyReviewSchema } from "@certscore/contracts";
import type { AssessmentHighlightFinding, AssessmentResultSummary } from "./assessment-brief";

export type AssessmentReportIdentity = { scanId: string; documentUrl: string; sourceHash?: string };

/** Editorial context from already-projected canonical finding payloads only.
 * This never creates a finding or restores an editorially demoted issue. */
export function projectCaliforniaAssessmentResultSummary(
  findings: ReadonlyArray<AssessmentHighlightFinding>, identity?: AssessmentReportIdentity,
): AssessmentResultSummary | null {
  if (!identity?.sourceHash || !/^[a-f0-9]{64}$/.test(identity.sourceHash) || findings.length > 200) return null;
  const candidates = findings.flatMap(finding => {
    if (!finding.id || finding.evidenceJson?.findingId !== finding.id) return [];
    const parsed = californiaPrivacyReviewSchema.safeParse(finding.evidenceJson.californiaPrivacyReview);
    if (!parsed.success || parsed.data.scanId !== identity.scanId || parsed.data.documentUrl !== identity.documentUrl || parsed.data.sourceHash !== identity.sourceHash ||
      !californiaPrivacyReviewFindingIds(parsed.data).includes(finding.id)) return [];
    return [{ findingId: finding.id, review: parsed.data }];
  });
  const first = candidates[0];
  if (!first || candidates.some(candidate => JSON.stringify(candidate.review) !== JSON.stringify(first.review))) return null;
  const { review } = first;
  if (!("reviewCoverage" in review)) return null;
  const coverage = review.reviewCoverage;
  const notice = coverage.families.find(row => row.id === "privacy_notice");
  const documentRefs = new Set(coverage.sourceDocuments.map(document => document.evidenceRef));
  if (!documentRefs.size || !notice || notice.status === "unknown" ||
    !notice.evidenceRefs.some(ref => documentRefs.has(ref))) return null;

  const facts = ["A privacy notice was found."];
  const sourceRefs = [first.findingId, ...notice.evidenceRefs.filter(ref => documentRefs.has(ref))];
  const rights = "rightsAssessment" in review ? review.rightsAssessment : undefined;
  const deletion = rights?.sourceBundleSha256 === review.sourceHash
    ? rights.topics.find(topic => topic.topic === "right_to_delete" && topic.status === "disclosed" &&
      topic.passages.some(passage => documentRefs.has(passage.evidenceRef))) : undefined;
  if (deletion?.context === "general_consumer_wording" || deletion?.context === "california_wording") {
    facts[0] = deletion.context === "general_consumer_wording"
      ? "The privacy notice includes general consumer wording about requests to delete personal information."
      : "The privacy notice includes wording about California consumers' requests to delete personal information.";
    sourceRefs.push(...deletion.passages.map(passage => passage.evidenceRef));
  }
  // Unresolved family/collection states stay in Detailed evidence. They cannot
  // manufacture an executive action when no eligible priority finding exists.
  return { facts, targetId: "california-privacy-evidence", sourceRefs: [...new Set(sourceRefs)] };
}
