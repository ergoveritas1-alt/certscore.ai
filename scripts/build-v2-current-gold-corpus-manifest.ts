#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CorpusSource = "consent_dag_expansion_50" | "regulatory_stage1" | "synthetic_stage3";
type Split = "train" | "validation" | "test";
type TargetType = "live_site" | "synthetic_fixture";

interface ExpansionEntry {
  expectedLanes?: string[];
  notes?: string;
  primaryBucket?: string;
  sector?: string;
  seedUrls?: {
    privacyOptOut?: string[];
  };
  url: string;
  wave?: number;
}

interface RegulatoryTarget {
  category?: string;
  domain?: string;
  expectedSignalTags?: string[];
  expectedVendors?: string[];
  id?: string;
  knownLimitations?: string[];
  notes?: string;
  priority?: string;
  privacyControlUrls?: string[];
  recommendedProfiles?: string[];
  url: string;
}

interface ArtifactIndexRecord {
  artifactPaths?: Record<string, string>;
  createdTimestamp?: string;
  domain?: string;
  expectedOrObservedSignalTags?: string[];
  knownLimitations?: string[];
  scanProfile?: string;
  scanStatus?: string;
  url?: string;
}

interface Stage3FixtureEntry {
  artifactPaths?: Record<string, string>;
  calibrationRole?: string;
  candidateCheckFailures?: string[];
  eligibleFindingKeys?: string[];
  expectedEligibleFindingKeys?: string[];
  fixtureId: string;
  forbiddenEligibleFindingKeys?: string[];
  lane?: string;
  status?: string;
  title?: string;
}

interface CohortSummary {
  input?: {
    profile?: string;
    consentDag?: boolean;
  };
  results?: CohortResult[];
}

interface CohortResult {
  cohort?: string;
  domain?: string;
  durationMs?: number;
  eligibleFindingKeys?: string[];
  moduleRuns?: Array<{
    errors?: string[];
    moduleName?: string;
    status?: string;
  }>;
  normalizedUrl?: string;
  privacyControlUrls?: string[];
  status?: string;
  url?: string;
}

interface QualityReport {
  input?: {
    cohortDirs?: string[];
    supersedeDuplicateSites?: boolean;
  };
  summary?: {
    readinessStatus?: string;
    readinessNotes?: string[];
    uniqueSites?: number;
  };
}

interface AcceptedArtifactRef {
  artifactPaths: Record<string, string>;
  cohort?: string;
  createdAt?: string;
  durationMs?: number;
  profile: string;
  source: CorpusSource;
  status: string;
  statusReasons: string[];
}

interface CorpusTarget {
  targetId: string;
  targetType: TargetType;
  canonicalUrl?: string;
  domain?: string;
  split: Split;
  sourceSets: CorpusSource[];
  urlVariants: string[];
  laneTags: string[];
  expectedSignalTags: string[];
  expectedVendors: string[];
  sector?: string;
  category?: string;
  priority?: string;
  recommendedProfiles: string[];
  privacyControlUrls: string[];
  seedUrls: Record<string, string[]>;
  knownLimitations: string[];
  notes: string[];
  qualityStatus: "accepted" | "accepted_with_limitations" | "planned_only" | "needs_attention";
  eligibility: {
    candidateBacklog: boolean;
    calibrationEligible: boolean;
    holdoutEligible: boolean;
    regressionOnly: boolean;
    trainingEligible: boolean;
    validationEligible: boolean;
    reasons: string[];
  };
  acceptedArtifacts: AcceptedArtifactRef[];
  syntheticFixture?: {
    calibrationRole?: string;
    candidateCheckFailures: string[];
    eligibleFindingKeys: string[];
    expectedEligibleFindingKeys: string[];
    fixtureId: string;
    forbiddenEligibleFindingKeys: string[];
    lane?: string;
    status?: string;
    title?: string;
  };
}

interface CurrentGoldCorpusManifest {
  manifestVersion: "wc01.v2_current_gold_corpus_manifest.1";
  generatedAt: string;
  guardrails: string[];
  inputs: Record<string, string>;
  summary: {
    liveTargets: number;
    syntheticFixtures: number;
    totalTargets: number;
    sourceCounts: Record<CorpusSource, number>;
    splitCounts: Record<Split, number>;
    qualityStatusCounts: Record<CorpusTarget["qualityStatus"], number>;
    laneCounts: Record<string, number>;
    acceptedArtifactRefs: number;
  };
  targets: CorpusTarget[];
}

