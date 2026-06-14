import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createWc01V2InternalArtifactRun,
  createWc01V2InternalPreviewItem,
  getWc01V2InternalArtifactRunByPath,
  getWc01V2InternalPreviewQueueSummary,
  getWc01V2InternalReviewerDecisionSummary,
  listWc01V2InternalArtifactRuns,
  listWc01V2InternalPreviewItems,
  listWc01V2InternalPreviewQueue,
  listWc01V2InternalPreviewQueueFilterOptions,
  listWc01V2InternalRecentReviewerDecisions,
  listWc01V2InternalReviewerActionCounts,
  listWc01V2InternalReviewerDecisions,
  saveWc01V2InternalReviewerDecision,
  type Wc01V2InternalQueryClient,
} from "./v2-internal-reviewer-persistence";

test("creates internal artifact run with artifact-only metadata", async () => {
  const client = fakeClient({ id: "run-1" });

  await createWc01V2InternalArtifactRun({
    sourceLabel: "policy-stress",
    cohort: "policy-stress",
    siteDomain: "example.com",
    artifactKind: "evidence_preview_packet",
    artifactVersion: "wc01.v2_evidence_preview_packet.1",
    artifactPath: "artifacts/example.json",
    artifactRoot: "artifacts",
    artifactJson: { packetVersion: "wc01.v2_evidence_preview_packet.1" },
    summaryMarkdown: "# summary",
    queueItemCount: 2,
    guardrailStatus: "passed",
    createdBy: "reviewer@example.com",
    metadataJson: { source: "manual_import" },
  }, client);

  assert.equal(client.queryOneCalls.length, 1);
  const call = client.queryOneCalls[0]!;
  assert.match(call.text, /insert into wc01_v2_internal_artifact_runs/i);
  assert.doesNotMatch(call.text, /unified_findings|report_findings|checklist/i);
  assert.equal(call.values[0], "policy-stress");
  assert.equal(call.values[3], "evidence_preview_packet");
  assert.equal(call.values[7], JSON.stringify({ packetVersion: "wc01.v2_evidence_preview_packet.1" }));
  assert.equal(call.values[10], "passed");
});

test("upserts preview item and validates reviewer action", async () => {
  const client = fakeClient({ id: "item-1" });

  await createWc01V2InternalPreviewItem({
    artifactRunId: "run-1",
    queueItemId: "weather.com:item-1",
    siteDomain: "weather.com",
    family: "pre_consent_tracking",
    queueLane: "standard_internal_review_candidate",
    suggestedReviewerAction: "evidence_shape_confirmed",
    sensitiveContextCategories: [],
    confidenceBand: "high",
    directness: "direct_runtime",
    unresolvedRefCount: 0,
    warningCount: 1,
    itemJson: { rowId: "row-1" },
  }, client);

  assert.equal(client.queryOneCalls.length, 1);
  const call = client.queryOneCalls[0]!;
  assert.match(call.text, /on conflict \(artifact_run_id, queue_item_id\) do update/i);
  assert.equal(call.values[5], "evidence_shape_confirmed");
  assert.deepEqual(call.values[6], []);
  assert.equal(call.values[11], JSON.stringify({ rowId: "row-1" }));

  await assert.rejects(
    () => createWc01V2InternalPreviewItem({
      artifactRunId: "run-1",
      queueItemId: "bad",
      family: "pre_consent_tracking",
      queueLane: "standard",
      suggestedReviewerAction: "approve_for_report" as never,
    }, client),
    /Unsupported WC01 v2 internal reviewer action/,
  );
});

test("saves reviewer decision without production side effects", async () => {
  const client = fakeClient({ id: "decision-1" });

  await saveWc01V2InternalReviewerDecision({
    previewItemId: "item-1",
    reviewerId: "reviewer-1",
    reviewerAction: "needs_more_evidence",
    decisionNotes: "Need one more bounded excerpt.",
    markdownSufficient: true,
    jsonOpened: false,
    upstreamInspectionNeeded: false,
    unresolvedRefsBlockedReview: false,
    confidenceDirectnessClear: true,
    escalationNeeded: false,
    decisionJson: { reason: "excerpt_count" },
  }, client);

  assert.equal(client.queryOneCalls.length, 1);
  const call = client.queryOneCalls[0]!;
  assert.match(call.text, /insert into wc01_v2_internal_reviewer_decisions/i);
  assert.doesNotMatch(call.text, /normalized_concerns|unified_findings|reports|checklist/i);
  assert.equal(call.values[2], "needs_more_evidence");
  assert.equal(call.values[11], JSON.stringify({ reason: "excerpt_count" }));
});

test("list helpers use read-only queries and bounded limits", async () => {
  const client = fakeClient();

  await listWc01V2InternalArtifactRuns({ limit: 500, artifactKind: "evidence_preview_packet" }, client);
  await listWc01V2InternalPreviewItems("run-1", client);
  await listWc01V2InternalReviewerDecisions("item-1", client);

  assert.equal(client.queryCalls.length, 3);
  assert.equal(client.queryCalls[0]!.options?.readOnly, true);
  assert.equal(client.queryCalls[0]!.values[2], 200);
  assert.equal(client.queryCalls[1]!.options?.readOnly, true);
  assert.equal(client.queryCalls[2]!.options?.readOnly, true);
});

