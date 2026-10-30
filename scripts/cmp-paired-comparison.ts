import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assessConsentActionStages, CONSENT_ACTION_STAGE_KEYS, CONSENT_ACTION_EVIDENCE_STAGE_KEYS,
  postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema,
  postAcceptReportProjectionSchema, postRefusalReportProjectionSchema,
  projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport,
  type ConsentActionStages,
} from "../packages/certscore-contracts/src/index";

export type FileRef = { path: string; sha256: string; bytes: number };
export type Arm = "reference" | "candidate";
type Phase = "diagnostic" | "holdout";
type Action = "accept" | "reject";
type Build = { root: string; sourceFingerprint: string; buildFingerprint: string };
export type PairedSlot = {
  slotId: string; pairId: string; targetId: string; url: string; action: Action;
  arm: Arm; providerStratum: string; phase: Phase;
};
export type PairedPlan = {
  schemaVersion: "cmp_paired_runtime_plan.v1"; runId: string; maxContacts: number; concurrency: number;
  historicalBaseline: FileRef;
  eligibility: { path: string; sha256: string; bytes?: number; checkedAt: string; expiresAt: string };
  arms: Record<Arm, Build>;
  targets: Array<{ targetId: string; domain?: string; url: string; providerStratum: string; phase: Phase;
    eligible: boolean; eligibilityReason: string; armOrder: Arm[] }>;
  slots: PairedSlot[];
  budgets: { searchMs: number; confirmationMs: number; resultMs: number;
    acceptObservationMs: number; rejectObservationMs: number };
  runtime: { nodeVersion: string; playwrightVersion: string; browserExecutablePath: string;
    browserExecutableSha256: string; lockfileSha256: string };
  holdoutUsedForRepair?: boolean;
};
export type PairedSummaryRow = PairedSlot & {
  status: "planned" | "claimed" | "finished" | "skipped" | "interrupted" | "invalid_evidence";
  contacted: boolean | null; scanId?: string | null;
  packetPath?: string | null; packetSha256?: string | null; packetBytes?: number | null;
  sourceFingerprint: string; buildFingerprint: string;
  dispatchTargetSha256?: string | null;
  nativeProjection?: FileRef | null;
  contactLedgerReceipt?: { ledgerSha256: string; eventIndex: number } | FileRef | null;
  reason?: string | null; noGo?: boolean | null; limitations?: string[];
};
export type AnalyzedRow = PairedSummaryRow & {
  stages: ConsentActionStages; evidenceIssues: string[]; packetVerified: boolean;
  commonStages: ConsentActionStages; nativeStages: ConsentActionStages | null;
  measurementDisagreements: string[];
};
export type HistoricalWeight = { provider: string; completedClicks: number };
const arms: Arm[] = ["reference", "candidate"];
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const unknownStages = () => assessConsentActionStages({} as Parameters<typeof assessConsentActionStages>[0]);
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw Error(message); }
const pct = (numerator: number, denominator: number) => denominator ? 100 * numerator / denominator : null;
const difference = (before: number | null, after: number | null) => before === null || after === null ? null : after - before;
const site = (row: { url: string }) => new URL(row.url).hostname;
const counts = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]));

function readVerified(ref: FileRef, base: string): Buffer {
  assert(ref && typeof ref.path === "string" && HASH.test(ref.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0, "Invalid file receipt");
  const bytes = readFileSync(isAbsolute(ref.path) ? ref.path : resolve(base, ref.path));
  assert(bytes.length === ref.bytes && sha256(bytes) === ref.sha256, `File hash/size mismatch: ${ref.path}`);
  return bytes;
}

function verifierIdentity() {
  const root = fileURLToPath(new URL("../packages/certscore-contracts/src/", import.meta.url));
  const files: Record<string, string> = {};
  const walk = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) walk(join(directory, entry.name), prefix + entry.name + "/");
      else if (entry.isFile()) files[prefix + entry.name] = sha256(readFileSync(join(directory, entry.name)));
    }
  };
  walk(root, "");
  return { root, contractSourceFingerprint: sha256(JSON.stringify(files)), files,
    analysisSourceSha256: sha256(readFileSync(fileURLToPath(import.meta.url))) };
}