interface Args {
  expansionJsonl: string;
  expansionQualityReport: string;
  help: boolean;
  outDir: string;
  regulatoryArtifactIndex: string;
  regulatoryTargetList: string;
  stage3FixtureIndex: string;
}

const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current");
const DEFAULT_EXPANSION_JSONL = path.join("docs", "certscore-v2", "gold-corpus-expansion-50.jsonl");
const DEFAULT_EXPANSION_QUALITY_REPORT = path.join(
  "artifacts",
  "v2-gold-expansion-quality",
  "superseded-with-rerun",
  "GoldExpansionQualityReport.json",
);
const DEFAULT_REGULATORY_TARGET_LIST = path.join("artifacts", "gold-corpus", "v2-20260613-stage1", "target-list.json");
const DEFAULT_REGULATORY_ARTIFACT_INDEX = path.join("artifacts", "gold-corpus", "v2-20260613-stage1", "artifact-index.json");
const DEFAULT_STAGE3_FIXTURE_INDEX = path.join(
  "artifacts",
  "gold-corpus",
  "v2-20260613-stage3-fixtures",
  "synthetic-fixture-index.json",
);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const targets = new Map<string, CorpusTarget>();
  const expansionEntries = await readJsonl<ExpansionEntry>(args.expansionJsonl);
  const regulatoryTargets = await readJson<{ targets?: RegulatoryTarget[] }>(args.regulatoryTargetList);
  const artifactIndex = await readJson<{ latestByTargetProfile?: ArtifactIndexRecord[] }>(args.regulatoryArtifactIndex);
  const stage3Index = await readJson<{ entries?: Stage3FixtureEntry[] }>(args.stage3FixtureIndex);
  const qualityReport = await readJson<QualityReport>(args.expansionQualityReport);

  for (const entry of expansionEntries) {
    const target = ensureLiveTarget(targets, entry.url);
    addSource(target, "consent_dag_expansion_50");
    addUrlVariant(target, entry.url);
    target.laneTags = unique([...target.laneTags, ...(entry.expectedLanes ?? [])]);
    target.sector ??= entry.sector;
    target.category ??= entry.primaryBucket;
    target.notes = unique([...target.notes, entry.notes].filter(isNonEmptyString));
    target.seedUrls.privacyOptOut = unique([
      ...(target.seedUrls.privacyOptOut ?? []),
      ...(entry.seedUrls?.privacyOptOut ?? []),
    ]);
  }

  for (const targetInput of regulatoryTargets.targets ?? []) {
    const target = ensureLiveTarget(targets, targetInput.url);
    addSource(target, "regulatory_stage1");
    addUrlVariant(target, targetInput.url);
    target.expectedSignalTags = unique([...target.expectedSignalTags, ...(targetInput.expectedSignalTags ?? [])]);
    target.expectedVendors = unique([...target.expectedVendors, ...(targetInput.expectedVendors ?? [])]);
    target.knownLimitations = unique([...target.knownLimitations, ...(targetInput.knownLimitations ?? [])]);
    target.privacyControlUrls = unique([...target.privacyControlUrls, ...(targetInput.privacyControlUrls ?? [])]);
    target.recommendedProfiles = unique([...target.recommendedProfiles, ...(targetInput.recommendedProfiles ?? [])]);
    target.category ??= targetInput.category;
    target.priority ??= targetInput.priority;
    target.notes = unique([...target.notes, targetInput.notes].filter(isNonEmptyString));
  }

  for (const artifact of artifactIndex.latestByTargetProfile ?? []) {
    const url = artifact.url;
    if (!url) {
      continue;
    }
    const target = ensureLiveTarget(targets, url);
    addSource(target, "regulatory_stage1");
    addUrlVariant(target, url);
    target.expectedSignalTags = unique([...target.expectedSignalTags, ...(artifact.expectedOrObservedSignalTags ?? [])]);
    target.knownLimitations = unique([
      ...target.knownLimitations,
      ...(artifact.knownLimitations ?? []).filter(isRealKnownLimitation),
    ]);
    target.acceptedArtifacts.push({
      artifactPaths: artifact.artifactPaths ?? {},
      createdAt: artifact.createdTimestamp,
      profile: artifact.scanProfile ?? "unknown",
      source: "regulatory_stage1",
      status: artifact.scanStatus ?? "unknown",
      statusReasons: artifact.knownLimitations ?? [],
    });
  }

  await addExpansionAcceptedArtifacts(targets, qualityReport);

  for (const fixture of stage3Index.entries ?? []) {
    const target = createSyntheticTarget(fixture);
    targets.set(target.targetId, target);
  }

  const targetList = [...targets.values()]
    .map(finalizeTarget)
    .sort((left, right) => left.targetType.localeCompare(right.targetType) || left.targetId.localeCompare(right.targetId));

  const manifest: CurrentGoldCorpusManifest = {
    manifestVersion: "wc01.v2_current_gold_corpus_manifest.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal v2 diagnostic artifact only.",
      "Does not create production findings, scoring, regulatory rows, persisted concerns, or customer-facing copy.",
      "Accepted artifact refs preserve provenance; source artifacts are not copied into this manifest directory.",
      "Use holdout/test split only for regression checks, not scanner tuning.",
    ],
    inputs: {
      expansionJsonl: args.expansionJsonl,
      expansionQualityReport: args.expansionQualityReport,
      regulatoryArtifactIndex: args.regulatoryArtifactIndex,
      regulatoryTargetList: args.regulatoryTargetList,
      stage3FixtureIndex: args.stage3FixtureIndex,
    },
    summary: summarizeTargets(targetList),
    targets: targetList,
  };

  await mkdir(args.outDir, { recursive: true });
  await mkdir(path.join(args.outDir, "splits"), { recursive: true });
  await writeJson(path.join(args.outDir, "GoldCorpusManifest.json"), manifest);
  await writeFile(path.join(args.outDir, "GoldCorpusManifest.md"), renderMarkdown(manifest));
  await writeSplitFiles(args.outDir, targetList);

  console.log(JSON.stringify({
    outDir: args.outDir,
    summary: manifest.summary,
  }, null, 2));
}