test("artifact path lookup uses read-only query", async () => {
  const client = fakeClient({ id: "run-1" });

  await getWc01V2InternalArtifactRunByPath("artifacts/example/Wc01V2EvidencePreviewPacket.json", client);

  assert.equal(client.queryOneCalls.length, 1);
  assert.match(client.queryOneCalls[0]!.text, /where artifact_path = \$1/i);
  assert.equal(client.queryOneCalls[0]!.values[0], "artifacts/example/Wc01V2EvidencePreviewPacket.json");
  assert.equal(client.queryOneCalls[0]!.options?.readOnly, true);
});

test("queue listing joins latest reviewer decision and applies bounded filters", async () => {
  const client = fakeClient();

  await listWc01V2InternalPreviewQueue({
    cohort: "policy-stress",
    siteDomain: "weather.com",
    family: "pre_consent_tracking",
    queueLane: "standard_internal_review_candidate",
    decisionState: "undecided",
    unresolvedOnly: true,
    limit: 500,
  }, client);

  assert.equal(client.queryCalls.length, 1);
  const call = client.queryCalls[0]!;
  assert.match(call.text, /left join lateral/i);
  assert.match(call.text, /latest\.reviewer_action/i);
  assert.equal(call.values[0], "policy-stress");
  assert.equal(call.values[1], "weather.com");
  assert.equal(call.values[2], "pre_consent_tracking");
  assert.equal(call.values[3], "standard_internal_review_candidate");
  assert.equal(call.values[4], true);
  assert.equal(call.values[5], "undecided");
  assert.equal(call.values[6], 200);
  assert.equal(call.options?.readOnly, true);
});

test("queue summary and filter option helpers use read-only queries", async () => {
  const client = fakeClient({
    total_items: 0,
    undecided_items: 0,
    decided_items: 0,
    escalated_items: 0,
    unresolved_ref_items: 0,
    cohorts: [],
    site_domains: [],
    families: [],
    queue_lanes: [],
    reviewer_ids: [],
  });

  await getWc01V2InternalPreviewQueueSummary(client);
  await listWc01V2InternalPreviewQueueFilterOptions(client);

  assert.equal(client.queryOneCalls.length, 2);
  assert.match(client.queryOneCalls[0]!.text, /count\(\*\)::int as total_items/i);
  assert.match(client.queryOneCalls[1]!.text, /array_agg\(distinct r\.cohort/i);
  assert.equal(client.queryOneCalls[0]!.options?.readOnly, true);
  assert.equal(client.queryOneCalls[1]!.options?.readOnly, true);
});

test("reviewer decision summaries use latest decisions and read-only bounded queries", async () => {
  const client = fakeClient({ reviewed_items: 0 });

  await getWc01V2InternalReviewerDecisionSummary({ reviewerId: "reviewer@example.com" }, client);
  await listWc01V2InternalReviewerActionCounts({ reviewerId: "reviewer@example.com" }, client);
  await listWc01V2InternalRecentReviewerDecisions({ reviewerId: "reviewer@example.com", limit: 500 }, client);

  assert.equal(client.queryOneCalls.length, 1);
  assert.equal(client.queryCalls.length, 2);
  assert.match(client.queryOneCalls[0]!.text, /select distinct on \(d\.preview_item_id\)/i);
  assert.match(client.queryCalls[0]!.text, /group by reviewer_action/i);
  assert.match(client.queryCalls[1]!.text, /join wc01_v2_internal_preview_items/i);
  assert.equal(client.queryOneCalls[0]!.values[0], "reviewer@example.com");
  assert.equal(client.queryCalls[0]!.values[0], "reviewer@example.com");
  assert.equal(client.queryCalls[1]!.values[0], "reviewer@example.com");
  assert.equal(client.queryCalls[1]!.values[1], 100);
  assert.equal(client.queryOneCalls[0]!.options?.readOnly, true);
  assert.equal(client.queryCalls[0]!.options?.readOnly, true);
  assert.equal(client.queryCalls[1]!.options?.readOnly, true);
});

test("internal reviewer persistence module does not import production report paths", async () => {
  const source = await readFile(new URL("./v2-internal-reviewer-persistence.ts", import.meta.url), "utf8");
  const imports = source
    .split("\n")
    .filter((line) => line.trim().startsWith("import "))
    .join("\n");

  assert.doesNotMatch(imports, /normalized-concerns|concern-policy|unified-findings|shared-scan-detail-view/);
  assert.doesNotMatch(imports, /checklist|executive|regulatory|scoring/);
});

function fakeClient(row: Record<string, unknown> = {}): Wc01V2InternalQueryClient & {
  queryCalls: Array<{ text: string; values: unknown[]; options?: { readOnly?: boolean } }>;
  queryOneCalls: Array<{ text: string; values: unknown[]; options?: { readOnly?: boolean } }>;
} {
  const queryCalls: Array<{ text: string; values: unknown[]; options?: { readOnly?: boolean } }> = [];
  const queryOneCalls: Array<{ text: string; values: unknown[]; options?: { readOnly?: boolean } }> = [];
  return {
    queryCalls,
    queryOneCalls,
    async query(text, values = [], options = {}) {
      queryCalls.push({ text, values, options });
      return { rows: [], rowCount: 0 } as never;
    },
    async queryOne(text, values = [], options = {}) {
      queryOneCalls.push({ text, values, options });
      return row as never;
    },
  };
}
