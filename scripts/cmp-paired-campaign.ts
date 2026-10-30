import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPairedComparison, summarizePairedComparison,
  type AnalyzedRow, type HistoricalWeight, type PairedPlan, type PairedSlot } from "./cmp-paired-comparison";

type Receipt = { path: string; sha256: string; bytes?: number };
type Continuation = {
  schemaVersion: "cmp_paired_continuation.v1"; reason: "serialized_optional_undefined_fields_only";
  reviewedBy: string; reviewedAt: string; review: Receipt; previousPlan: Receipt;
  previousSummary: Receipt; previousLedger: Receipt; previousHalt: Receipt; previousPhaseBinding: Receipt;
};
type CampaignPlan = PairedPlan & { campaign: Receipt; continuation?: Receipt };
export type Campaign = { schemaVersion: "cmp_paired_campaign.v1"; campaignId: string; maxContacts: number;
  outputPath: string; slots: PairedSlot[] };
export type CampaignRun = {
  plan: CampaignPlan; planSha256: string; summarySha256: string; ledgerSha256: string;
  rows: AnalyzedRow[]; claimedSlotIds: string[]; continuation: Continuation | null;
};
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
function requireTrue(condition: unknown, reason: string): asserts condition { if (!condition) throw Error(reason); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value);
}
const sameSlot = (a: PairedSlot, b: PairedSlot) => ["slotId", "pairId", "targetId", "url", "action", "arm", "providerStratum", "phase"].every(key => a[key as keyof PairedSlot] === b[key as keyof PairedSlot]);
function verify(ref: Receipt, base: string) {
  requireTrue(ref && typeof ref.path === "string" && /^[a-f0-9]{64}$/.test(ref.sha256), "Invalid artifact receipt");
  const path = isAbsolute(ref.path) ? ref.path : resolve(base, ref.path), bytes = readFileSync(path);
  requireTrue(hash(bytes) === ref.sha256 && (ref.bytes === undefined || bytes.length === ref.bytes), `Artifact hash/size mismatch: ${path}`);
  return { path, bytes, value: JSON.parse(bytes.toString()) };
}
function buildKey(plan: CampaignPlan, phase: string) {
  return canonical({ phase, arms: Object.fromEntries(["reference", "candidate"].map(arm => {
    const value = plan.arms[arm as "reference"];
    return [arm, { sourceFingerprint: value.sourceFingerprint, buildFingerprint: value.buildFingerprint }];
  })), runtime: plan.runtime, budgets: plan.budgets });
}