function ensureLiveTarget(targets: Map<string, CorpusTarget>, url: string): CorpusTarget {
  const domain = hostFromUrl(url);
  const targetId = `live_${slugify(domain)}`;
  const existing = targets.get(targetId);
  if (existing) {
    return existing;
  }
  const target: CorpusTarget = {
    targetId,
    targetType: "live_site",
    canonicalUrl: normalizeUrl(url),
    domain,
    split: splitForKey(domain),
    sourceSets: [],
    urlVariants: [],
    laneTags: [],
    expectedSignalTags: [],
    expectedVendors: [],
    recommendedProfiles: [],
    privacyControlUrls: [],
    seedUrls: {},
    knownLimitations: [],
    notes: [],
    qualityStatus: "planned_only",
    eligibility: emptyEligibility(),
    acceptedArtifacts: [],
  };
  targets.set(targetId, target);
  return target;
}

function createSyntheticTarget(fixture: Stage3FixtureEntry): CorpusTarget {
  const targetId = `fixture_${slugify(fixture.fixtureId)}`;
  return {
    targetId,
    targetType: "synthetic_fixture",
    split: splitForKey(targetId),
    sourceSets: ["synthetic_stage3"],
    urlVariants: [],
    laneTags: unique([fixture.lane].filter(isNonEmptyString)),
    expectedSignalTags: [],
    expectedVendors: [],
    recommendedProfiles: ["fixture"],
    privacyControlUrls: [],
    seedUrls: {},
    knownLimitations: [],
    notes: [],
    qualityStatus: fixture.status === "pass" ? "accepted" : "needs_attention",
    eligibility: {
      candidateBacklog: false,
      calibrationEligible: fixture.status === "pass",
      holdoutEligible: fixture.status === "pass" && splitForKey(targetId) === "test",
      regressionOnly: fixture.status !== "pass",
      trainingEligible: fixture.status === "pass" && splitForKey(targetId) === "train",
      validationEligible: fixture.status === "pass" && splitForKey(targetId) === "validation",
      reasons: fixture.status === "pass" ? ["synthetic_fixture_passed"] : ["synthetic_fixture_needs_attention"],
    },
    acceptedArtifacts: [{
      artifactPaths: fixture.artifactPaths ?? {},
      profile: "fixture",
      source: "synthetic_stage3",
      status: fixture.status ?? "unknown",
      statusReasons: fixture.candidateCheckFailures ?? [],
    }],
    syntheticFixture: {
      calibrationRole: fixture.calibrationRole,
      candidateCheckFailures: fixture.candidateCheckFailures ?? [],
      eligibleFindingKeys: fixture.eligibleFindingKeys ?? [],
      expectedEligibleFindingKeys: fixture.expectedEligibleFindingKeys ?? [],
      fixtureId: fixture.fixtureId,
      forbiddenEligibleFindingKeys: fixture.forbiddenEligibleFindingKeys ?? [],
      lane: fixture.lane,
      status: fixture.status,
      title: fixture.title,
    },
  };
}