/** Provider strata are fixed before contact. Action-time attribution is a separate result. */
export function validatePairedPlan(plan: PairedPlan, weights: HistoricalWeight[]) {
  assert(plan.schemaVersion === "cmp_paired_runtime_plan.v1", "Unsupported plan schema");
  assert(typeof plan.runId === "string" && plan.runId.length > 0, "Missing run identity");
  assert(Number.isSafeInteger(plan.maxContacts) && plan.maxContacts > 0 && plan.maxContacts <= 120, "Invalid contact cap");
  assert(Number.isSafeInteger(plan.concurrency) && plan.concurrency >= 1 && plan.concurrency <= 2, "Invalid concurrency cap");
  assert(weights.length > 0 && new Set(weights.map(row => row.provider)).size === weights.length &&
    weights.every(row => typeof row.provider === "string" && Number.isSafeInteger(row.completedClicks) && row.completedClicks > 0) &&
    weights.reduce((sum, row) => sum + row.completedClicks, 0) === 1576, "Historical weights must reconcile to the fixed 1,576 actions");
  assert(Object.keys(plan.arms).length === 2, "Exactly two arms required");
  for (const arm of arms) assert(plan.arms[arm] && HASH.test(plan.arms[arm].sourceFingerprint) && HASH.test(plan.arms[arm].buildFingerprint), "Missing exact arm source/build identity");
  assert(plan.arms.reference.sourceFingerprint !== plan.arms.candidate.sourceFingerprint || plan.arms.reference.buildFingerprint !== plan.arms.candidate.buildFingerprint, "Reference and candidate must identify different builds");
  const expectedBudget = { searchMs: 14000, confirmationMs: 2000, resultMs: 20000, acceptObservationMs: 3000, rejectObservationMs: 8000 };
  for (const [key, limit] of Object.entries(expectedBudget)) assert(plan.budgets?.[key as keyof typeof expectedBudget] === limit, `Unexpected capture budget: ${key}`);
  assert(plan.runtime && /^v?2[234]\./.test(plan.runtime.nodeVersion) && HASH.test(plan.runtime.browserExecutableSha256) && HASH.test(plan.runtime.lockfileSha256), "Missing supported runtime/browser identity");
  assert(Array.isArray(plan.targets) && plan.targets.length > 0 && plan.targets.length <= 30 && Array.isArray(plan.slots) && plan.slots.length > 0, "Missing or over-cap frozen target/slot cohort");
  assert(plan.slots.length <= plan.maxContacts, "Planned slots exceed contact cap");
  const targets = new Map(plan.targets.map(target => [target.targetId, target]));
  assert(targets.size === plan.targets.length, "Duplicate target identity");
  const sitePhases = new Map<string, string>();
  for (const target of plan.targets) {
    const url = new URL(target.url);
    assert(url.protocol === "https:" && !url.username && !url.password && !url.hash, "Invalid public target URL");
    assert(["diagnostic", "holdout"].includes(target.phase), "Invalid phase");
    assert(weights.some(row => row.provider === target.providerStratum), "Unknown historical provider stratum");
    assert(target.armOrder.length === 2 && new Set(target.armOrder).size === 2 && target.armOrder.every(arm => arms.includes(arm)), "Invalid paired arm order");
    const siteCluster = target.domain ?? url.hostname;
    assert(url.hostname === siteCluster || url.hostname.endsWith("." + siteCluster), "Target/registrable domain mismatch");
    const priorPhase = sitePhases.get(siteCluster);
    assert(!priorPhase || priorPhase === target.phase, "Same site cannot cross diagnostic/holdout phases");
    sitePhases.set(siteCluster, target.phase);
  }
  const slots = new Set<string>(), pairArms = new Map<string, PairedSlot[]>(), targetActions = new Set<string>();
  for (const slot of plan.slots) {
    assert(!slots.has(slot.slotId), "Duplicate slot identity"); slots.add(slot.slotId);
    assert(slot.slotId && slot.pairId && ["accept", "reject"].includes(slot.action) && arms.includes(slot.arm), "Invalid slot identity/action/arm");
    const target = targets.get(slot.targetId);
    assert(target && ["url", "phase", "providerStratum"].every(key => slot[key as "url"] === target[key as "url"]), "Slot/target identity mismatch");
    const pair = pairArms.get(slot.pairId) ?? []; pair.push(slot); pairArms.set(slot.pairId, pair);
    const key = JSON.stringify([slot.targetId, slot.action, slot.arm]);
    assert(!targetActions.has(key), "Duplicate target/action/arm"); targetActions.add(key);
  }
  for (const pair of pairArms.values()) assert(pair.length === 2 && new Set(pair.map(row => row.arm)).size === 2 &&
    ["targetId", "url", "action", "providerStratum", "phase"].every(key => pair[0]![key as "url"] === pair[1]![key as "url"]), "Incomplete or mismatched planned pair");
}

