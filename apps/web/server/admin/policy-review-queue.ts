"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PolicyReviewQueueStatus, PolicyReviewVerdict } from "@website-signal-risk-scanner/shared";
import { requirePlatformAdminContext } from "./platform-admin";

export async function getPolicyReviewQueue(input?: { reviewStatus?: PolicyReviewQueueStatus }) {
  await requirePlatformAdminContext();
  const supabase = createAdminClient();
  let query = supabase.from("policy_review_queue").select("*").order("created_at", { ascending: false });

  if (input?.reviewStatus) {
    query = query.eq("review_status", input.reviewStatus);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load policy review queue: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("policy_review_queue")
    .update({
      assigned_to: input.assignedTo ?? null,
      review_status: input.reviewStatus,
      review_verdict: input.reviewVerdict,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: input.reviewerNotes ?? null
    })
    .eq("id", input.queueItemId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update policy review verdict: ${error.message}`);
  }

  return data;
}
