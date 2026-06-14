import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  failOnGate: boolean;
  help: boolean;
  outDir: string;
  stage1Dir: string;
  stage2Version: string;
};

type TargetList = {
  corpusVersion: string;
  guardrails: string[];
  targets: Array<{
    category: string;
    domain: string;
    expectedSignalTags: string[];
    id: string;
    recommendedProfiles: string[];
    url: string;
  }>;
};

type RunManifest = {
  summary: {
    attempted: number;
    failed: number;
    notRun: number;
    plannedProfileRuns: number;
    succeeded: number;
    targetUrls: number;
  };
};

type CoverageMatrix = {
  rows: CoverageRow[];
  summary: {
    covered: number;
    gaps: number;
    thin: number;
  };
};

type CoverageRow = {
  coverageKey: string;
  examples: Array<{
    artifactPaths: Record<string, string>;
    confidence?: number;
    domain: string;
    profile: string;
    url: string;
  }>;
  observedExampleCount: number;
  status: "covered" | "gap" | "thin";
};

type ConfidenceDistribution = {
  buckets: Array<{
    count: number;
    id: string;
    max: number;
    min: number;
  }>;
  summary: {
    candidateCount: number;
    eligibleCandidateCount: number;
    findingKeyCount: number;
  };
};

type GoodExample = {
  artifactPaths: Record<string, string>;
  confidenceMax: number;
  domain: string;
  eligibleFindingKeys: string[];
  observedSignalTags: string[];
  profile: string;
  reason: string;
  url: string;
};

type NearMiss = {
  artifactPaths: Record<string, string>;
  domain: string;
  expectedSignalTags: string[];
  knownLimitations: string[];
  missingSignalTags: string[];
  profile: string;
  reason: string;
  url: string;
};

type NearMissQueueItem = {
  artifactPaths: Record<string, string>;
  domain: string;
  missingSignalTags: string[];
  profile: string;
  reason: string;
  reviewType: "near_miss_review";
  url: string;
};

type PromotedExample = {
  artifactPaths: Record<string, string>;
  confidenceMax: number;
  domain: string;
  eligibleFindingKeys: string[];
  lane: string;
  observedSignalTags: string[];
  profile: string;
  promotionStatus: "candidate" | "needs_review";
  rationale: string[];
  targetCategory?: string;
  targetId?: string;
  url: string;
};

type GateStatus = "pass" | "warn" | "fail";

const STAGE1_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage1");
const STAGE2_VERSION = "v2-20260613-stage2";
const GENERATED_AT = new Date().toISOString();

const CORE_LANES = [
  "gdpr_eprivacy_consent_surface_observed",
  "reject_decline_option_availability",
  "post_choice_consent_controls",
  "tracking_after_refusal",
  "cookie_notice_availability",
  "cross_border_endpoint_review",
  "session_replay_fingerprinting_review",
  "ccpa_cpra_do_not_sell_or_share_availability",
  "notice_at_collection",
  "gpc_opt_out_signal_handling",
  "post_opt_out_tracking_behavior",
  "targeted_advertising_signals",
  "weak_or_no_consent_surface",
];

const RUNTIME_LANES = new Set([
  "gdpr_eprivacy_consent_surface_observed",
  "reject_decline_option_availability",
  "post_choice_consent_controls",
  "tracking_after_refusal",
  "session_replay_fingerprinting_review",
  "gpc_opt_out_signal_handling",
  "post_opt_out_tracking_behavior",
  "targeted_advertising_signals",
]);