export function validatePairedSummary(plan: PairedPlan, rows: PairedSummaryRow[]) {
  assert(Array.isArray(rows) && rows.length === plan.slots.length, "Summary must retain every planned slot");
  const planned = new Map(plan.slots.map(slot => [slot.slotId, slot])), seen = new Set<string>();
  for (const row of rows) {
    assert(!seen.has(row.slotId), "Duplicate summary slot"); seen.add(row.slotId);
    const slot = planned.get(row.slotId);
    assert(slot && ["pairId", "targetId", "url", "action", "arm", "providerStratum", "phase"].every(key => row[key as "url"] === slot[key as "url"]), "Summary/frozen slot identity mismatch");
    assert(row.sourceFingerprint === plan.arms[row.arm].sourceFingerprint && row.buildFingerprint === plan.arms[row.arm].buildFingerprint, "Mixed or incorrect source/build identity");
    assert(["planned", "claimed", "finished", "skipped", "interrupted", "invalid_evidence"].includes(row.status) && [true, false, null].includes(row.contacted), "Invalid contact/status state");
    assert(!(row.status === "skipped" && row.contacted === true), "Contacted row cannot be skipped");
    assert(!(row.status === "planned" && row.contacted !== false && row.contacted !== null), "Unstarted slot cannot claim contact");
    assert(!(row.packetPath && row.contacted !== true), "Packet cannot be attributed to an uncontacted or unknown slot");
    if (row.contacted === true) assert(plan.targets.find(target => target.targetId === row.targetId)?.eligible === true, "Ineligible target was contacted");
  }
  assert(rows.filter(row => row.contacted !== false).length <= plan.maxContacts, "Known plus possible contacts exceed cap");
}

