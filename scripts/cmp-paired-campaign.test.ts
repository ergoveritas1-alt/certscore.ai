import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessConsentActionStages } from "../packages/certscore-contracts/src/index";
import { buildCampaignComparison, joinPairedCampaign, type Campaign, type CampaignRun } from "./cmp-paired-campaign";
import type { AnalyzedRow, PairedPlan } from "./cmp-paired-comparison";

const weights = [{ provider: "OneTrust", completedClicks: 449 }, { provider: "Cookiebot", completedClicks: 1127 }];
const receipt = { path: "/fixture.json", sha256: "a".repeat(64), bytes: 1 };
function fixture() {
  const targets: PairedPlan["targets"] = ["one", "two", "held"].map((targetId, index) => ({ targetId, domain: targetId + ".example", url: `https://${targetId}.example/`,
    providerStratum: index === 1 ? "Cookiebot" : "OneTrust", phase: index === 2 ? "holdout" : "diagnostic", eligible: true, eligibilityReason: "fixture", armOrder: ["reference", "candidate"] }));
  const slots = targets.flatMap(target => (["accept", "reject"] as const).flatMap(action => (["reference", "candidate"] as const).map(arm => ({
    slotId: `${target.targetId}-${action}-${arm}`, pairId: `${target.targetId}-${action}`, targetId: target.targetId,
    url: target.url, action, arm, providerStratum: target.providerStratum, phase: target.phase }))));
  const campaign: Campaign = { schemaVersion: "cmp_paired_campaign.v1", campaignId: "fixture", maxContacts: 12, outputPath: "/fixture", slots };
  const plan: CampaignRun["plan"] = {
    schemaVersion: "cmp_paired_runtime_plan.v1", runId: "first", maxContacts: 8, concurrency: 1, campaign: receipt,
    historicalBaseline: receipt, eligibility: { ...receipt, checkedAt: "2026-10-29T00:00:00Z", expiresAt: "2026-10-30T00:00:00Z" },
    arms: { reference: { root: "/reference", sourceFingerprint: "1".repeat(64), buildFingerprint: "2".repeat(64) },
      candidate: { root: "/candidate", sourceFingerprint: "3".repeat(64), buildFingerprint: "4".repeat(64) } },
    targets: targets.slice(0, 2), slots: slots.slice(0, 8), budgets: { searchMs: 14000, confirmationMs: 2000, resultMs: 20000, acceptObservationMs: 3000, rejectObservationMs: 8000 },
    runtime: { nodeVersion: "22.22.1", playwrightVersion: "1.55.1", browserExecutablePath: "/browser", browserExecutableSha256: "5".repeat(64), lockfileSha256: "6".repeat(64) }, holdoutUsedForRepair: false,
  };
  const rows = (plan: CampaignRun["plan"]): AnalyzedRow[] => plan.slots.map(slot => {
    const stages = assessConsentActionStages({} as any);
    return { ...slot, contacted: false, status: "skipped", sourceFingerprint: plan.arms[slot.arm].sourceFingerprint,
      buildFingerprint: plan.arms[slot.arm].buildFingerprint, stages, commonStages: structuredClone(stages), nativeStages: null,
      packetVerified: false, evidenceIssues: [], measurementDisagreements: [] };
  });
  const first: CampaignRun = { plan, planSha256: "a".repeat(64), summarySha256: "b".repeat(64), ledgerSha256: "c".repeat(64),
    rows: rows(plan), claimedSlotIds: [plan.slots[0]!.slotId], continuation: null };
  first.rows[0]!.contacted = true; first.rows[0]!.status = "interrupted";
  const continuationPlan = { ...structuredClone(plan), runId: "continuation", maxContacts: 4, targets: plan.targets.slice(1), slots: plan.slots.slice(4) };
  const continuation: CampaignRun = { plan: continuationPlan, planSha256: "d".repeat(64), summarySha256: "e".repeat(64), ledgerSha256: "f".repeat(64), rows: rows(continuationPlan), claimedSlotIds: [],
    continuation: { schemaVersion: "cmp_paired_continuation.v1", reason: "serialized_optional_undefined_fields_only", reviewedBy: "owner", reviewedAt: "2026-10-29T01:00:00Z",
      review: receipt, previousPlan: { ...receipt, sha256: first.planSha256 }, previousSummary: { ...receipt, sha256: first.summarySha256 },
      previousLedger: { ...receipt, sha256: first.ledgerSha256 }, previousHalt: receipt, previousPhaseBinding: receipt } };
  const holdoutPlan = { ...structuredClone(plan), runId: "holdout", maxContacts: 4, targets: targets.slice(2), slots: slots.slice(8) };
  holdoutPlan.arms.candidate.sourceFingerprint = "7".repeat(64); holdoutPlan.arms.candidate.buildFingerprint = "8".repeat(64);
  const holdout: CampaignRun = { plan: holdoutPlan, planSha256: "9".repeat(64), summarySha256: "0".repeat(64), ledgerSha256: "1".repeat(64), rows: rows(holdoutPlan), claimedSlotIds: [], continuation: null };
  return { campaign, first, continuation, holdout };
}