const MIN_PROMOTED_PER_CORE_LANE = 3;
const TARGET_PROMOTED_PER_CORE_LANE = 5;

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const inputs = await readStage1Inputs(args.stage1Dir);
  await mkdir(args.outDir, { recursive: true });

  const promoted = buildPromotedExamples(inputs.goodExamples.examples, inputs.coverage.rows, inputs.targetList.targets);
  const fixturePlan = buildSyntheticFixturePlan(inputs.coverage.rows, inputs.nearMisses.examples, promoted);
  const gateBaseline = buildRegressionGateBaseline(args, inputs, promoted, fixturePlan);
  const reviewerQueue = buildReviewerQueue(promoted, fixturePlan, inputs.nearMisses.examples);
  const readme = renderReadme(args, inputs, promoted, fixturePlan, gateBaseline);

  await writeJson(path.join(args.outDir, "promoted-gold-examples.json"), {
    examplesVersion: "wc01.v2_regulatory_gold_corpus_stage2.promoted_examples.1",
    generatedAt: GENERATED_AT,
    sourceStage1Dir: args.stage1Dir,
    summary: {
      coreLanes: CORE_LANES.length,
      promotedExamples: promoted.length,
      candidateExamples: promoted.filter((example) => example.promotionStatus === "candidate").length,
      needsReviewExamples: promoted.filter((example) => example.promotionStatus === "needs_review").length,
    },
    examples: promoted,
  });
  await writeJson(path.join(args.outDir, "synthetic-fixture-plan.json"), fixturePlan);
  await writeJson(path.join(args.outDir, "regression-gate-baseline.json"), gateBaseline);
  await writeJson(path.join(args.outDir, "reviewer-queue.json"), reviewerQueue);
  await writeFile(path.join(args.outDir, "README.md"), readme);

  console.log(JSON.stringify({
    outDir: args.outDir,
    promotedExamples: promoted.length,
    fixtureTasks: fixturePlan.tasks.length,
    gateStatus: gateBaseline.summary.overallStatus,
  }, null, 2));

  if (args.failOnGate && gateBaseline.summary.overallStatus === "fail") {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    failOnGate: false,
    help: false,
    outDir: path.join("artifacts", "gold-corpus", STAGE2_VERSION),
    stage1Dir: STAGE1_DIR,
    stage2Version: STAGE2_VERSION,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stage1-dir") {
      args.stage1Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--stage2-version") {
      args.stage2Version = requiredValue(argv, ++index, arg);
    } else if (arg === "--fail-on-gate") {
      args.failOnGate = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node --import tsx scripts/build-v2-regulatory-gold-corpus-stage2.ts [--stage1-dir <dir>] [--out-dir <dir>] [--fail-on-gate]",
    "",
    "Builds artifact-only Stage 2 promotion candidates, fixture planning, and regression gates from a Stage 1 v2 corpus.",
    "No production report integration. No customer-facing findings. No legal conclusions.",
  ].join("\n");
}

async function readStage1Inputs(stage1Dir: string) {
  return {
    confidence: await readRequiredJson<ConfidenceDistribution>(stage1Dir, "confidence-distribution.json"),
    coverage: await readRequiredJson<CoverageMatrix>(stage1Dir, "finding-coverage-matrix.json"),
    goodExamples: await readRequiredJson<{ examples: GoodExample[] }>(stage1Dir, "known-good-examples.json"),
    nearMisses: await readRequiredJson<{ examples: NearMiss[] }>(stage1Dir, "known-near-misses.json"),
    runManifest: await readRequiredJson<RunManifest>(stage1Dir, "run-manifest.json"),
    targetList: await readRequiredJson<TargetList>(stage1Dir, "target-list.json"),
  };
}