async function addExpansionAcceptedArtifacts(targets: Map<string, CorpusTarget>, qualityReport: QualityReport) {
  const cohortDirs = qualityReport.input?.cohortDirs ?? [];
  const latestByKey = new Map<string, { cohortDir: string; result: CohortResult; runType: string }>();
  for (const cohortDir of cohortDirs) {
    const summary = await readJson<CohortSummary>(path.join(cohortDir, "Wc01V2ScanLabCohort.summary.json")).catch(() => undefined);
    if (!summary) {
      continue;
    }
    const runType = classifyCohortRun(cohortDir, summary);
    for (const result of summary.results ?? []) {
      const key = `${runType}:${hostFromUrl(result.url ?? result.normalizedUrl ?? result.domain ?? "")}`;
      latestByKey.set(key, { cohortDir, result, runType });
    }
  }

  for (const { result, runType } of latestByKey.values()) {
    const url = result.url ?? result.normalizedUrl;
    if (!url) {
      continue;
    }
    const target = ensureLiveTarget(targets, url);
    addSource(target, "consent_dag_expansion_50");
    addUrlVariant(target, url);
    target.expectedSignalTags = unique([...target.expectedSignalTags, ...(result.eligibleFindingKeys ?? [])]);
    target.privacyControlUrls = unique([...target.privacyControlUrls, ...(result.privacyControlUrls ?? [])]);
    const artifactPaths = artifactPathsForCohortResult(result);
    target.acceptedArtifacts.push({
      artifactPaths,
      cohort: result.cohort,
      durationMs: result.durationMs,
      profile: runType === "auxiliary_full" ? "full" : "consent",
      source: "consent_dag_expansion_50",
      status: result.status ?? "unknown",
      statusReasons: (result.moduleRuns ?? [])
        .filter((run) => run.status && run.status !== "completed")
        .flatMap((run) => [`${run.moduleName ?? "module"}:${run.status}`, ...(run.errors ?? [])]),
    });
  }
}

function artifactPathsForCohortResult(result: CohortResult): Record<string, string> {
  if (!result.cohort || !result.domain) {
    return {};
  }
  const base = path.join("artifacts", `v2-calibration-${result.cohort}`, result.domain);
  return {
    canonicalEvidenceBundle: path.join(base, "CanonicalEvidenceBundle.json"),
    consentFlowTrace: path.join(base, "consent_flow_trace.json"),
    consentScenarioExecution: path.join(base, "consent_scenario_execution.json"),
    consentScenarioPlan: path.join(base, "consent_scenario_plan.json"),
    reviewResult: path.join(base, "ReviewResult.json"),
    scanCorePhases: path.join(base, "V2ScanCorePhases.json"),
    scanTiming: path.join(base, "V2ScanLabTiming.json"),
  };
}

function finalizeTarget(target: CorpusTarget): CorpusTarget {
  const hasAttentionReasons = target.acceptedArtifacts.some((artifact) =>
    artifact.status !== "completed" && artifact.status !== "pass" ||
    artifact.statusReasons.some((reason) => /failed|deadline|Target page|budget_exhausted/i.test(reason))
  );
  const acceptedArtifacts = target.acceptedArtifacts.length;
  const qualityStatus: CorpusTarget["qualityStatus"] = hasAttentionReasons
    ? "needs_attention"
    : acceptedArtifacts > 0 && target.knownLimitations.length > 0
      ? "accepted_with_limitations"
      : acceptedArtifacts > 0
        ? "accepted"
        : "planned_only";
  const targetForEligibility = { ...target, qualityStatus };
  return {
    ...target,
    acceptedArtifacts: target.acceptedArtifacts.sort((left, right) =>
      left.source.localeCompare(right.source) || left.profile.localeCompare(right.profile)
    ),
    expectedSignalTags: unique(target.expectedSignalTags).sort(),
    expectedVendors: unique(target.expectedVendors).sort(),
    knownLimitations: unique(target.knownLimitations).sort(),
    laneTags: unique([...target.laneTags, ...laneTagsFromSignals(target.expectedSignalTags)]).sort(),
    notes: unique(target.notes).sort(),
    privacyControlUrls: unique(target.privacyControlUrls).sort(),
    qualityStatus,
    eligibility: eligibilityForTarget(targetForEligibility),
    recommendedProfiles: unique(target.recommendedProfiles).sort(),
    sourceSets: unique(target.sourceSets).sort() as CorpusSource[],
    urlVariants: unique(target.urlVariants).sort(),
  };
}

