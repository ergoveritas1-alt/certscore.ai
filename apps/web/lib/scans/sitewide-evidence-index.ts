import { z } from "zod";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";

export const sitewideEvidenceGroups = {
  tracking: ["pre_consent_third_party_tracking", "third_party_iframe_pre_consent", "social_media_embed_pre_consent", "embedded_content_pre_consent"],
  runtime: ["pre_consent_cookies_storage", "session_replay_fingerprinting_review", "device_identification_fingerprinting_signal_observed"],
} as const;
export const sitewideEvidencePageSchema = z.object({
  pageId: z.string(), url: z.string(), sourceHash: z.string(), homepage: z.boolean(),
  rows: z.array(z.object({
    id: z.string(), title: z.string(), status: z.string(), summary: z.string(),
    assessmentStatus: z.string(), evidenceRefs: z.array(z.string()), limitation: z.string().optional(),
  })),
});
export type SitewideEvidencePage = z.infer<typeof sitewideEvidencePageSchema>;
export function projectSitewideEvidencePage(
  page: Omit<SitewideEvidencePage, "rows">, rows: GdprEprivacyCoverageChecklistItem[],
): SitewideEvidencePage {
  const ids = new Set<string>([...sitewideEvidenceGroups.tracking, ...sitewideEvidenceGroups.runtime]);
  return { ...page, rows: rows.filter(row => ids.has(row.id)).map(row => ({
    id: row.id, title: row.label, status: row.assessmentStatus === "gap_observed" ? "Gap observed" : row.assessmentStatus === "review_signal" ? "Review signal" : row.status, assessmentStatus: row.assessmentStatus,
    summary: deriveGdprEprivacyCoverageChecklistRowRationale(row),
    evidenceRefs: row.evidenceRefs, ...(row.limitation ? { limitation: row.limitation } : {}),
  })) };
}