async function readRequiredJson<T>(dir: string, fileName: string): Promise<T> {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing required Stage 1 input: ${filePath}`);
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function buildPromotedExamples(
  goodExamples: GoodExample[],
  coverageRows: CoverageRow[],
  targets: TargetList["targets"],
): PromotedExample[] {
  const promoted: PromotedExample[] = [];
  const usedKeys = new Set<string>();
  const targetByDomain = new Map(targets.map((target) => [target.domain, target]));
  for (const lane of CORE_LANES) {
    const fromGood = goodExamples
      .filter((example) => example.observedSignalTags.includes(lane))
      .sort(compareGoodExamples);
    const fromCoverage = coverageRows
      .find((row) => row.coverageKey === lane)?.examples
      .map((example): GoodExample => ({
        artifactPaths: example.artifactPaths,
        confidenceMax: example.confidence ?? 0,
        domain: example.domain,
        eligibleFindingKeys: [],
        observedSignalTags: [lane],
        profile: example.profile,
        reason: "Promoted from coverage matrix example.",
        url: example.url,
      })) ?? [];

    const laneExamples = lane === "weak_or_no_consent_surface"
      ? sortWeakControlExamples([...fromGood, ...fromCoverage], targetByDomain)
      : diversifyByDomain([...fromGood, ...fromCoverage]);
    for (const example of laneExamples) {
      const target = targetByDomain.get(example.domain);
      const key = `${lane}:${example.domain}:${example.profile}:${example.artifactPaths.canonicalEvidenceBundle ?? example.url}`;
      if (usedKeys.has(key)) {
        continue;
      }
      usedKeys.add(key);
      promoted.push({
        artifactPaths: example.artifactPaths,
        confidenceMax: example.confidenceMax,
        domain: example.domain,
        eligibleFindingKeys: example.eligibleFindingKeys,
        lane,
        observedSignalTags: example.observedSignalTags,
        profile: example.profile,
        promotionStatus: isStrongPromotion(lane, example, target) ? "candidate" : "needs_review",
        rationale: promotionRationale(lane, example, target),
        targetCategory: target?.category,
        targetId: target?.id,
        url: example.url,
      });
      if (promoted.filter((entry) => entry.lane === lane).length >= TARGET_PROMOTED_PER_CORE_LANE) {
        break;
      }
    }
  }
  return promoted;
}

function buildSyntheticFixturePlan(
  coverageRows: CoverageRow[],
  nearMisses: NearMiss[],
  promoted: PromotedExample[],
) {
  const tasks = CORE_LANES.flatMap((lane) => {
    const row = coverageRows.find((entry) => entry.coverageKey === lane);
    const promotedCount = promoted.filter((entry) => entry.lane === lane && entry.promotionStatus === "candidate").length;
    const laneNearMisses = nearMisses
      .filter((nearMiss) => nearMiss.missingSignalTags.includes(lane))
      .slice(0, 5);
    const needsSynthetic =
      !row ||
      row.status !== "covered" ||
      promotedCount < MIN_PROMOTED_PER_CORE_LANE ||
      laneNearMisses.length >= 3;
    if (!needsSynthetic) {
      return [];
    }
    return [{
      lane,
      priority: row?.status === "gap" || promotedCount === 0 ? "P1" : row?.status === "thin" ? "P2" : "P3",
      reason: fixtureReason(row, promotedCount, laneNearMisses.length),
      recommendedFixtureShape: recommendedFixtureShape(lane),
      sourceNearMisses: laneNearMisses.map((nearMiss) => ({
        artifactPaths: nearMiss.artifactPaths,
        domain: nearMiss.domain,
        knownLimitations: nearMiss.knownLimitations,
        missingSignalTags: nearMiss.missingSignalTags,
        profile: nearMiss.profile,
        url: nearMiss.url,
      })),
      targetMinimumCandidateExamples: MIN_PROMOTED_PER_CORE_LANE,
      currentCandidateExamples: promotedCount,
    }];
  });

  return {
    fixturePlanVersion: "wc01.v2_regulatory_gold_corpus_stage2.synthetic_fixture_plan.1",
    generatedAt: GENERATED_AT,
    guardrails: [
      "Synthetic fixtures are for v2 diagnostic regression only.",
      "Do not map fixture rows directly to production normalized concerns or unified findings.",
      "Fixtures should use display-safe, bounded inputs and avoid raw cookies, bodies, sensitive query values, unbounded policy text, and raw model reasoning.",
    ],
    summary: {
      tasks: tasks.length,
      p1: tasks.filter((task) => task.priority === "P1").length,
      p2: tasks.filter((task) => task.priority === "P2").length,
      p3: tasks.filter((task) => task.priority === "P3").length,
    },
    tasks,
  };
}

function buildRegressionGateBaseline(
  args: Args,
  inputs: Awaited<ReturnType<typeof readStage1Inputs>>,
  promoted: PromotedExample[],
  fixturePlan: ReturnType<typeof buildSyntheticFixturePlan>,
) {
  const checks = [
    gateCheck({
      actual: inputs.targetList.targets.length,
      expected: ">= 50",
      name: "target_url_floor",
      passed: inputs.targetList.targets.length >= 50,
      severity: "fail",
    }),
    gateCheck({
      actual: inputs.coverage.summary.gaps,
      expected: 0,
      name: "coverage_gap_floor",
      passed: inputs.coverage.summary.gaps === 0,
      severity: "fail",
    }),
    gateCheck({
      actual: Math.min(...CORE_LANES.map((lane) => inputs.coverage.rows.find((row) => row.coverageKey === lane)?.observedExampleCount ?? 0)),
      expected: `>= ${MIN_PROMOTED_PER_CORE_LANE}`,
      name: "core_lane_observed_example_floor",
      passed: CORE_LANES.every((lane) => (inputs.coverage.rows.find((row) => row.coverageKey === lane)?.observedExampleCount ?? 0) >= MIN_PROMOTED_PER_CORE_LANE),
      severity: "fail",
    }),
    gateCheck({
      actual: minCandidatePromotions(promoted),
      expected: `>= ${MIN_PROMOTED_PER_CORE_LANE}`,
      name: "core_lane_candidate_promotion_floor",
      passed: CORE_LANES.every((lane) =>
        promoted.filter((example) => example.lane === lane && example.promotionStatus === "candidate").length >= MIN_PROMOTED_PER_CORE_LANE
      ),
      severity: "warn",
    }),
    gateCheck({
      actual: inputs.runManifest.summary.failed,
      expected: "<= 1",
      name: "stage1_first_batch_failure_budget",
      passed: inputs.runManifest.summary.failed <= 1,
      severity: "warn",
    }),
    gateCheck({
      actual: fixturePlan.summary.p1,
      expected: 0,
      name: "p1_synthetic_fixture_tasks",
      passed: fixturePlan.summary.p1 === 0,
      severity: "warn",
    }),
  ];
  const overallStatus: GateStatus = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return {
    baselineVersion: "wc01.v2_regulatory_gold_corpus_stage2.regression_gate_baseline.1",
    generatedAt: GENERATED_AT,
    sourceStage1Dir: args.stage1Dir,
    stage2Version: args.stage2Version,
    summary: {
      overallStatus,
      checks: checks.length,
      pass: checks.filter((check) => check.status === "pass").length,
      warn: checks.filter((check) => check.status === "warn").length,
      fail: checks.filter((check) => check.status === "fail").length,
    },
    baselineMetrics: {
      confidenceSummary: inputs.confidence.summary,
      coverageSummary: inputs.coverage.summary,
      runSummary: inputs.runManifest.summary,
      targetUrls: inputs.targetList.targets.length,
    },
    checks,
  };
}

function buildReviewerQueue(promoted: PromotedExample[], fixturePlan: ReturnType<typeof buildSyntheticFixturePlan>, nearMisses: NearMiss[]) {
  const promotionReview = promoted
    .filter((example) => example.promotionStatus === "needs_review")
    .slice(0, 25)
    .map((example) => ({
      artifactPaths: example.artifactPaths,
      domain: example.domain,
      lane: example.lane,
      profile: example.profile,
      reason: example.rationale,
      reviewType: "promotion_candidate_review",
      url: example.url,
    }));
  const nearMissQueue = splitNearMissQueue(promoted, fixturePlan, nearMisses);
  return {
    reviewerQueueVersion: "wc01.v2_regulatory_gold_corpus_stage2.reviewer_queue.1",
    generatedAt: GENERATED_AT,
    summary: {
      promotionReviewItems: promotionReview.length,
      nearMissReviewItems: nearMissQueue.actionable.length,
      monitoredNearMissItems: nearMissQueue.monitored.length,
      actionableNearMissTags: nearMissQueue.actionable.reduce((count, item) => count + item.missingSignalTags.length, 0),
      monitoredNearMissTags: nearMissQueue.monitored.reduce((count, item) => count + item.missingSignalTags.length, 0),
      fixtureTasks: fixturePlan.tasks.length,
    },
    items: [...promotionReview, ...nearMissQueue.actionable.slice(0, 25)],
    monitoredNearMisses: nearMissQueue.monitored,
  };
}

function splitNearMissQueue(
  promoted: PromotedExample[],
  fixturePlan: ReturnType<typeof buildSyntheticFixturePlan>,
  nearMisses: NearMiss[],
) {
  const actionable: NearMissQueueItem[] = [];
  const monitored: NearMissQueueItem[] = [];

  for (const nearMiss of nearMisses) {
    if (nearMiss.knownLimitations.length === 0 && nearMiss.missingSignalTags.length <= 1) {
      continue;
    }
    const actionableTags = nearMiss.missingSignalTags.filter((lane) =>
      isActionableNearMissLane(lane, promoted, fixturePlan)
    );
    const monitoredTags = nearMiss.missingSignalTags.filter((lane) => !actionableTags.includes(lane));
    if (actionableTags.length > 0) {
      actionable.push(nearMissQueueItem(nearMiss, actionableTags));
    }
    if (monitoredTags.length > 0) {
      monitored.push(nearMissQueueItem(nearMiss, monitoredTags));
    }
  }

  return {
    actionable,
    monitored,
  };
}

function nearMissQueueItem(nearMiss: NearMiss, missingSignalTags: string[]): NearMissQueueItem {
  return {
    artifactPaths: nearMiss.artifactPaths,
    domain: nearMiss.domain,
    missingSignalTags,
    profile: nearMiss.profile,
    reason: nearMiss.reason,
    reviewType: "near_miss_review",
    url: nearMiss.url,
  };
}

function isActionableNearMissLane(
  lane: string,
  promoted: PromotedExample[],
  fixturePlan: ReturnType<typeof buildSyntheticFixturePlan>,
) {
  const candidatePromotions = promoted.filter((example) =>
    example.lane === lane && example.promotionStatus === "candidate"
  ).length;
  const hasBlockingFixtureTask = fixturePlan.tasks.some((task) =>
    task.lane === lane && (task.priority === "P1" || task.priority === "P2")
  );
  return candidatePromotions < MIN_PROMOTED_PER_CORE_LANE || hasBlockingFixtureTask;
}

function renderReadme(
  args: Args,
  inputs: Awaited<ReturnType<typeof readStage1Inputs>>,
  promoted: PromotedExample[],
  fixturePlan: ReturnType<typeof buildSyntheticFixturePlan>,
  gateBaseline: ReturnType<typeof buildRegressionGateBaseline>,
) {
  const promotedByLane = CORE_LANES.map((lane) => {
    const candidates = promoted.filter((example) => example.lane === lane && example.promotionStatus === "candidate").length;
    const review = promoted.filter((example) => example.lane === lane && example.promotionStatus === "needs_review").length;
    return `- ${lane}: ${candidates} candidate, ${review} needs review`;
  });
  const fixtureTasks = fixturePlan.tasks.slice(0, 12).map((task) =>
    `- ${task.priority} ${task.lane}: ${task.reason}`
  );
  return [
    "# WC01 v2 Regulatory Diagnostics Gold Corpus Stage 2",
    "",
    "Internal diagnostic only. Artifact-only. Non-persistent. Not customer-facing report output.",
    "",
    "This Stage 2 foundation consumes the Stage 1 corpus indexes and produces promotion candidates, synthetic fixture work items, and regression gates. It does not create production findings, normalized concerns, checklist rows, regulatory lenses, or report copy.",
    "",
    "## Summary",
    "",
    `- Stage 2 version: ${args.stage2Version}`,
    `- Source Stage 1: ${args.stage1Dir}`,
    `- Source targets: ${inputs.targetList.targets.length}`,
    `- Promoted examples: ${promoted.length}`,
    `- Synthetic fixture tasks: ${fixturePlan.tasks.length}`,
    `- Regression gate status: ${gateBaseline.summary.overallStatus}`,
    "",
    "## Promoted Examples By Lane",
    "",
    ...promotedByLane,
    "",
    "## Fixture Tasks",
    "",
    ...(fixtureTasks.length > 0 ? fixtureTasks : ["- No synthetic fixture tasks generated."]),
    "",
    "## Commands",
    "",
    "```bash",
    "node --import tsx scripts/build-v2-regulatory-gold-corpus-stage2.ts",
    "node --import tsx scripts/build-v2-regulatory-gold-corpus-stage2.ts --fail-on-gate",
    "```",
    "",
    "## Guardrails",
    "",
    "- v2 internal diagnostic artifacts only",
    "- no production report wiring",
    "- no legal conclusions",
    "- no raw cookies, request bodies, sensitive query values, unbounded policy text, or raw model reasoning copied into this directory",
    "",
  ].join("\n");
}