function emptyEligibility(): CorpusTarget["eligibility"] {
  return {
    candidateBacklog: false,
    calibrationEligible: false,
    holdoutEligible: false,
    regressionOnly: false,
    trainingEligible: false,
    validationEligible: false,
    reasons: [],
  };
}

function eligibilityForTarget(target: CorpusTarget): CorpusTarget["eligibility"] {
  if (target.qualityStatus === "planned_only") {
    return {
      ...emptyEligibility(),
      candidateBacklog: true,
      reasons: ["planned_only_no_accepted_artifact"],
    };
  }
  if (target.qualityStatus === "needs_attention") {
    return {
      ...emptyEligibility(),
      regressionOnly: true,
      reasons: ["quality_status_needs_attention"],
    };
  }
  const limitationLabels = target.qualityStatus === "accepted_with_limitations";
  const splitReason = `split_${target.split}`;
  return {
    candidateBacklog: false,
    calibrationEligible: target.targetType === "synthetic_fixture",
    holdoutEligible: target.split === "test",
    regressionOnly: false,
    trainingEligible: target.split === "train",
    validationEligible: target.split === "validation",
    reasons: limitationLabels
      ? [splitReason, "eligible_with_explicit_limitation_labels"]
      : [splitReason, "accepted_quality_status"],
  };
}

function laneTagsFromSignals(signals: string[]): string[] {
  const tags: string[] = [];
  for (const signal of signals) {
    if (/gpc/i.test(signal)) tags.push("gpc_enabled");
    if (/reject|refusal/i.test(signal)) tags.push("reject_all_flow");
    if (/do_not_sell|privacy_choices|opt_out|sale/i.test(signal)) tags.push("privacy_opt_out_flow");
    if (/notice_at_collection/i.test(signal)) tags.push("form_collection_probe");
    if (/cookie_notice|consent_surface|banner/i.test(signal)) tags.push("policy_surface");
    if (/weak_or_no_consent/i.test(signal)) tags.push("no_banner_control");
  }
  return tags;
}

function isRealKnownLimitation(value: string): boolean {
  if (/^[a-zA-Z]+RuntimeScanner:completed$/.test(value)) {
    return false;
  }
  return true;
}

function summarizeTargets(targets: CorpusTarget[]): CurrentGoldCorpusManifest["summary"] {
  return {
    liveTargets: targets.filter((target) => target.targetType === "live_site").length,
    syntheticFixtures: targets.filter((target) => target.targetType === "synthetic_fixture").length,
    totalTargets: targets.length,
    sourceCounts: countBySource(targets),
    splitCounts: countBy(targets, (target) => target.split) as Record<Split, number>,
    qualityStatusCounts: countBy(targets, (target) => target.qualityStatus) as Record<CorpusTarget["qualityStatus"], number>,
    laneCounts: countLaneTags(targets),
    acceptedArtifactRefs: targets.reduce((count, target) => count + target.acceptedArtifacts.length, 0),
  };
}

function countBySource(targets: CorpusTarget[]): Record<CorpusSource, number> {
  const counts: Record<CorpusSource, number> = {
    consent_dag_expansion_50: 0,
    regulatory_stage1: 0,
    synthetic_stage3: 0,
  };
  for (const target of targets) {
    for (const source of target.sourceSets) {
      counts[source] += 1;
    }
  }
  return counts;
}