function tri(values: Array<boolean | null>) {
  return { verified: values.filter(value => value === true).length, notVerified: values.filter(value => value === false).length, unknown: values.filter(value => value === null).length };
}
export function reconcileArmStages(common: ConsentActionStages, native: ConsentActionStages | null) {
  if (!native) {
    // Missing arm-native measurement does not erase an independently verified
    // completed click from the denominator. Its comparative decision is unknown.
    const stages = structuredClone(common); stages.measures.decisionVerified = null; stages.outcome = "unknown";
    return { stages, disagreements: ["native_projection_unavailable"] };
  }
  const stages = structuredClone(common), disagreements: string[] = [];
  for (const key of CONSENT_ACTION_STAGE_KEYS) if (common.measures[key] !== native.measures[key]) {
    disagreements.push(`measures.${key}`); stages.measures[key] = null;
  }
  for (const key of CONSENT_ACTION_EVIDENCE_STAGE_KEYS) if (common.evidenceStages[key] !== native.evidenceStages[key]) {
    disagreements.push(`evidenceStages.${key}`); stages.evidenceStages[key] = null;
  }
  if (common.evidenceStages.registrationStatus !== native.evidenceStages.registrationStatus) {
    disagreements.push("registrationStatus"); stages.evidenceStages.registrationStatus = null;
  }
  if (common.provider !== native.provider) { disagreements.push("provider"); stages.provider = null; }
  if (common.outcome !== native.outcome) { disagreements.push("outcome"); stages.outcome = "unknown"; }
  if (disagreements.some(key => ["measures.decisionVerified", "measures.clickCompleted", "evidenceStages.notificationAcknowledged"].includes(key))) stages.measures.decisionVerified = null;
  return { stages, disagreements };
}
function decision(row: AnalyzedRow): boolean | null {
  // Notifications never become decisions, even if a contradictory input claims one.
  if (row.stages.outcome === "notification_acknowledged" || row.stages.evidenceStages.notificationAcknowledged === true) return false;
  if (row.stages.measures.decisionVerified === true && row.stages.measures.clickCompleted !== true) return null;
  return row.stages.measures.decisionVerified;
}
function summarizeArm(rows: AnalyzedRow[]) {
  const contacts = rows.filter(row => row.contacted === true);
  const completed = contacts.filter(row => row.stages.measures.clickCompleted === true);
  const confirmed = completed.filter(row => decision(row) === true).length;
  const unconfirmed = completed.filter(row => decision(row) === false && row.stages.evidenceStages.registrationStatus === "unconfirmed").length;
  const observed = contacts.filter(row => row.stages.measures.observationCompleted === true).length;
  return {
    planned: rows.length, contacted: contacts.length, notContacted: rows.filter(row => row.contacted === false).length,
    contactUnknown: rows.filter(row => row.contacted === null).length,
    completed: completed.length, confirmed, unconfirmed, unresolvedCompleted: completed.length - confirmed - unconfirmed,
    notCompleted: contacts.filter(row => row.stages.measures.clickCompleted === false).length,
    completionUnknown: contacts.filter(row => row.stages.measures.clickCompleted === null).length,
    unresolvedContacted: contacts.length - confirmed - unconfirmed,
    initialConfirmed: contacts.filter(row => row.stages.evidenceStages.initialChoiceRegistrationSupported === true && decision(row) === true).length,
    terminalVerified: contacts.filter(row => row.stages.evidenceStages.terminalChoiceStateVerified === true && decision(row) === true).length,
    terminalOnlyConfirmed: contacts.filter(row => row.stages.evidenceStages.terminalChoiceStateVerified === true && row.stages.evidenceStages.initialChoiceRegistrationSupported !== true && decision(row) === true).length,
    notificationAcknowledged: contacts.filter(row => row.stages.evidenceStages.notificationAcknowledged === true).length,
    observed, noGo: contacts.filter(row => row.noGo === true).length,
    statuses: counts(rows.map(row => row.status)), registrationStatuses: counts(contacts.map(row => row.stages.evidenceStages.registrationStatus ?? "unknown")),
    diagnosticReasons: counts(contacts.flatMap(row => row.commonStages.diagnosticReasons)),
    categoryChecks: counts(contacts.map(row => row.commonStages.categoryCheck)),
    stages: Object.fromEntries(CONSENT_ACTION_STAGE_KEYS.map(key => [key, tri(contacts.map(row => row.stages.measures[key]))])),
    evidenceStages: Object.fromEntries(CONSENT_ACTION_EVIDENCE_STAGE_KEYS.map(key => [key, tri(contacts.map(row => row.stages.evidenceStages[key]))])),
    evidenceIssues: counts(rows.flatMap(row => row.evidenceIssues)),
    nativeCommonDisagreements: counts(rows.flatMap(row => row.measurementDisagreements)),
    nativeConfirmed: contacts.filter(row => row.nativeStages?.measures.decisionVerified === true).length,
    commonVerifierConfirmed: contacts.filter(row => row.commonStages.measures.decisionVerified === true).length,
    rates: { confirmedPerCompletedPct: pct(confirmed, completed.length), confirmedPerContactedPct: pct(confirmed, contacts.length),
      confirmedPerPlannedPct: pct(confirmed, rows.length), observationPerContactedPct: pct(observed, contacts.length),
      completionPerContactedPct: pct(completed.length, contacts.length) },
  };
}
type ArmSummary = ReturnType<typeof summarizeArm>;
type Rate = keyof ArmSummary["rates"];
function compareArms(rows: AnalyzedRow[]) {
  const reference = summarizeArm(rows.filter(row => row.arm === "reference"));
  const candidate = summarizeArm(rows.filter(row => row.arm === "candidate"));
  return { reference, candidate, percentagePointChange: Object.fromEntries(Object.keys(reference.rates).map(key => [key, difference(reference.rates[key as Rate], candidate.rates[key as Rate])])) };
}

function summarizePairs(rows: AnalyzedRow[]) {
  return [...new Set(rows.map(row => row.pairId))].map(pairId => {
    const reference = rows.find(row => row.pairId === pairId && row.arm === "reference")!;
    const candidate = rows.find(row => row.pairId === pairId && row.arm === "candidate")!;
    const bothContacted = reference.contacted === true && candidate.contacted === true;
    const before = reference.contacted === true ? decision(reference) : null;
    const after = candidate.contacted === true ? decision(candidate) : null;
    const state = !bothContacted ? "incomplete_contact_pair" : before === null || after === null ? "unknown_evidence_pair"
      : before === after ? before ? "both_confirmed" : "neither_confirmed" : after ? "gained" : "lost";
    return { pairId, targetId: reference.targetId, url: reference.url, action: reference.action,
      providerStratum: reference.providerStratum, phase: reference.phase, state, bothContacted,
      before, after, stableVerifiedProvider: reference.stages.provider !== null && reference.stages.provider === candidate.stages.provider,
      referenceSlotId: reference.slotId, candidateSlotId: candidate.slotId,
      referencePacketSha256: reference.packetSha256 ?? null, candidatePacketSha256: candidate.packetSha256 ?? null,
      referenceIssues: reference.evidenceIssues, candidateIssues: candidate.evidenceIssues };
  });
}