function compareGoodExamples(left: GoodExample, right: GoodExample) {
  return right.confidenceMax - left.confidenceMax ||
    scoreProfile(right.profile) - scoreProfile(left.profile) ||
    right.eligibleFindingKeys.length - left.eligibleFindingKeys.length ||
    left.domain.localeCompare(right.domain);
}

function diversifyByDomain(examples: GoodExample[]) {
  const selected: GoodExample[] = [];
  const seenDomains = new Set<string>();
  for (const example of examples) {
    if (seenDomains.has(example.domain)) {
      continue;
    }
    seenDomains.add(example.domain);
    selected.push(example);
  }
  for (const example of examples) {
    if (!selected.includes(example)) {
      selected.push(example);
    }
  }
  return selected;
}

function isStrongPromotion(lane: string, example: GoodExample, target?: TargetList["targets"][number]) {
  if (!example.artifactPaths.canonicalEvidenceBundle || !example.artifactPaths.reviewResult) {
    return false;
  }
  if (lane === "weak_or_no_consent_surface") {
    return Boolean(target?.expectedSignalTags.includes(lane));
  }
  if (example.confidenceMax < 0.5) {
    return false;
  }
  if (RUNTIME_LANES.has(lane) && example.profile === "policy") {
    return false;
  }
  return example.observedSignalTags.includes(lane);
}

