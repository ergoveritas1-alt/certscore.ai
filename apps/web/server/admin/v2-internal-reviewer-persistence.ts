import { query, queryOne } from "@website-signal-risk-scanner/db";

export const WC01_V2_INTERNAL_REVIEWER_ACTIONS = [
  "evidence_shape_confirmed",
  "needs_more_evidence",
  "internal_only",
  "policy_copy_review_required",
  "sensitive_context_escalated",
  "rejected_overbroad",
] as const;

export type Wc01V2InternalReviewerAction = typeof WC01_V2_INTERNAL_REVIEWER_ACTIONS[number];

export type Wc01V2InternalArtifactKind =
  | "evidence_preview_packet"
  | "manual_reviewer_packet"
  | "concern_policy_comparison"
  | "implementation_proposal"
  | "approval_metadata"
  | "product_surface_proposal";

export type Wc01V2InternalGuardrailStatus = "passed" | "failed" | "not_evaluated";

export type Wc01V2InternalArtifactRunRow = {
  id: string;
  source_label: string;
  cohort: string | null;
  site_domain: string | null;
  artifact_kind: Wc01V2InternalArtifactKind;
  artifact_version: string;
  artifact_path: string;
  artifact_root: string | null;
  artifact_json: Record<string, unknown>;
  summary_markdown: string | null;
  queue_item_count: number;
  guardrail_status: Wc01V2InternalGuardrailStatus;
  created_by: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Wc01V2InternalPreviewItemRow = {
  id: string;
  artifact_run_id: string;
  queue_item_id: string;
  site_domain: string | null;
  family: string;
  queue_lane: string;
  suggested_reviewer_action: Wc01V2InternalReviewerAction | null;
  sensitive_context_categories: string[];
  confidence_band: string | null;
  directness: string | null;
  unresolved_ref_count: number;
  warning_count: number;
  item_json: Record<string, unknown>;
  created_at: string;
};

export type Wc01V2InternalReviewerDecisionRow = {
  id: string;
  preview_item_id: string;
  reviewer_id: string;
  reviewer_action: Wc01V2InternalReviewerAction;
  decision_notes: string | null;
  markdown_sufficient: boolean | null;
  json_opened: boolean | null;
  upstream_inspection_needed: boolean | null;
  unresolved_refs_blocked_review: boolean | null;
  confidence_directness_clear: boolean | null;
  escalation_needed: boolean | null;
  escalation_reason: string | null;
  decision_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Wc01V2InternalPreviewQueueDecisionState =
  | "all"
  | "undecided"
  | "decided"
  | "needs_more_evidence"
  | "sensitive_context_escalated";

export type Wc01V2InternalPreviewQueueRow = Wc01V2InternalPreviewItemRow & {
  run_source_label: string;
  run_cohort: string | null;
  run_artifact_path: string;
  run_created_at: string;
  latest_decision_id: string | null;
  latest_reviewer_id: string | null;
  latest_reviewer_action: Wc01V2InternalReviewerAction | null;
  latest_decision_notes: string | null;
  latest_markdown_sufficient: boolean | null;
  latest_json_opened: boolean | null;
  latest_upstream_inspection_needed: boolean | null;
  latest_unresolved_refs_blocked_review: boolean | null;
  latest_confidence_directness_clear: boolean | null;
  latest_escalation_needed: boolean | null;
  latest_escalation_reason: string | null;
  latest_decision_created_at: string | null;
};

export type Wc01V2InternalPreviewQueueSummary = {
  total_items: number;
  undecided_items: number;
  decided_items: number;
  escalated_items: number;
  unresolved_ref_items: number;
};

export type Wc01V2InternalPreviewQueueFilterOptions = {
  cohorts: string[];
  site_domains: string[];
  families: string[];
  queue_lanes: string[];
  reviewer_ids: string[];
};

export type Wc01V2InternalReviewerDecisionSummary = {
  reviewed_items: number;
  markdown_sufficient_items: number;
  json_opened_items: number;
  upstream_inspection_needed_items: number;
  unresolved_refs_blocked_review_items: number;
  confidence_directness_clear_items: number;
  escalation_needed_items: number;
};

export type Wc01V2InternalReviewerActionCountRow = {
  reviewer_action: Wc01V2InternalReviewerAction;
  decision_count: number;
};

export type Wc01V2InternalRecentReviewerDecisionRow = Wc01V2InternalReviewerDecisionRow & {
  queue_item_id: string;
  site_domain: string | null;
  family: string;
  queue_lane: string;
  run_cohort: string | null;
  run_source_label: string;
};

export type Wc01V2InternalQueryClient = {
  query: typeof query;
  queryOne: typeof queryOne;
};

const defaultClient: Wc01V2InternalQueryClient = { query, queryOne };

export async function createWc01V2InternalArtifactRun(
  input: {
    sourceLabel: string;
    cohort?: string | null;
    siteDomain?: string | null;
    artifactKind: Wc01V2InternalArtifactKind;
    artifactVersion: string;
    artifactPath: string;
    artifactRoot?: string | null;
    artifactJson: Record<string, unknown>;
    summaryMarkdown?: string | null;
    queueItemCount?: number;
    guardrailStatus?: Wc01V2InternalGuardrailStatus;
    createdBy?: string | null;
    metadataJson?: Record<string, unknown>;
  },
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.queryOne<Wc01V2InternalArtifactRunRow>(
    `
      insert into wc01_v2_internal_artifact_runs (
        source_label,
        cohort,
        site_domain,
        artifact_kind,
        artifact_version,
        artifact_path,
        artifact_root,
        artifact_json,
        summary_markdown,
        queue_item_count,
        guardrail_status,
        created_by,
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb)
      returning *
    `,
    [
      input.sourceLabel,
      input.cohort ?? null,
      input.siteDomain ?? null,
      input.artifactKind,
      input.artifactVersion,
      input.artifactPath,
      input.artifactRoot ?? null,
      JSON.stringify(input.artifactJson),
      input.summaryMarkdown ?? null,
      input.queueItemCount ?? 0,
      input.guardrailStatus ?? "not_evaluated",
      input.createdBy ?? null,
      JSON.stringify(input.metadataJson ?? {}),
    ],
  );
}

export async function getWc01V2InternalArtifactRunByPath(
  artifactPath: string,
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.queryOne<Wc01V2InternalArtifactRunRow>(
    `
      select *
      from wc01_v2_internal_artifact_runs
      where artifact_path = $1
      order by created_at desc
      limit 1
    `,
    [artifactPath],
    { readOnly: true },
  );
}

export async function createWc01V2InternalPreviewItem(
  input: {
    artifactRunId: string;
    queueItemId: string;
    siteDomain?: string | null;
    family: string;
    queueLane: string;
    suggestedReviewerAction?: Wc01V2InternalReviewerAction | null;
    sensitiveContextCategories?: string[];
    confidenceBand?: string | null;
    directness?: string | null;
    unresolvedRefCount?: number;
    warningCount?: number;
    itemJson?: Record<string, unknown>;
  },
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  assertReviewerAction(input.suggestedReviewerAction ?? null);
  return client.queryOne<Wc01V2InternalPreviewItemRow>(
    `
      insert into wc01_v2_internal_preview_items (
        artifact_run_id,
        queue_item_id,
        site_domain,
        family,
        queue_lane,
        suggested_reviewer_action,
        sensitive_context_categories,
        confidence_band,
        directness,
        unresolved_ref_count,
        warning_count,
        item_json
      )
      values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12::jsonb)
      on conflict (artifact_run_id, queue_item_id) do update set
        site_domain = excluded.site_domain,
        family = excluded.family,
        queue_lane = excluded.queue_lane,
        suggested_reviewer_action = excluded.suggested_reviewer_action,
        sensitive_context_categories = excluded.sensitive_context_categories,
        confidence_band = excluded.confidence_band,
        directness = excluded.directness,
        unresolved_ref_count = excluded.unresolved_ref_count,
        warning_count = excluded.warning_count,
        item_json = excluded.item_json
      returning *
    `,
    [
      input.artifactRunId,
      input.queueItemId,
      input.siteDomain ?? null,
      input.family,
      input.queueLane,
      input.suggestedReviewerAction ?? null,
      input.sensitiveContextCategories ?? [],
      input.confidenceBand ?? null,
      input.directness ?? null,
      input.unresolvedRefCount ?? 0,
      input.warningCount ?? 0,
      JSON.stringify(input.itemJson ?? {}),
    ],
  );
}

export async function listWc01V2InternalArtifactRuns(
  input: {
    limit?: number;
    artifactKind?: Wc01V2InternalArtifactKind;
    siteDomain?: string;
  } = {},
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  return client.query<Wc01V2InternalArtifactRunRow>(
    `
      select *
      from wc01_v2_internal_artifact_runs
      where ($1::text is null or artifact_kind = $1)
        and ($2::text is null or site_domain = $2)
      order by created_at desc
      limit $3
    `,
    [input.artifactKind ?? null, input.siteDomain ?? null, limit],
    { readOnly: true },
  );
}

export async function listWc01V2InternalPreviewItems(
  artifactRunId: string,
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.query<Wc01V2InternalPreviewItemRow>(
    `
      select *
      from wc01_v2_internal_preview_items
      where artifact_run_id = $1
      order by created_at asc, queue_item_id asc
    `,
    [artifactRunId],
    { readOnly: true },
  );
}

export async function listWc01V2InternalPreviewQueue(
  input: {
    cohort?: string | null;
    siteDomain?: string | null;
    family?: string | null;
    queueLane?: string | null;
    decisionState?: Wc01V2InternalPreviewQueueDecisionState;
    unresolvedOnly?: boolean;
    limit?: number;
  } = {},
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const decisionState = input.decisionState ?? "undecided";

  return client.query<Wc01V2InternalPreviewQueueRow>(
    `
      select
        i.*,
        r.source_label as run_source_label,
        r.cohort as run_cohort,
        r.artifact_path as run_artifact_path,
        r.created_at as run_created_at,
        latest.id as latest_decision_id,
        latest.reviewer_id as latest_reviewer_id,
        latest.reviewer_action as latest_reviewer_action,
        latest.decision_notes as latest_decision_notes,
        latest.markdown_sufficient as latest_markdown_sufficient,
        latest.json_opened as latest_json_opened,
        latest.upstream_inspection_needed as latest_upstream_inspection_needed,
        latest.unresolved_refs_blocked_review as latest_unresolved_refs_blocked_review,
        latest.confidence_directness_clear as latest_confidence_directness_clear,
        latest.escalation_needed as latest_escalation_needed,
        latest.escalation_reason as latest_escalation_reason,
        latest.created_at as latest_decision_created_at
      from wc01_v2_internal_preview_items i
      join wc01_v2_internal_artifact_runs r
        on r.id = i.artifact_run_id
      left join lateral (
        select d.*
        from wc01_v2_internal_reviewer_decisions d
        where d.preview_item_id = i.id
        order by d.created_at desc
        limit 1
      ) latest on true
      where ($1::text is null or r.cohort = $1)
        and ($2::text is null or i.site_domain = $2)
        and ($3::text is null or i.family = $3)
        and ($4::text is null or i.queue_lane = $4)
        and ($5::boolean is false or i.unresolved_ref_count > 0)
        and (
          $6::text = 'all'
          or ($6::text = 'undecided' and latest.id is null)
          or ($6::text = 'decided' and latest.id is not null)
          or ($6::text = 'needs_more_evidence' and latest.reviewer_action = 'needs_more_evidence')
          or ($6::text = 'sensitive_context_escalated' and latest.reviewer_action = 'sensitive_context_escalated')
        )
      order by
        case when latest.id is null then 0 else 1 end asc,
        i.unresolved_ref_count desc,
        r.created_at desc,
        i.created_at asc,
        i.queue_item_id asc
      limit $7
    `,
    [
      emptyToNull(input.cohort),
      emptyToNull(input.siteDomain),
      emptyToNull(input.family),
      emptyToNull(input.queueLane),
      input.unresolvedOnly === true,
      decisionState,
      limit,
    ],
    { readOnly: true },
  );
}

export async function getWc01V2InternalPreviewQueueSummary(
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.queryOne<Wc01V2InternalPreviewQueueSummary>(
    `
      select
        count(*)::int as total_items,
        count(*) filter (where latest.id is null)::int as undecided_items,
        count(*) filter (where latest.id is not null)::int as decided_items,
        count(*) filter (where latest.reviewer_action = 'sensitive_context_escalated')::int as escalated_items,
        count(*) filter (where i.unresolved_ref_count > 0)::int as unresolved_ref_items
      from wc01_v2_internal_preview_items i
      left join lateral (
        select d.id, d.reviewer_action
        from wc01_v2_internal_reviewer_decisions d
        where d.preview_item_id = i.id
        order by d.created_at desc
        limit 1
      ) latest on true
    `,
    [],
    { readOnly: true },
  );
}

export async function listWc01V2InternalPreviewQueueFilterOptions(
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.queryOne<Wc01V2InternalPreviewQueueFilterOptions>(
    `
      select
        coalesce(array_agg(distinct r.cohort order by r.cohort) filter (where r.cohort is not null), '{}') as cohorts,
        coalesce(array_agg(distinct i.site_domain order by i.site_domain) filter (where i.site_domain is not null), '{}') as site_domains,
        coalesce(array_agg(distinct i.family order by i.family), '{}') as families,
        coalesce(array_agg(distinct i.queue_lane order by i.queue_lane), '{}') as queue_lanes,
        coalesce(array_agg(distinct d.reviewer_id order by d.reviewer_id) filter (where d.reviewer_id is not null), '{}') as reviewer_ids
      from wc01_v2_internal_preview_items i
      join wc01_v2_internal_artifact_runs r
        on r.id = i.artifact_run_id
      left join wc01_v2_internal_reviewer_decisions d
        on d.preview_item_id = i.id
    `,
    [],
    { readOnly: true },
  );
}

export async function getWc01V2InternalReviewerDecisionSummary(
  input: {
    reviewerId?: string | null;
  } = {},
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.queryOne<Wc01V2InternalReviewerDecisionSummary>(
    `
      with latest as (
        select distinct on (d.preview_item_id) d.*
        from wc01_v2_internal_reviewer_decisions d
        where ($1::text is null or d.reviewer_id = $1)
        order by d.preview_item_id, d.created_at desc
      )
      select
        count(*)::int as reviewed_items,
        count(*) filter (where markdown_sufficient is true)::int as markdown_sufficient_items,
        count(*) filter (where json_opened is true)::int as json_opened_items,
        count(*) filter (where upstream_inspection_needed is true)::int as upstream_inspection_needed_items,
        count(*) filter (where unresolved_refs_blocked_review is true)::int as unresolved_refs_blocked_review_items,
        count(*) filter (where confidence_directness_clear is true)::int as confidence_directness_clear_items,
        count(*) filter (where escalation_needed is true)::int as escalation_needed_items
      from latest
    `,
    [emptyToNull(input.reviewerId)],
    { readOnly: true },
  );
}

export async function listWc01V2InternalReviewerActionCounts(
  input: {
    reviewerId?: string | null;
  } = {},
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.query<Wc01V2InternalReviewerActionCountRow>(
    `
      with latest as (
        select distinct on (d.preview_item_id) d.*
        from wc01_v2_internal_reviewer_decisions d
        where ($1::text is null or d.reviewer_id = $1)
        order by d.preview_item_id, d.created_at desc
      )
      select
        reviewer_action,
        count(*)::int as decision_count
      from latest
      group by reviewer_action
      order by decision_count desc, reviewer_action asc
    `,
    [emptyToNull(input.reviewerId)],
    { readOnly: true },
  );
}

export async function listWc01V2InternalRecentReviewerDecisions(
  input: {
    reviewerId?: string | null;
    limit?: number;
  } = {},
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  return client.query<Wc01V2InternalRecentReviewerDecisionRow>(
    `
      select
        d.*,
        i.queue_item_id,
        i.site_domain,
        i.family,
        i.queue_lane,
        r.cohort as run_cohort,
        r.source_label as run_source_label
      from wc01_v2_internal_reviewer_decisions d
      join wc01_v2_internal_preview_items i
        on i.id = d.preview_item_id
      join wc01_v2_internal_artifact_runs r
        on r.id = i.artifact_run_id
      where ($1::text is null or d.reviewer_id = $1)
      order by d.created_at desc
      limit $2
    `,
    [emptyToNull(input.reviewerId), limit],
    { readOnly: true },
  );
}

export async function saveWc01V2InternalReviewerDecision(
  input: {
    previewItemId: string;
    reviewerId: string;
    reviewerAction: Wc01V2InternalReviewerAction;
    decisionNotes?: string | null;
    markdownSufficient?: boolean | null;
    jsonOpened?: boolean | null;
    upstreamInspectionNeeded?: boolean | null;
    unresolvedRefsBlockedReview?: boolean | null;
    confidenceDirectnessClear?: boolean | null;
    escalationNeeded?: boolean | null;
    escalationReason?: string | null;
    decisionJson?: Record<string, unknown>;
  },
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  assertReviewerAction(input.reviewerAction);
  return client.queryOne<Wc01V2InternalReviewerDecisionRow>(
    `
      insert into wc01_v2_internal_reviewer_decisions (
        preview_item_id,
        reviewer_id,
        reviewer_action,
        decision_notes,
        markdown_sufficient,
        json_opened,
        upstream_inspection_needed,
        unresolved_refs_blocked_review,
        confidence_directness_clear,
        escalation_needed,
        escalation_reason,
        decision_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      returning *
    `,
    [
      input.previewItemId,
      input.reviewerId,
      input.reviewerAction,
      input.decisionNotes ?? null,
      input.markdownSufficient ?? null,
      input.jsonOpened ?? null,
      input.upstreamInspectionNeeded ?? null,
      input.unresolvedRefsBlockedReview ?? null,
      input.confidenceDirectnessClear ?? null,
      input.escalationNeeded ?? null,
      input.escalationReason ?? null,
      JSON.stringify(input.decisionJson ?? {}),
    ],
  );
}

export async function listWc01V2InternalReviewerDecisions(
  previewItemId: string,
  client: Wc01V2InternalQueryClient = defaultClient,
) {
  return client.query<Wc01V2InternalReviewerDecisionRow>(
    `
      select *
      from wc01_v2_internal_reviewer_decisions
      where preview_item_id = $1
      order by created_at desc
    `,
    [previewItemId],
    { readOnly: true },
  );
}

function assertReviewerAction(action: Wc01V2InternalReviewerAction | null) {
  if (action === null) {
    return;
  }
  if (!WC01_V2_INTERNAL_REVIEWER_ACTIONS.includes(action)) {
    throw new Error(`Unsupported WC01 v2 internal reviewer action: ${action}`);
  }
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}