function countLaneTags(targets: CorpusTarget[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const target of targets) {
    for (const lane of target.laneTags) {
      counts[lane] = (counts[lane] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

async function writeSplitFiles(outDir: string, targets: CorpusTarget[]) {
  for (const split of ["train", "validation", "test"] as const) {
    const liveUrls = targets
      .filter((target) => target.targetType === "live_site" && target.split === split && target.canonicalUrl)
      .map((target) => target.canonicalUrl);
    await writeFile(path.join(outDir, "splits", `${split}.urls.txt`), `${liveUrls.join("\n")}\n`);
    const targetIds = targets
      .filter((target) => target.split === split)
      .map((target) => target.targetId);
    await writeFile(path.join(outDir, "splits", `${split}.target-ids.txt`), `${targetIds.join("\n")}\n`);
  }
}

function renderMarkdown(manifest: CurrentGoldCorpusManifest): string {
  const lines = [
    "# V2 Current Gold Corpus",
    "",
    "Internal diagnostic manifest only. This file indexes accepted v2 gold-corpus artifacts for scanner tuning and regression checks. It does not copy source artifacts and does not change production report behavior.",
    "",
    "## Summary",
    "",
    `- Total targets: ${manifest.summary.totalTargets}`,
    `- Live targets: ${manifest.summary.liveTargets}`,
    `- Synthetic fixtures: ${manifest.summary.syntheticFixtures}`,
    `- Accepted artifact refs: ${manifest.summary.acceptedArtifactRefs}`,
    "",
    "Source counts:",
    "",
    ...Object.entries(manifest.summary.sourceCounts).map(([source, count]) => `- ${source}: ${count}`),
    "",
    "Split counts:",
    "",
    ...Object.entries(manifest.summary.splitCounts).map(([split, count]) => `- ${split}: ${count}`),
    "",
    "Quality status counts:",
    "",
    ...Object.entries(manifest.summary.qualityStatusCounts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "Top lane counts:",
    "",
    ...Object.entries(manifest.summary.laneCounts)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 20)
      .map(([lane, count]) => `- ${lane}: ${count}`),
    "",
    "## Usage",
    "",
    "- Use `splits/train.urls.txt` for tuning experiments.",
    "- Use `splits/validation.urls.txt` for iteration checks.",
    "- Use `splits/test.urls.txt` only for holdout regression checks.",
    "- Use `GoldCorpusManifest.json` as the source of truth for provenance and accepted artifact refs.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function classifyCohortRun(cohortDir: string, summary: CohortSummary): string {
  if (summary.input?.profile === "consent" && summary.input.consentDag === true) {
    return "consent_core";
  }
  if (summary.input?.profile === "full") {
    return "auxiliary_full";
  }
  if (cohortDir.includes("auxiliary")) {
    return "auxiliary_full";
  }
  return "consent_core";
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    expansionJsonl: DEFAULT_EXPANSION_JSONL,
    expansionQualityReport: DEFAULT_EXPANSION_QUALITY_REPORT,
    help: false,
    outDir: DEFAULT_OUT_DIR,
    regulatoryArtifactIndex: DEFAULT_REGULATORY_ARTIFACT_INDEX,
    regulatoryTargetList: DEFAULT_REGULATORY_TARGET_LIST,
    stage3FixtureIndex: DEFAULT_STAGE3_FIXTURE_INDEX,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--expansion-jsonl" && next) {
      args.expansionJsonl = next;
      index += 1;
    } else if (arg === "--expansion-quality-report" && next) {
      args.expansionQualityReport = next;
      index += 1;
    } else if (arg === "--regulatory-target-list" && next) {
      args.regulatoryTargetList = next;
      index += 1;
    } else if (arg === "--regulatory-artifact-index" && next) {
      args.regulatoryArtifactIndex = next;
      index += 1;
    } else if (arg === "--stage3-fixture-index" && next) {
      args.stage3FixtureIndex = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function usage(): string {
  return [
    "Usage: pnpm v2:gold-corpus-current-manifest -- [options]",
    "",
    "Builds one logical v2 gold corpus manifest from split internal corpora.",
    "Artifact-only. Does not copy source artifacts or change production behavior.",
    "",
    "Options:",
    "  --expansion-jsonl <path>",
    "  --expansion-quality-report <path>",
    "  --regulatory-target-list <path>",
    "  --regulatory-artifact-index <path>",
    "  --stage3-fixture-index <path>",
    "  --out-dir <path>",
  ].join("\n");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const contents = await readFile(filePath, "utf8");
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function addSource(target: CorpusTarget, source: CorpusSource) {
  target.sourceSets = unique([...target.sourceSets, source]) as CorpusSource[];
}

function addUrlVariant(target: CorpusTarget, url: string) {
  const normalized = normalizeUrl(url);
  target.urlVariants = unique([...target.urlVariants, normalized]);
  target.canonicalUrl ??= normalized;
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^www\./i, "").toLowerCase();
  }
}

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "");
    return parsed.toString();
  } catch {
    return value;
  }
}

function splitForKey(key: string): Split {
  const bucket = stableHash(key) % 100;
  if (bucket < 70) {
    return "train";
  }
  if (bucket < 85) {
    return "validation";
  }
  return "test";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