function promotionRationale(lane: string, example: GoodExample, target?: TargetList["targets"][number]) {
  const rationale = [
    `observed_signal:${lane}`,
    `profile:${example.profile}`,
    `confidence_max:${example.confidenceMax.toFixed(2)}`,
  ];
  if (target) {
    rationale.push(`target:${target.id}`);
    rationale.push(`category:${target.category}`);
  }
  if (lane === "weak_or_no_consent_surface") {
    rationale.push(target?.expectedSignalTags.includes(lane) ? "negative_control_target" : "not_selected_negative_control_target");
  }
  if (RUNTIME_LANES.has(lane) && example.profile === "policy") {
    rationale.push("runtime_lane_policy_profile_needs_review");
  }
  if (lane !== "weak_or_no_consent_surface" && example.confidenceMax < 0.7) {
    rationale.push("moderate_confidence_needs_review");
  }
  if (!example.artifactPaths.reviewResult) {
    rationale.push("missing_review_result");
  }
  return rationale;
}

function sortWeakControlExamples(examples: GoodExample[], targetByDomain: Map<string, TargetList["targets"][number]>) {
  return diversifyByDomain(examples).sort((left, right) =>
    weakControlScore(right, targetByDomain) - weakControlScore(left, targetByDomain) ||
    scoreProfile(right.profile) - scoreProfile(left.profile) ||
    left.domain.localeCompare(right.domain)
  );
}