test("append-only continuation preserves failed contacts, old skipped rows and reserved cohort denominator", () => {
  const { campaign, first, continuation } = fixture();
  continuation.rows[0]!.contacted = true; continuation.rows[0]!.status = "finished";
  continuation.claimedSlotIds.push(continuation.rows[0]!.slotId);
  const before = JSON.stringify(first), result = joinPairedCampaign(campaign, [first, continuation], weights);
  assert.equal(JSON.stringify(first), before);
  assert.equal(result.totals.planned, 12); assert.equal(result.totals.contacted, 2); assert.equal(result.totals.claimed, 2);
  assert.equal(result.totals.reservedUncontacted, 4); assert.equal(result.totals.reportedNotContacted, 6);
  assert.equal(result.rows[0]!.selected!.status, "interrupted"); assert.equal(result.rows[0]!.lineage.length, 1);
  assert.equal(result.rows[4]!.lineage.length, 2); assert.equal(result.rows[4]!.sourcePlanSha256, continuation.planSha256);
  assert.equal(result.comparisons.length, 1); assert.equal(result.comparisons[0]!.overall.reference.planned, 4);
  assert.equal(result.totals.percentagePointChange, null);
});

test("different candidate builds and phases produce separate comparisons without combined percentages", () => {
  const { campaign, first, continuation, holdout } = fixture();
  const result = joinPairedCampaign(campaign, [first, continuation, holdout], weights);
  assert.equal(result.comparisons.length, 2); assert.equal(result.totals.planned, 12); assert.equal(result.totals.reservedUncontacted, 0);
  assert.equal(result.comparisons[0]!.comparisonIdentity.arms.candidate.buildFingerprint, "4".repeat(64));
  assert.equal(result.comparisons[1]!.comparisonIdentity.arms.candidate.buildFingerprint, "8".repeat(64));
  assert.equal(result.comparisons[0]!.comparisonIdentity.phase, "diagnostic"); assert.equal(result.comparisons[1]!.comparisonIdentity.phase, "holdout");
});

test("no failed, ambiguous or already claimed domain can be retried through continuation", () => {
  const { campaign, first, continuation } = fixture();
  const retry = structuredClone(continuation); retry.plan.targets = first.plan.targets.slice(0, 1); retry.plan.slots = first.plan.slots.slice(0, 4); retry.rows = structuredClone(first.rows.slice(0, 4));
  assert.throws(() => joinPairedCampaign(campaign, [first, retry], weights), /wholly unclaimed|attempted|revisit/);
  const uncertain = structuredClone(first); uncertain.rows[4]!.contacted = null; uncertain.rows[4]!.status = "interrupted";
  assert.throws(() => joinPairedCampaign(campaign, [uncertain, continuation], weights), /attempted or ambiguous/);
});

test("missing, wrong or substituted predecessor receipts cannot select replacement rows", () => {
  const { campaign, first, continuation } = fixture();
  assert.throws(() => joinPairedCampaign(campaign, [first, { ...continuation, continuation: null }], weights), /reviewed instrumentation/);
  const wrong = structuredClone(continuation); wrong.continuation!.previousSummary.sha256 = "0".repeat(64);
  assert.throws(() => joinPairedCampaign(campaign, [first, wrong], weights), /predecessor evidence/);
  assert.throws(() => joinPairedCampaign(campaign, [first, first], weights), /Repeated analysis/);
});