/** A selected view is append-only lineage, never a rewrite of the earlier run. */
export function joinPairedCampaign(campaign: Campaign, runs: CampaignRun[], weights: HistoricalWeight[]) {
  requireTrue(campaign.schemaVersion === "cmp_paired_campaign.v1" && Number.isInteger(campaign.maxContacts) && campaign.maxContacts > 0 && campaign.maxContacts <= 120, "Invalid campaign/cap");
  requireTrue(campaign.slots.length <= campaign.maxContacts && new Set(campaign.slots.map(slot => slot.slotId)).size === campaign.slots.length, "Campaign slots exceed cap or repeat");
  const frozen = new Map(campaign.slots.map(slot => [slot.slotId, slot]));
  const history = new Map<string, Array<{ runId: string; planSha256: string; summarySha256: string; row: AnalyzedRow }>>();
  const selected = new Map<string, { run: CampaignRun; row: AnalyzedRow }>();
  const claimedSlots = new Set<string>(), claimedTargets = new Set<string>(), usedPlanHashes = new Set<string>();
  const completedRuns: CampaignRun[] = [];
  for (const run of runs) {
    requireTrue(!usedPlanHashes.has(run.planSha256), "Repeated analysis run"); usedPlanHashes.add(run.planSha256);
    requireTrue(run.rows.length === run.plan.slots.length && new Set(run.rows.map(row => row.slotId)).size === run.rows.length, "Run lost or duplicated planned slots");
    requireTrue(new Set(run.claimedSlotIds).size === run.claimedSlotIds.length, "Duplicate claimed slot within run");
    const overlapping = run.rows.filter(row => selected.has(row.slotId));
    if (overlapping.length) {
      const continuation = run.continuation;
      requireTrue(continuation?.schemaVersion === "cmp_paired_continuation.v1" && continuation.reason === "serialized_optional_undefined_fields_only", "Overlapping slots require reviewed instrumentation continuation");
      const previous = completedRuns.find(old => old.planSha256 === continuation.previousPlan.sha256 && old.summarySha256 === continuation.previousSummary.sha256 && old.ledgerSha256 === continuation.previousLedger.sha256);
      requireTrue(previous, "Continuation predecessor evidence is not present in campaign analysis");
      requireTrue(run.rows.every(row => row.phase === "diagnostic"), "Overlapping continuation must remain diagnostic");
      requireTrue(canonical(previous.plan.arms) === canonical(run.plan.arms) && canonical(previous.plan.runtime) === canonical(run.plan.runtime) && canonical(previous.plan.budgets) === canonical(run.plan.budgets), "Instrumentation continuation cannot change runtime arms or budgets");
      requireTrue(run.rows.every(row => previous.plan.slots.some(slot => sameSlot(row, slot))), "Continuation introduced new diagnostic slots");
      const expected = previous.plan.slots.filter(slot => !claimedTargets.has(slot.targetId));
      requireTrue(expected.length === run.rows.length && expected.every(slot => run.rows.some(row => sameSlot(row, slot))), "Continuation must preserve every wholly unclaimed diagnostic target");
      for (const row of run.rows) {
        const prior = selected.get(row.slotId)?.row;
        requireTrue(prior && prior.contacted === false && ["planned", "skipped"].includes(prior.status) && !prior.packetPath && !claimedSlots.has(row.slotId), "Continuation cannot replace an attempted or ambiguous slot");
        requireTrue(!claimedTargets.has(row.targetId), "Continuation cannot revisit a previously claimed domain");
      }
    }
    for (const row of run.rows) {
      const slot = frozen.get(row.slotId);
      requireTrue(slot && sameSlot(row, slot), "Run changed frozen campaign slot identity/phase/stratum");
      requireTrue(run.plan.slots.some(planned => sameSlot(row, planned)), "Run row does not match its frozen plan");
      const lineage = history.get(row.slotId) ?? [];
      lineage.push({ runId: run.plan.runId, planSha256: run.planSha256, summarySha256: run.summarySha256, row }); history.set(row.slotId, lineage);
      selected.set(row.slotId, { run, row });
    }
    for (const slotId of run.claimedSlotIds) {
      const row = run.rows.find(row => row.slotId === slotId);
      requireTrue(row && !claimedSlots.has(slotId), "Claim retried or outside run");
      claimedSlots.add(slotId); claimedTargets.add(row.targetId);
    }
    requireTrue(run.rows.every(row => row.contacted !== true || run.claimedSlotIds.includes(row.slotId)), "Contact has no campaign claim");
    completedRuns.push(run);
  }
  requireTrue(claimedSlots.size <= campaign.maxContacts, "Shared campaign contact cap exceeded");
  const groups = new Map<string, Array<{ run: CampaignRun; row: AnalyzedRow }>>();
  for (const value of selected.values()) {
    const key = buildKey(value.run.plan, value.row.phase), group = groups.get(key) ?? [];
    group.push(value); groups.set(key, group);
  }
  const comparisons = [...groups].map(([key, values]) => {
    const representative = values[0]!.run.plan, selectedIds = new Set(values.map(value => value.row.slotId));
    const targets = [...new Map(values.flatMap(value => value.run.plan.targets).filter(target => values.some(value => value.row.targetId === target.targetId)).map(target => [target.targetId, target])).values()];
    const plan: PairedPlan = { ...representative, targets, slots: campaign.slots.filter(slot => selectedIds.has(slot.slotId)) };
    const rows = plan.slots.map(slot => values.find(value => value.row.slotId === slot.slotId)!.row);
    requireTrue(rows.length % 2 === 0, "Runtime comparison cannot contain a split pair");
    const result = summarizePairedComparison(plan, rows, weights);
    return { comparisonIdentity: JSON.parse(key), runIds: [...new Set(values.map(value => value.run.plan.runId))], ...result };
  });
  const rows = campaign.slots.map(slot => ({ ...slot, selected: selected.get(slot.slotId)?.row ?? null,
    sourcePlanSha256: selected.get(slot.slotId)?.run.planSha256 ?? null, lineage: history.get(slot.slotId) ?? [],
    state: selected.has(slot.slotId) ? "reported" : "reserved_uncontacted" }));
  const count = (arm?: string) => {
    const subset = rows.filter(row => !arm || row.arm === arm), available = subset.flatMap(row => row.selected ? [row.selected] : []);
    return { planned: subset.length, claimed: subset.filter(row => claimedSlots.has(row.slotId)).length,
      contacted: available.filter(row => row.contacted === true).length,
      contactUnknown: available.filter(row => row.contacted === null).length,
      reportedNotContacted: available.filter(row => row.contacted === false).length,
      reservedUncontacted: subset.filter(row => row.selected === null).length,
      percentagePointChange: null };
  };
  return { campaignId: campaign.campaignId, maxContacts: campaign.maxContacts, totals: count(),
    arms: { reference: count("reference"), candidate: count("candidate") }, comparisons, rows,
    interpretation: "All frozen campaign slots remain. Continuation selects a later record only for previously unclaimed and uncontacted domains; original rows and reports remain in lineage. Percentages are reported separately for each phase and exact runtime build pair. No percentage combines different candidate builds. Runner policy-stop flags can reflect instrumentation failures and do not establish website access restrictions. Reserved slots are not observations." };
}