function weakControlScore(example: GoodExample, targetByDomain: Map<string, TargetList["targets"][number]>) {
  const target = targetByDomain.get(example.domain);
  let score = 0;
  if (target?.expectedSignalTags.includes("weak_or_no_consent_surface")) score += 20;
  if (target?.category === "weak/no-consent examples") score += 10;
  if (target?.category === "education/nonprofit/government-like") score += 6;
  if (example.profile === "tiny") score += 5;
  if (example.profile === "standard") score += 4;
  if (example.artifactPaths.canonicalEvidenceBundle && example.artifactPaths.reviewResult) score += 3;
  return score;
}

function scoreProfile(profile: string) {
  if (profile === "full") return 5;
  if (profile === "consent") return 4;
  if (profile === "standard") return 3;
  if (profile === "policy") return 2;
  if (profile === "tiny") return 1;
  return 0;
}

function fixtureReason(row: CoverageRow | undefined, promotedCount: number, nearMissCount: number) {
  const reasons: string[] = [];
  if (!row) {
    reasons.push("coverage row missing");
  } else if (row.status !== "covered") {
    reasons.push(`coverage status is ${row.status}`);
  }
  if (promotedCount < MIN_PROMOTED_PER_CORE_LANE) {
    reasons.push(`only ${promotedCount} promoted candidate examples`);
  }
  if (nearMissCount >= 3) {
    reasons.push(`${nearMissCount} near misses indicate unstable live coverage`);
  }
  return reasons.join("; ");
}

function recommendedFixtureShape(lane: string) {
  if (lane === "post_choice_consent_controls") {
    return "bounded CMP fixture with accept, reject, reopen preferences, and post-choice controls";
  }
  if (lane === "gpc_opt_out_signal_handling") {
    return "bounded GPC fixture with disclosure artifact and runtime GPC header/control observation";
  }
  if (lane === "post_opt_out_tracking_behavior") {
    return "bounded opt-out fixture with before/after vendor and targeted-ad signal deltas";
  }
  if (lane === "tracking_after_refusal") {
    return "bounded reject-flow fixture with retained post-refusal network and cookie summaries";
  }
  if (lane === "session_replay_fingerprinting_review") {
    return "bounded behavioral-analytics fixture using canonical vendor resolver labels";
  }
  if (lane === "weak_or_no_consent_surface") {
    return "negative-control fixture with no CMP and minimal third-party runtime activity";
  }
  return "bounded v2 diagnostic fixture with canonical evidence bundle and review result";
}

function gateCheck(input: {
  actual: unknown;
  expected: unknown;
  name: string;
  passed: boolean;
  severity: "fail" | "warn";
}) {
  return {
    actual: input.actual,
    expected: input.expected,
    name: input.name,
    severity: input.severity,
    status: input.passed ? "pass" : input.severity,
  };
}

function minCandidatePromotions(promoted: PromotedExample[]) {
  return Math.min(...CORE_LANES.map((lane) =>
    promoted.filter((example) => example.lane === lane && example.promotionStatus === "candidate").length
  ));
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}
