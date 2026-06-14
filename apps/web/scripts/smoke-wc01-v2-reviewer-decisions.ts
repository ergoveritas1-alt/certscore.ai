import {
  getWc01V2InternalPreviewQueueSummary,
  getWc01V2InternalReviewerDecisionSummary,
  listWc01V2InternalPreviewQueue,
  listWc01V2InternalRecentReviewerDecisions,
  saveWc01V2InternalReviewerDecision,
  type Wc01V2InternalPreviewQueueRow,
  type Wc01V2InternalReviewerAction,
} from "../server/admin/v2-internal-reviewer-persistence";

type SmokeArgs = {
  help?: boolean;
  reviewerId: string;
};

type PlannedDecision = {
  item: Wc01V2InternalPreviewQueueRow;
  action: Wc01V2InternalReviewerAction;
  notes: string;
  markdownSufficient: boolean;
  jsonOpened: boolean;
  upstreamInspectionNeeded: boolean;
  unresolvedRefsBlockedReview: boolean;
  confidenceDirectnessClear: boolean;
  escalationNeeded: boolean;
  escalationReason?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const queueBefore = await getWc01V2InternalPreviewQueueSummary();
  const decisionBefore = await getWc01V2InternalReviewerDecisionSummary({ reviewerId: args.reviewerId });
  const items = (await listWc01V2InternalPreviewQueue({ decisionState: "all", limit: 200 })).rows;
  const plan = buildDecisionPlan(items);

  if (plan.length < 3) {
    throw new Error(
      [
        `Need at least 3 persisted WC01 v2 preview items for the reviewer UI smoke; found ${items.length}.`,
        "Import a cohort first, for example:",
        "  pnpm v2:wc01-import-evidence-preview --path ./artifacts/v2-wc01-evidence-preview-policy-stress-consent --cohort policy-stress",
      ].join("\n"),
    );
  }

  for (const decision of plan) {
    await saveWc01V2InternalReviewerDecision({
      previewItemId: decision.item.id,
      reviewerId: args.reviewerId,
      reviewerAction: decision.action,
      decisionNotes: decision.notes,
      markdownSufficient: decision.markdownSufficient,
      jsonOpened: decision.jsonOpened,
      upstreamInspectionNeeded: decision.upstreamInspectionNeeded,
      unresolvedRefsBlockedReview: decision.unresolvedRefsBlockedReview,
      confidenceDirectnessClear: decision.confidenceDirectnessClear,
      escalationNeeded: decision.escalationNeeded,
      escalationReason: decision.escalationReason ?? null,
      decisionJson: {
        source: "wc01_v2_reviewer_ui_smoke",
      },
    });
  }

  const queueAfter = await getWc01V2InternalPreviewQueueSummary();
  const decisionAfter = await getWc01V2InternalReviewerDecisionSummary({ reviewerId: args.reviewerId });
  const recent = await listWc01V2InternalRecentReviewerDecisions({ reviewerId: args.reviewerId, limit: 5 });

  console.log(JSON.stringify({
    reviewerId: args.reviewerId,
    savedDecisions: plan.map((decision) => ({
      site: decision.item.site_domain,
      queueItemId: decision.item.queue_item_id,
      family: decision.item.family,
      queueLane: decision.item.queue_lane,
      action: decision.action,
    })),
    before: {
      queue: queueBefore,
      reviewerDecisions: decisionBefore,
    },
    after: {
      queue: queueAfter,
      reviewerDecisions: decisionAfter,
      recentDecisionRows: recent.rows.length,
    },
    checks: {
      decidedItemsIncreased: (queueAfter?.decided_items ?? 0) >= (queueBefore?.decided_items ?? 0),
      undecidedItemsDidNotIncrease: (queueAfter?.undecided_items ?? 0) <= (queueBefore?.undecided_items ?? 0),
      reviewerDecisionSummaryPopulated: (decisionAfter?.reviewed_items ?? 0) >= plan.length,
      recentDecisionsPopulated: recent.rows.length > 0,
    },
  }, null, 2));
}

function buildDecisionPlan(items: Wc01V2InternalPreviewQueueRow[]): PlannedDecision[] {
  const selected = new Set<string>();
  const decisions: PlannedDecision[] = [];

  const standardItem =
    findUnique(items, selected, (item) => item.queue_lane === "standard_internal_review_candidate")
    ?? findUnique(items, selected, () => true);
  if (standardItem) {
    decisions.push({
      item: standardItem,
      action: "evidence_shape_confirmed",
      notes: "Local UI smoke: evidence shape confirmed from grouped preview.",
      markdownSufficient: true,
      jsonOpened: false,
      upstreamInspectionNeeded: false,
      unresolvedRefsBlockedReview: false,
      confidenceDirectnessClear: true,
      escalationNeeded: false,
    });
  }

  const needsMoreItem =
    findUnique(items, selected, (item) => item.unresolved_ref_count > 0)
    ?? findUnique(items, selected, (item) => item.warning_count > 0)
    ?? findUnique(items, selected, () => true);
  if (needsMoreItem) {
    decisions.push({
      item: needsMoreItem,
      action: "needs_more_evidence",
      notes: "Local UI smoke: marked for additional internal evidence review.",
      markdownSufficient: false,
      jsonOpened: true,
      upstreamInspectionNeeded: needsMoreItem.unresolved_ref_count > 0,
      unresolvedRefsBlockedReview: needsMoreItem.unresolved_ref_count > 0,
      confidenceDirectnessClear: true,
      escalationNeeded: false,
    });
  }

  const sensitiveItem =
    findUnique(items, selected, (item) => item.sensitive_context_categories.length > 0)
    ?? findUnique(items, selected, (item) => item.queue_lane === "sensitive_context_review_required")
    ?? findUnique(items, selected, () => true);
  if (sensitiveItem) {
    decisions.push({
      item: sensitiveItem,
      action: "sensitive_context_escalated",
      notes: "Local UI smoke: routed as sensitive-context internal review metadata.",
      markdownSufficient: true,
      jsonOpened: true,
      upstreamInspectionNeeded: false,
      unresolvedRefsBlockedReview: false,
      confidenceDirectnessClear: true,
      escalationNeeded: true,
      escalationReason: "Sensitive-context review routing metadata.",
    });
  }

  return decisions;
}

function findUnique(
  items: Wc01V2InternalPreviewQueueRow[],
  selected: Set<string>,
  predicate: (item: Wc01V2InternalPreviewQueueRow) => boolean,
) {
  const item = items.find((candidate) => !selected.has(candidate.id) && predicate(candidate));
  if (item) {
    selected.add(item.id);
  }
  return item ?? null;
}

function parseArgs(argv: string[]): SmokeArgs {
  const args: SmokeArgs = {
    reviewerId: "local_reviewer_smoke",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--reviewer-id") {
      args.reviewerId = requiredValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function usage() {
  return [
    "Usage:",
    "  pnpm --filter @website-signal-risk-scanner/web smoke:wc01-v2-reviewer-decisions [--reviewer-id <id>]",
    "",
    "Saves three internal-only WC01 v2 reviewer decisions against persisted evidence preview items.",
    "This command does not create normalized concerns, unified findings, report rows, checklist rows, or customer-facing output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