test("continuation cannot hide unresolved targets or mix a new runtime into the diagnostic comparison", () => {
  const { campaign, first, continuation } = fixture();
  const omitted = structuredClone(continuation); omitted.plan.slots = omitted.plan.slots.slice(0, 2); omitted.rows = omitted.rows.slice(0, 2);
  assert.throws(() => joinPairedCampaign(campaign, [first, omitted], weights), /every wholly unclaimed/);
  const changed = structuredClone(continuation); changed.plan.arms.candidate.buildFingerprint = "0".repeat(64);
  assert.throws(() => joinPairedCampaign(campaign, [first, changed], weights), /change runtime arms/);
  const substituted = structuredClone(continuation); substituted.rows[0]!.url = "https://other.example/";
  assert.throws(() => joinPairedCampaign(campaign, [first, substituted], weights), /introduced new|frozen campaign/);
});

test("claimed slots outside supplied rows and campaign cap drift fail closed", () => {
  const { campaign, first } = fixture();
  assert.throws(() => joinPairedCampaign({ ...campaign, maxContacts: 11 }, [first], weights), /exceed cap/);
  assert.throws(() => joinPairedCampaign(campaign, [{ ...first, claimedSlotIds: ["absent"] }], weights), /Claim retried or outside/);
  assert.throws(() => joinPairedCampaign(campaign, [{ ...first, claimedSlotIds: [] }], weights), /Contact has no/);
});

test("artifact driver verifies original plan, ledger, canonical analysis and shared claim source", t => {
  const dir = mkdtempSync(join(tmpdir(), "cmp-campaign-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const write = (name: string, value: unknown) => {
    const path = join(dir, name), bytes = JSON.stringify(value); writeFileSync(path, bytes);
    return { path, sha256: sha(bytes), bytes: Buffer.byteLength(bytes) };
  };
  const { campaign, first } = fixture(); campaign.outputPath = join(dir, "campaign"); mkdirSync(join(campaign.outputPath, "claims"), { recursive: true });
  first.plan.campaign = write("campaign.json", campaign);
  first.plan.historicalBaseline = write("baseline.json", { providers: weights });
  Object.assign(first.plan.eligibility, write("eligibility.json", { eligible: true }));
  const planRef = write("plan.json", first.plan), row = first.rows[0]!;
  row.scanId = "failed-session"; row.dispatchTargetSha256 = sha(new URL(row.url).toString());
  const identity = { slotId: row.slotId, scanId: row.scanId, url: row.url, action: row.action, arm: row.arm,
    sourceFingerprint: row.sourceFingerprint, buildFingerprint: row.buildFingerprint, dispatchTargetSha256: row.dispatchTargetSha256, planSha256: planRef.sha256 };
  const time = "2026-10-29T01:00:00Z", claim = { ...identity, claimedAt: time };
  const claimRef = write("claim.json", claim), contactRef = write("contact.json", { ...identity, at: time });
  const sharedPath = join(campaign.outputPath, "claims", row.slotId + ".json"); writeFileSync(sharedPath, JSON.stringify(claim));
  const ledger = write("ledger.json", { schemaVersion: "cmp_paired_local_contact_ledger.v1", planSha256: planRef.sha256,
    events: [{ ...identity, event: "claimed", time, source: claimRef }, { ...identity, event: "contact_started", time, source: contactRef }] });
  row.contactLedgerReceipt = { ledgerSha256: ledger.sha256, eventIndex: 1 };
  const summary = write("summary.json", { schemaVersion: "cmp_paired_runtime_summary.v1", planSha256: planRef.sha256, localContactLedger: ledger, claimedSlots: 1, rows: first.rows });
  const input = write("input.json", { schemaVersion: "cmp_paired_campaign_analysis_input.v1", campaign: first.plan.campaign, runs: [{ plan: planRef, summary }] });
  const before = readFileSync(summary.path, "utf8"), report = buildCampaignComparison(input.path, join(dir, "analysis"));
  assert.equal(report.totals.planned, 12); assert.equal(report.totals.contacted, 1); assert.equal(report.totals.reservedUncontacted, 4);
  assert.equal(report.sharedClaims.length, 1); assert.equal(readFileSync(summary.path, "utf8"), before);
  writeFileSync(sharedPath, JSON.stringify({ ...claim, scanId: "wrong-session" }));
  assert.throws(() => buildCampaignComparison(input.path, join(dir, "bad-analysis")), /Shared claim.*wrong binding/);
});
