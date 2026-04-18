"use server";

import { resolvePolicyReviewNote, type PolicyReviewQueueStatus, type PolicyReviewVerdict } from "@website-signal-risk-scanner/shared";
import {
  loadPolicyReviewQueueRows,
  loadPolicyReviewQueueUpdateContext,
  updatePolicyReviewQueueRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export async function getPolicyReviewQueue(input?: { reviewStatus?: PolicyReviewQueueStatus }) {
  await requirePlatformAdminContext();
  const data = await loadPolicyReviewQueueRows(input?.reviewStatus ?? null);

  return data.map((row) => ({
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    id: row.id,
    policyEnrichmentId: row.policy_enrichment_id,
    reason: row.reason,
    reviewStatus: row.review_status,
    reviewVerdict: row.review_verdict,
    reviewedAt: row.reviewed_at,
    reviewerNotes: row.reviewer_notes,
    scanId: row.scan_id
  }));
}

export async function updatePolicyReviewVerdict(input: {
  assignedTo?: string | null;
  queueItemId: string;
  reviewStatus: PolicyReviewQueueStatus;
  reviewVerdict: PolicyReviewVerdict | null;
  reviewerNotes?: string | null;
}) {
  await requirePlatformAdminContext();
  const { pageType, queueItem } = await loadPolicyReviewQueueUpdateContext(input.queueItemId);

  const resolvedNotes = resolvePolicyReviewNote({
    pageType,
    reason: queueItem?.reason ?? null,
    reviewVerdict: input.reviewVerdict,
    reviewerNotes: input.reviewerNotes ?? null
  });

  return await updatePolicyReviewQueueRow({
    assignedTo: input.assignedTo ?? null,
    queueItemId: input.queueItemId,
    reviewStatus: input.reviewStatus,
    reviewVerdict: resolvedNotes.reviewVerdict,
    reviewedAt: new Date().toISOString(),
    reviewerNotes: resolvedNotes.reviewerNotes
  });
}