/** Analysis-only: unknown or unrepresented strata are never assigned zero performance. */
export function summarizePairedComparison(plan: PairedPlan, rows: AnalyzedRow[], weights: HistoricalWeight[]) {
  validatePairedPlan(plan, weights); validatePairedSummary(plan, rows);
  const pairs = summarizePairs(rows);
  const providers = weights.map(weight => ({ ...weight, historicalWeight: weight.completedClicks / 1576,
    represented: plan.slots.some(slot => slot.providerStratum === weight.provider),
    ...compareArms(rows.filter(row => row.providerStratum === weight.provider)),
    pairStates: counts(pairs.filter(row => row.providerStratum === weight.provider).map(row => row.state)),
    gainedSites: [...new Set(pairs.filter(row => row.providerStratum === weight.provider && row.state === "gained").map(site))].sort(),
    lostSites: [...new Set(pairs.filter(row => row.providerStratum === weight.provider && row.state === "lost").map(site))].sort() }));
  const representedWeight = providers.filter(row => row.represented).reduce((sum, row) => sum + row.historicalWeight, 0);
  const weighted = (metric: Rate) => {
    const measurable = providers.filter(row => row.represented && row.reference.rates[metric] !== null && row.candidate.rates[metric] !== null);
    const measurableWeight = measurable.reduce((sum, row) => sum + row.historicalWeight, 0);
    const allSelectedStrataMeasurable = providers.filter(row => row.represented).length === measurable.length;
    // Partial sums are diagnostics. Headline selected-stratum rates require every selected stratum in both arms.
    const sum = (arm: Arm) => measurable.reduce((total, row) => total + row.historicalWeight * row[arm].rates[metric]!, 0);
    const reference = representedWeight && allSelectedStrataMeasurable ? sum("reference") / representedWeight : null;
    const candidate = representedWeight && allSelectedStrataMeasurable ? sum("candidate") / representedWeight : null;
    return { historicalDenominator: 1576, representedWeight, measurableWeight, allSelectedStrataMeasurable,
      unrepresentedProviders: providers.filter(row => !row.represented).map(row => row.provider),
      selectedStrataWithoutBothDenominators: providers.filter(row => row.represented && (row.reference.rates[metric] === null || row.candidate.rates[metric] === null)).map(row => row.provider),
      selectedStrataReferencePct: reference, selectedStrataCandidatePct: candidate,
      selectedStrataChangePp: difference(reference, candidate), fullPopulationEstimatePct: null };
  };
  const gainedSites = [...new Set(pairs.filter(pair => pair.state === "gained").map(pair => site(pair)))].sort();
  const lostSites = [...new Set(pairs.filter(pair => pair.state === "lost").map(pair => site(pair)))].sort();
  const bothContactedIds = new Set(pairs.filter(pair => pair.bothContacted).map(pair => pair.pairId));
  const weightedMetrics = Object.fromEntries(Object.keys(providers[0]!.reference.rates).map(key => [key, weighted(key as Rate)]));
  const conditional = weightedMetrics.confirmedPerCompletedPct!;
  const contact = weightedMetrics.confirmedPerContactedPct!;
  const observation = weightedMetrics.observationPerContactedPct!;
  const qualityIssues = rows.flatMap(row => [...row.evidenceIssues, ...row.measurementDisagreements]);
  const allPairsComplete = pairs.every(pair => pair.bothContacted && pair.state !== "unknown_evidence_pair");
  return {
    overall: compareArms(rows), providers, weightedMetrics,
    phases: ["diagnostic", "holdout"].map(phase => ({ phase, ...compareArms(rows.filter(row => row.phase === phase)),
      usableAsUntouchedHoldout: phase === "holdout" && plan.holdoutUsedForRepair === false })),
    observedActionProviders: [...new Set(rows.map(row => row.stages.provider ?? "CMP identity unverified"))].sort().map(provider => ({ provider,
      interpretation: "Descriptive action-bound attribution; selection-time weights remain fixed.",
      ...compareArms(rows.filter(row => (row.stages.provider ?? "CMP identity unverified") === provider)) })),
    paired: { planned: pairs.length, states: counts(pairs.map(pair => pair.state)), bothContacted: bothContactedIds.size,
      matchedContactComparison: compareArms(rows.filter(row => bothContactedIds.has(row.pairId))),
      gainedSites, lostSites, sitesWithBothGainAndLoss: gainedSites.filter(value => lostSites.includes(value)), pairs },
    preliminaryTarget: { targetPp: 10, observedSelectedStrataChangePp: conditional.selectedStrataChangePp,
      met: allPairsComplete && qualityIssues.length === 0 && conditional.selectedStrataChangePp !== null && conditional.selectedStrataChangePp >= 10 &&
        contact.selectedStrataChangePp !== null && contact.selectedStrataChangePp >= 0 && observation.selectedStrataChangePp !== null && observation.selectedStrataChangePp >= 0,
      interpretation: "Engineering target only: at least +10 percentage points among completed actions, without lower confirmation/contact or observation/contact rates, with complete known pairs and verified provenance. A small selected cohort does not establish statistical significance, population uplift, or production improvement." },
    limitations: ["Reference/candidate source fingerprints identify one cumulative comparison; different builds require separate manifests and reports.",
      "Fixed weights describe the historical completed-action provider mix, not a random sample of live contacts. Unrepresented strata have no estimate.",
      "Current action provider attribution may differ from the frozen historical selection stratum; neither identity uncertainty nor a completed click confirms registration.",
      "Initial registration, later terminal state, and notification acknowledgment are separate. A terminal read never backdates initial choice registration.",
      "Native arm projections and the common current verifier are retained separately. Disagreement is measurement-limited; trusted confirmation requires agreement and does not reconstruct absent historical witnesses.",
      "Unknown evidence and incomplete contacts remain in the planned cohort; complete-pair results are secondary and cannot replace the full cohort.",
      "Contacts use conservative durable pre-navigation markers. A session interrupted before its first request can count as contacted; a marker never establishes observation or action completion.",
      "Holdout sites and all their actions must be reserved before visits; any result used for repair makes that holdout diagnostic. No outcome-based replacement or retry is allowed."],
  };
}