export function buildCampaignComparison(inputPath: string, out: string) {
  requireTrue(!existsSync(out), "Choose a new immutable output directory");
  const inputBytes = readFileSync(inputPath), input = JSON.parse(inputBytes.toString()), base = dirname(resolve(inputPath));
  requireTrue(input.schemaVersion === "cmp_paired_campaign_analysis_input.v1" && Array.isArray(input.runs) && input.runs.length > 0, "Invalid campaign analysis input");
  const campaignSource = verify(input.campaign, base), campaign = campaignSource.value as Campaign;
  const inputs: Array<{ plan: ReturnType<typeof verify>; summary: ReturnType<typeof verify> }> = input.runs.map((run: { plan: Receipt; summary: Receipt }) => ({ plan: verify(run.plan, base), summary: verify(run.summary, base) }));
  const baselineRef = inputs[0].plan.value.historicalBaseline;
  const baselineSource = verify(baselineRef, dirname(inputs[0].plan.path)), weights: HistoricalWeight[] = baselineSource.value.providers;
  mkdirSync(out, { recursive: true });
  const runs: CampaignRun[] = inputs.map((run, index: number) => {
    const plan = run.plan.value as CampaignPlan, planBase = dirname(run.plan.path);
    requireTrue(plan.campaign.sha256 === input.campaign.sha256, "Plan belongs to a different frozen campaign");
    requireTrue(plan.historicalBaseline.sha256 === baselineRef.sha256, "Historical weights changed between phases");
    let continuation: Continuation | null = null;
    if (plan.continuation) {
      const source = verify(plan.continuation, planBase); continuation = source.value;
      requireTrue(continuation?.schemaVersion === "cmp_paired_continuation.v1" && !!continuation.reviewedBy && Number.isFinite(Date.parse(continuation.reviewedAt)), "Unreviewed continuation receipt");
      const read = (key: "review" | "previousPlan" | "previousSummary" | "previousLedger" | "previousHalt" | "previousPhaseBinding") => verify(continuation![key], dirname(source.path)).value;
      const prior = read("previousPlan"), summary = read("previousSummary"), ledger = read("previousLedger"), halt = read("previousHalt"), phase = read("previousPhaseBinding"), review = read("review");
      const priorHash = continuation.previousPlan.sha256;
      requireTrue([summary, ledger, halt, phase].every(value => value.planSha256 === priorHash) && prior.campaign.sha256 === plan.campaign.sha256, "Continuation predecessor source links disagree");
      requireTrue(summary.halted === true && summary.rows.every((row: AnalyzedRow) => !["planned", "claimed"].includes(row.status)), "Continuation predecessor is not terminal and halted");
      requireTrue(summary.localContactLedger.sha256 === continuation.previousLedger.sha256, "Continuation predecessor ledger receipt mismatch");
      requireTrue(review.policyVersion === "cmp_instrumentation_stop_review.v1" && review.campaignStopped === true && review.terminalProcessExitCode === 1 &&
        review.possibleAdditionalContacts === 0 && review.knownContacts === summary.rows.filter((row: AnalyzedRow) => row.contacted === true).length &&
        review.originalApprovedCap === campaign.maxContacts, "Continuation review does not reconcile contacts and campaign cap");
      requireTrue(typeof halt.reason === "string" && halt.reason.includes("strictly deep-equal") && halt.reason.includes("undefined"), "Continuation halt was not the reviewed serialization defect");
      requireTrue(canonical(prior.arms.reference) === canonical(plan.arms.reference) && canonical(prior.runtime) === canonical(plan.runtime) && canonical(prior.budgets) === canonical(plan.budgets), "Continuation changed reference/runtime/budgets");
    }
    const ledgerSource = verify(run.summary.value.localContactLedger, dirname(run.summary.path));
    const report = buildPairedComparison(run.plan.path, run.summary.path, join(out, `run-${index + 1}`));
    return { plan, planSha256: hash(run.plan.bytes), summarySha256: hash(run.summary.bytes), ledgerSha256: hash(ledgerSource.bytes),
      rows: report.rows, claimedSlotIds: ledgerSource.value.events.filter((event: { event: string }) => event.event === "claimed").map((event: { slotId: string }) => event.slotId), continuation };
  });
  const sharedClaims = readdirSync(join(campaign.outputPath, "claims")).filter(file => file.endsWith(".json")).sort().map(file => {
    const path = join(campaign.outputPath, "claims", file), bytes = readFileSync(path), claim = JSON.parse(bytes.toString());
    const run = runs.find(run => run.planSha256 === claim.planSha256), row = run?.rows.find(row => row.slotId === claim.slotId);
    requireTrue(row && run?.claimedSlotIds.includes(claim.slotId) && ["scanId", "url", "action", "arm", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256"].every(key => row[key as keyof AnalyzedRow] === claim[key]), "Shared claim missing from supplied run evidence or has wrong binding");
    return { path, sha256: hash(bytes), bytes: bytes.length, slotId: claim.slotId };
  });
  requireTrue(sharedClaims.length === runs.reduce((sum, run) => sum + run.claimedSlotIds.length, 0), "Local/shared claim counts disagree");
  const report = { policyVersion: "cmp_paired_campaign_comparison.v1", generatedAt: new Date().toISOString(),
    input: { path: resolve(inputPath), sha256: hash(inputBytes), bytes: inputBytes.length }, campaign: input.campaign,
    sharedClaims, ...joinPairedCampaign(campaign, runs, weights) };
  writeFileSync(join(out, "campaign-comparison.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, option, out] = process.argv.slice(2);
  requireTrue(input && option === "--out" && out, "Usage: cmp-paired-campaign.ts <input.json> --out <new directory>");
  const report = buildCampaignComparison(input, out);
  console.log(JSON.stringify({ campaignId: report.campaignId, totals: report.totals, comparisonGroups: report.comparisons.length, out }));
}