export function buildPairedComparison(planPath: string, summaryPath: string, out: string) {
  assert(!existsSync(out), "Choose a new immutable output directory");
  const verifier = verifierIdentity();
  const planBytes = readFileSync(planPath), summaryBytes = readFileSync(summaryPath);
  const plan = JSON.parse(planBytes.toString()) as PairedPlan;
  const summary = JSON.parse(summaryBytes.toString());
  assert(summary.schemaVersion === "cmp_paired_runtime_summary.v1" && summary.planSha256 === sha256(planBytes), "Summary/frozen plan hash mismatch");
  const planBase = resolve(planPath, ".."), summaryBase = resolve(summaryPath, "..");
  const baseline = JSON.parse(readVerified(plan.historicalBaseline, planBase).toString());
  const weights: HistoricalWeight[] = baseline.providers.map((row: HistoricalWeight) => ({ provider: row.provider, completedClicks: row.completedClicks }));
  const eligibilityPath = isAbsolute(plan.eligibility.path) ? plan.eligibility.path : resolve(planBase, plan.eligibility.path);
  const eligibilityBytes = readFileSync(eligibilityPath);
  assert(sha256(eligibilityBytes) === plan.eligibility.sha256 && (plan.eligibility.bytes === undefined || eligibilityBytes.length === plan.eligibility.bytes), "Eligibility freeze hash/size mismatch");
  const checkedAt = Date.parse(plan.eligibility.checkedAt), expiresAt = Date.parse(plan.eligibility.expiresAt);
  assert(Number.isFinite(checkedAt) && Number.isFinite(expiresAt) && checkedAt < expiresAt && expiresAt - checkedAt <= 86400000, "Eligibility validity must be at most 24 hours");
  const contactLedgerBytes = readVerified(summary.localContactLedger, summaryBase);
  const ledgerValue = JSON.parse(contactLedgerBytes.toString());
  const ledgerEvents = Array.isArray(ledgerValue) ? ledgerValue : ledgerValue.events;
  assert(Array.isArray(ledgerEvents), "Invalid local contact ledger");
  assert(ledgerValue.planSha256 === sha256(planBytes), "Local contact ledger/frozen plan hash mismatch");
  validatePairedPlan(plan, weights); validatePairedSummary(plan, summary.rows);
  const contactEvents = ledgerEvents.filter(event => event.event === "contact_started");
  const claimEvents = ledgerEvents.filter(event => event.event === "claimed");
  assert(new Set(claimEvents.map(event => event.slotId)).size === claimEvents.length && claimEvents.length <= plan.maxContacts, "Duplicate or over-cap durable claims");
  assert(claimEvents.every(event => summary.rows.some((row: PairedSummaryRow) => row.slotId === event.slotId)), "Durable claim outside frozen cohort");
  if (summary.claimedSlots !== undefined) assert(summary.claimedSlots === claimEvents.length, "Claimed-slot summary/ledger mismatch");
  assert(new Set(contactEvents.map(event => event.slotId)).size === contactEvents.length, "Duplicate contact event for a frozen slot");
  assert(contactEvents.length <= plan.maxContacts && contactEvents.every(event => summary.rows.some((row: PairedSummaryRow) => row.slotId === event.slotId && row.contacted === true)), "Contact ledger has omitted or over-cap contacts");
  assert(contactEvents.every(event => claimEvents.some(claim => claim.slotId === event.slotId && claim.scanId === event.scanId)), "Contact lacks its durable isolated-session claim");
  const seenPackets = new Set<string>(), seenSessions = new Set<string>();
  const rows: AnalyzedRow[] = summary.rows.map((row: PairedSummaryRow) => {
    const issues: string[] = [];
    let stages = unknownStages(), commonStages = unknownStages(), nativeStages: ConsentActionStages | null = null, packetVerified = false;
    if (row.status === "invalid_evidence") issues.push("runner_evidence_invalid");
    if (row.contacted === true) {
      const receipt = row.contactLedgerReceipt;
      if (!receipt) issues.push("contact_ledger_receipt_missing");
      else {
        try {
          const event = "eventIndex" in receipt ? (() => {
            assert(receipt.ledgerSha256 === sha256(contactLedgerBytes) && Number.isSafeInteger(receipt.eventIndex) && receipt.eventIndex >= 0, "Contact ledger reference mismatch");
            return ledgerEvents[receipt.eventIndex];
          })() : JSON.parse(readVerified(receipt, summaryBase).toString());
          assert(event && event.event === "contact_started" && ["slotId", "url", "action", "arm", "scanId", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256"].every(key => event[key] === row[key as keyof PairedSummaryRow]), "Contact receipt does not bind exact slot/session/source");
          assert(row.dispatchTargetSha256 === sha256(new URL(row.url).toString()), "Initial dispatch target hash mismatch");
          const contactAt = Date.parse(event.time);
          assert(Number.isFinite(contactAt) && contactAt >= checkedAt && contactAt < expiresAt, "Contact was outside eligibility validity");
          assert(event.source, "Durable contact source missing");
          const contactSource = JSON.parse(readVerified(event.source, summaryBase).toString());
          assert(contactSource.planSha256 === sha256(planBytes) && ["slotId", "url", "action", "arm", "scanId", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256"].every(key => contactSource[key] === event[key]), "Durable contact source binding mismatch");
          assert(contactSource.at === event.time, "Durable contact timestamp mismatch");
          const claim = claimEvents.find(claim => claim.slotId === row.slotId)!;
          const claimSource = JSON.parse(readVerified(claim.source, summaryBase).toString());
          assert(claimSource.planSha256 === sha256(planBytes) && ["slotId", "url", "action", "arm", "scanId", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256"].every(key => claimSource[key] === event[key]), "Durable claim source binding mismatch");
          assert(Number.isFinite(Date.parse(claimSource.claimedAt)) && Date.parse(claimSource.claimedAt) <= contactAt, "Invalid claim/contact ordering");
        } catch { issues.push("contact_ledger_receipt_unverified"); }
      }
    }
    if (row.packetPath) {
      try {
        const bytes = readVerified({ path: row.packetPath, sha256: row.packetSha256!, bytes: row.packetBytes! }, summaryBase);
        assert(!seenPackets.has(row.packetSha256!), "Reused packet"); seenPackets.add(row.packetSha256!);
        assert(typeof row.scanId === "string" && row.scanId.length > 0 && !seenSessions.has(row.scanId), "Reused or missing isolated session"); seenSessions.add(row.scanId);
        const raw = JSON.parse(bytes.toString());
        const packet = row.action === "accept" ? postAcceptEvidencePacketSchema.parse(raw) : postRefusalEvidencePacketSchema.parse(raw);
        assert(packet.parentScanId === row.scanId && packet.consentAction === row.action, "Packet session/action mismatch");
        const normalized = new URL(row.url); normalized.search = ""; normalized.hash = "";
        assert(packet.normalizedUrl === normalized.toString(), "Packet starting target mismatch");
        // targetUrl/exactTargetSha256 describe the resolved authorized document.
        // The canonical projector validates that action proof; never substitute
        // the starting URL's hash for an authorized redirect's target hash.
        const projection = row.action === "accept"
          ? projectPostAcceptEvidenceForReport({ packet: packet as Parameters<typeof projectPostAcceptEvidenceForReport>[0]["packet"], packetSha256: row.packetSha256! })
          : projectPostRefusalEvidenceForReport({ packet: packet as Parameters<typeof projectPostRefusalEvidenceForReport>[0]["packet"], packetSha256: row.packetSha256! });
        commonStages = assessConsentActionStages(projection); packetVerified = true;
      } catch (error) { issues.push(`packet_unverified:${error instanceof Error ? error.message.split("\n")[0] : "unknown"}`); }
    } else if (row.contacted === true) issues.push("retained_packet_unavailable");
    if (row.nativeProjection && packetVerified) {
      try {
        const raw = JSON.parse(readVerified(row.nativeProjection, summaryBase).toString());
        const projection = row.action === "accept" ? postAcceptReportProjectionSchema.parse(raw) : postRefusalReportProjectionSchema.parse(raw);
        assert(projection.packetSha256 === row.packetSha256, "Native projection source mismatch");
        nativeStages = assessConsentActionStages(projection);
      } catch { issues.push("native_projection_unverified"); }
    }
    const reconciliation = row.contacted === true ? reconcileArmStages(commonStages, nativeStages) : { stages: unknownStages(), disagreements: [] };
    stages = issues.some(issue => issue !== "native_projection_unverified") ? unknownStages() : reconciliation.stages;
    return { ...row, stages, commonStages, nativeStages, measurementDisagreements: reconciliation.disagreements,
      evidenceIssues: issues, packetVerified };
  });
  const report = { policyVersion: "cmp_paired_comparison.v1", generatedAt: new Date().toISOString(),
    runId: plan.runId, source: { plan: { path: resolve(planPath), sha256: sha256(planBytes), bytes: planBytes.length },
      summary: { path: resolve(summaryPath), sha256: sha256(summaryBytes), bytes: summaryBytes.length },
      historicalBaseline: plan.historicalBaseline, eligibility: plan.eligibility, localContactLedger: summary.localContactLedger,
      arms: plan.arms, commonVerifier: verifier, runtime: plan.runtime, budgets: plan.budgets },
    ...summarizePairedComparison(plan, rows, weights), rows };
  assert(JSON.stringify(verifierIdentity()) === JSON.stringify(verifier), "Common verifier source changed during analysis");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "comparison.json"), JSON.stringify(report, null, 2) + "\n");
  const header = ["Provider stratum", "Historical actions", "Represented", "Reference planned", "Candidate planned", "Reference contacts", "Candidate contacts", "Reference completed", "Candidate completed", "Reference confirmed", "Candidate confirmed", "Confirmed/completed change pp", "Confirmed/contacted change pp", "Observation/contacted change pp"];
  const cells = report.providers.map(row => [row.provider, row.completedClicks, row.represented, row.reference.planned, row.candidate.planned,
    row.reference.contacted, row.candidate.contacted, row.reference.completed, row.candidate.completed, row.reference.confirmed, row.candidate.confirmed,
    row.percentagePointChange.confirmedPerCompletedPct, row.percentagePointChange.confirmedPerContactedPct, row.percentagePointChange.observationPerContactedPct]);
  writeFileSync(join(out, "providers.csv"), [header, ...cells].map(row => row.map(value => '"' + (value === null ? "unknown" : String(value)).replace(/"/g, '""') + '"').join(",")).join("\n") + "\n");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [plan, summary, option, out] = process.argv.slice(2);
  assert(plan && summary && option === "--out" && out, "Usage: cmp-paired-comparison.ts <plan.json> <summary.json> --out <new directory>");
  const report = buildPairedComparison(plan, summary, out);
  console.log(JSON.stringify({ runId: report.runId, planned: report.rows.length, pairs: report.paired.states, out }));
}
