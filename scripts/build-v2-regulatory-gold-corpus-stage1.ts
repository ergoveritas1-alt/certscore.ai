import { existsSync, statSync } from "node:fs";
import { open, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ScanProfile = "consent" | "full" | "policy" | "standard" | "tiny";

type SignalTag =
  | "gdpr_eprivacy_consent_surface_observed"
  | "reject_decline_option_availability"
  | "post_choice_consent_controls"
  | "tracking_after_refusal"
  | "cookie_notice_availability"
  | "cross_border_endpoint_review"
  | "session_replay_fingerprinting_review"
  | "ccpa_cpra_do_not_sell_or_share_availability"
  | "notice_at_collection"
  | "gpc_opt_out_signal_handling"
  | "post_opt_out_tracking_behavior"
  | "targeted_advertising_signals"
  | "weak_or_no_consent_surface";

type TargetEntry = {
  category: string;
  domain: string;
  expectedSignalTags: SignalTag[];
  expectedVendors: string[];
  id: string;
  knownLimitations: string[];
  notes: string;
  priority: "primary" | "secondary" | "control";
  privacyControlUrls: string[];
  recommendedProfiles: ScanProfile[];
  url: string;
};

type TargetList = {
  corpusVersion: string;
  generatedAt: string;
  guardrails: string[];
  localBaseline: LocalInventory;
  purpose: string;
  selectionNotes: string[];
  targets: TargetEntry[];
};

type LocalInventory = {
  canonicalEvidenceBundles: number;
  distinctDomains: number;
  distinctUrls: number;
  profileCounts: Record<string, number>;
};

type CandidateSummary = {
  confidence?: number;
  eligibility: string;
  findingKey: string;
};

type ArtifactRecord = {
  artifactPaths: Record<string, string>;
  createdAt: string;
  domain: string;
  knownLimitations: string[];
  normalizedUrl: string;
  observedSignalTags: string[];
  packageVersions: {
    reviewSchemaVersion?: string;
    scannerVersion?: string;
    sourceBundleSchemaVersion?: string;
  };
  profile: string;
  reviewCandidates: CandidateSummary[];
  status: "completed" | "failed" | "unknown";
  url: string;
};

type CohortSummary = {
  completedAt?: string;
  input?: {
    outDir?: string;
    profile?: string;
    urlsPath?: string;
  };
  results?: CohortResult[];
};

type CohortResult = {
  chainKey?: string;
  cohort?: string;
  completedAt?: string;
  domain?: string;
  eligibleFindingKeys?: string[];
  error?: string;
  index?: number;
  normalizedUrl?: string;
  privacyControlUrls?: string[];
  runtime?: Record<string, unknown>;
  startedAt?: string;
  status?: "completed" | "failed" | "skipped";
  url?: string;
};

type BundleMetadata = {
  domain?: string;
  normalizedUrl?: string;
  profile: string;
  url?: string;
};

type Args = {
  artifactRoot: string;
  corpusVersion: string;
  help: boolean;
  outDir: string;
};

const STAGE1_VERSION = "v2-20260613-stage1";
const GENERATED_AT = new Date().toISOString();

const FINDING_TO_SIGNAL_TAG: Record<string, SignalTag> = {
  consent_banner_observed_or_not_observed: "gdpr_eprivacy_consent_surface_observed",
  cookie_policy_observed_or_not_observed: "cookie_notice_availability",
  cookies_persist_after_reject_review_signal: "post_opt_out_tracking_behavior",
  do_not_sell_or_share_link_observed: "ccpa_cpra_do_not_sell_or_share_availability",
  endpoint_transfer_review_signal: "cross_border_endpoint_review",
  gpc_disclosure_observed: "gpc_opt_out_signal_handling",
  gpc_runtime_probe_with_disclosure_observed: "gpc_opt_out_signal_handling",
  notice_at_collection_observed: "notice_at_collection",
  post_choice_consent_control_observed: "post_choice_consent_controls",
  post_opt_out_targeted_advertising_behavior_signal: "post_opt_out_tracking_behavior",
  privacy_choices_link_observed: "ccpa_cpra_do_not_sell_or_share_availability",
  reject_action_succeeded_or_not_testable: "reject_decline_option_availability",
  reject_control_observed_or_not_observed: "reject_decline_option_availability",
  session_replay_or_behavioral_analytics_observed: "session_replay_fingerprinting_review",
  targeted_advertising_runtime_signal: "targeted_advertising_signals",
  tracking_after_refusal_review_signal: "tracking_after_refusal",
  unresolved_collection_endpoint_review_signal: "cross_border_endpoint_review",
  vendors_persist_after_reject_review_signal: "tracking_after_refusal",
};

const COVERAGE_KEYS = [
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
  ...Object.keys(FINDING_TO_SIGNAL_TAG),
];

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  await mkdir(args.outDir, { recursive: true });
  await mkdir(path.join(args.outDir, "run-lists"), { recursive: true });

  const localInventory = await inventoryLocalCorpus(args.artifactRoot, args.outDir);
  const targetList = buildTargetList(args.corpusVersion, localInventory);
  await writeJson(path.join(args.outDir, "target-list.json"), targetList);
  await writeRunLists(args.outDir, targetList.targets);

  const artifactRecords = await collectArtifactRecords(args.artifactRoot, args.outDir, targetList.targets);
  const runManifest = await buildRunManifest(args.outDir, targetList, artifactRecords);
  const artifactIndex = buildArtifactIndex(targetList, localInventory, artifactRecords);
  const coverageMatrix = buildCoverageMatrix(targetList.targets, artifactRecords);
  const confidenceDistribution = buildConfidenceDistribution(artifactRecords);
  const knownGoodExamples = buildKnownGoodExamples(artifactRecords);
  const knownNearMisses = buildKnownNearMisses(targetList.targets, artifactRecords);

  await writeJson(path.join(args.outDir, "run-manifest.json"), runManifest);
  await writeJson(path.join(args.outDir, "artifact-index.json"), artifactIndex);
  await writeJson(path.join(args.outDir, "finding-coverage-matrix.json"), coverageMatrix);
  await writeJson(path.join(args.outDir, "confidence-distribution.json"), confidenceDistribution);
  await writeJson(path.join(args.outDir, "known-good-examples.json"), knownGoodExamples);
  await writeJson(path.join(args.outDir, "known-near-misses.json"), knownNearMisses);
  await writeFile(path.join(args.outDir, "README.md"), renderReadme({
    artifactIndex,
    confidenceDistribution,
    coverageMatrix,
    knownGoodExamples,
    knownNearMisses,
    runManifest,
    targetList,
  }));

  console.log(JSON.stringify({
    artifactRecords: artifactRecords.length,
    localInventory,
    outDir: args.outDir,
    targetUrls: targetList.targets.length,
  }, null, 2));
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifactRoot: "artifacts",
    corpusVersion: STAGE1_VERSION,
    help: false,
    outDir: path.join("artifacts", "gold-corpus", STAGE1_VERSION),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact-root") {
      args.artifactRoot = requiredValue(argv, ++index, arg);
    } else if (arg === "--corpus-version") {
      args.corpusVersion = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
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
    "  node --import tsx scripts/build-v2-regulatory-gold-corpus-stage1.ts [--out-dir <dir>] [--artifact-root artifacts]",
    "",
    "Creates a versioned v2 Regulatory Diagnostics gold corpus manifest and safe artifact indexes.",
    "Artifact-only. Internal diagnostic output only. No production report integration.",
  ].join("\n");
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

async function inventoryLocalCorpus(artifactRoot: string, outDir: string): Promise<LocalInventory> {
  const bundlePaths = (await findFiles(artifactRoot, "CanonicalEvidenceBundle.json"))
    .filter((filePath) => !isInside(filePath, outDir))
    .filter((filePath) => !isGeneratedGoldCorpusFile(filePath, artifactRoot));
  const urls = new Set<string>();
  const domains = new Set<string>();
  const profileCounts: Record<string, number> = {};

  for (const bundlePath of bundlePaths) {
    const metadata = await readBundleMetadata(bundlePath).catch(() => ({
      domain: path.basename(path.dirname(bundlePath)),
      normalizedUrl: undefined,
      profile: "unknown",
      url: undefined,
    }));
    const url = metadata.url ?? metadata.normalizedUrl;
    const domain = metadata.domain ?? domainFromUrl(url) ?? path.basename(path.dirname(bundlePath));
    const profile = metadata.profile;
    if (url) {
      urls.add(url);
    }
    if (domain) {
      domains.add(domain);
    }
    profileCounts[profile] = (profileCounts[profile] ?? 0) + 1;
  }

  return {
    canonicalEvidenceBundles: bundlePaths.length,
    distinctDomains: domains.size,
    distinctUrls: urls.size,
    profileCounts: sortRecord(profileCounts),
  };
}

async function collectArtifactRecords(
  artifactRoot: string,
  outDir: string,
  targets: TargetEntry[],
): Promise<ArtifactRecord[]> {
  const targetDomains = new Set(targets.map((target) => target.domain));
  const bundlePaths = (await findFiles(artifactRoot, "CanonicalEvidenceBundle.json"))
    .filter((filePath) => !isInside(filePath, outDir))
    .filter((filePath) => !isGeneratedGoldCorpusFile(filePath, artifactRoot));
  const records: ArtifactRecord[] = [];

  for (const bundlePath of bundlePaths) {
    const metadata = await readBundleMetadata(bundlePath).catch(() => ({
      domain: path.basename(path.dirname(bundlePath)),
      normalizedUrl: undefined,
      profile: "unknown",
      url: undefined,
    }));
    if (!metadata.domain || !targetDomains.has(metadata.domain)) {
      continue;
    }
    const bundle = await readJson<Record<string, unknown>>(bundlePath).catch(() => null);
    if (!bundle) {
      continue;
    }
    const url = metadata.url ?? asString(bundle.url) ?? asString(bundle.normalizedUrl) ?? "";
    const domain = metadata.domain;
    const reviewPath = path.join(path.dirname(bundlePath), "ReviewResult.json");
    const timingPath = path.join(path.dirname(bundlePath), "V2ScanLabTiming.json");
    const review: Record<string, unknown> = existsSync(reviewPath)
      ? await readJson<Record<string, unknown>>(reviewPath).catch(() => ({}))
      : {};
    const profile = metadata.profile !== "unknown"
      ? metadata.profile
      : asString(asRecord(bundle.scanProfile).profileId) ?? "unknown";
    const reviewCandidates = summarizeReviewCandidates(review);
    const observedSignalTags = summarizeObservedSignalTags(bundle, reviewCandidates);
    const limitationKeys = asStringArray(asRecord(bundle.runtimeCoverage).limitationKeys);
    const moduleLimitations = asArray(bundle.modulesRun)
      .map(asRecord)
      .filter((moduleRun) => asString(moduleRun.status) !== "completed" || asStringArray(moduleRun.errors).length > 0)
      .map((moduleRun) => `${asString(moduleRun.moduleName) ?? "unknown"}:${asString(moduleRun.status) ?? "unknown"}`);

    records.push({
      artifactPaths: {
        canonicalEvidenceBundle: bundlePath,
        ...(existsSync(reviewPath) ? { reviewResult: reviewPath } : {}),
        ...(existsSync(timingPath) ? { scanTiming: timingPath } : {}),
      },
      createdAt: asString(bundle.completedAt) ?? safeMtime(bundlePath),
      domain,
      knownLimitations: [...new Set([...limitationKeys, ...moduleLimitations])].sort(),
      normalizedUrl: asString(bundle.normalizedUrl) ?? url,
      observedSignalTags,
      packageVersions: {
        reviewSchemaVersion: asString(review.schemaVersion),
        scannerVersion: asString(bundle.scannerVersion),
        sourceBundleSchemaVersion: asString(review.sourceBundleSchemaVersion),
      },
      profile,
      reviewCandidates,
      status: "completed",
      url,
    });
  }

  return records.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) ||
    left.domain.localeCompare(right.domain) ||
    left.profile.localeCompare(right.profile)
  );
}

async function buildRunManifest(
  outDir: string,
  targetList: TargetList,
  artifactRecords: ArtifactRecord[],
) {
  const summaries = await readCohortSummaries(path.join(outDir, "runs"));
  const attemptedEntries = summaries.flatMap((summary) => {
    const profile = summary.input?.profile ?? "unknown";
    return (summary.results ?? []).map((result) => {
      const domain = result.domain ?? domainFromUrl(result.url) ?? "unknown";
      const artifactBase = result.status === "completed" && result.cohort
        ? path.join("artifacts", `v2-calibration-${result.cohort}`, domain)
        : undefined;
      return {
        artifactPaths: artifactBase
          ? compactRecord({
            canonicalEvidenceBundle: path.join(artifactBase, "CanonicalEvidenceBundle.json"),
            reviewResult: path.join(artifactBase, "ReviewResult.json"),
            scanTiming: path.join(artifactBase, "V2ScanLabTiming.json"),
          })
          : {},
        createdTimestamp: result.completedAt ?? summary.completedAt ?? GENERATED_AT,
        domain,
        expectedOrObservedSignalTags: [
          ...new Set([
            ...targetList.targets.find((target) => target.domain === domain)?.expectedSignalTags ?? [],
            ...resultToObservedSignalTags(result),
          ]),
        ].sort(),
        failureReason: result.status === "failed" ? result.error ?? "scan_failed" : undefined,
        knownLimitations: resultToLimitations(result),
        packageVersions: latestRecordFor(artifactRecords, domain, profile)?.packageVersions ?? {},
        scanProfile: profile,
        scanStatus: result.status ?? "unknown",
        url: result.url ?? "",
      };
    });
  });

  const plannedEntries = targetList.targets.flatMap((target) =>
    target.recommendedProfiles.map((profile) => ({
      createdTimestamp: undefined,
      domain: target.domain,
      expectedOrObservedSignalTags: target.expectedSignalTags,
      failureReason: undefined,
      knownLimitations: target.knownLimitations,
      packageVersions: latestRecordFor(artifactRecords, target.domain, profile)?.packageVersions ?? {},
      scanProfile: profile,
      scanStatus: "not_run",
      url: target.url,
    }))
  );
  const attemptedKeys = new Set(attemptedEntries.map((entry) => `${entry.domain}:${entry.scanProfile}`));

  return {
    manifestVersion: "wc01.v2_regulatory_gold_corpus_stage1.run_manifest.1",
    generatedAt: GENERATED_AT,
    corpusVersion: targetList.corpusVersion,
    guardrails: targetList.guardrails,
    summary: {
      plannedProfileRuns: plannedEntries.length,
      targetUrls: targetList.targets.length,
      attempted: attemptedEntries.filter((entry) => entry.scanStatus !== "skipped").length,
      succeeded: attemptedEntries.filter((entry) => entry.scanStatus === "completed").length,
      failed: attemptedEntries.filter((entry) => entry.scanStatus === "failed").length,
      notRun: plannedEntries.filter((entry) => !attemptedKeys.has(`${entry.domain}:${entry.scanProfile}`)).length,
    },
    entries: [
      ...attemptedEntries,
      ...plannedEntries.filter((entry) => !attemptedKeys.has(`${entry.domain}:${entry.scanProfile}`)),
    ],
    resumableCommands: [
      `pnpm v2:wc01-scan-lab-cohort --urls ${path.join(outDir, "run-lists", "consent.urls.txt")} --profile consent --resume --out-dir ${path.join(outDir, "runs", "consent")}`,
      `pnpm v2:wc01-scan-lab-cohort --urls ${path.join(outDir, "run-lists", "policy.urls.txt")} --profile policy --resume --out-dir ${path.join(outDir, "runs", "policy")}`,
      `pnpm v2:wc01-scan-lab-cohort --urls ${path.join(outDir, "run-lists", "full.urls.txt")} --profile full --capture-replay --resume --out-dir ${path.join(outDir, "runs", "full")}`,
    ],
  };
}

function buildArtifactIndex(
  targetList: TargetList,
  localInventory: LocalInventory,
  artifactRecords: ArtifactRecord[],
) {
  const latestByDomainProfile = new Map<string, ArtifactRecord>();
  for (const record of artifactRecords) {
    const key = `${record.domain}:${record.profile}`;
    if (!latestByDomainProfile.has(key)) {
      latestByDomainProfile.set(key, record);
    }
  }
  return {
    indexVersion: "wc01.v2_regulatory_gold_corpus_stage1.artifact_index.1",
    generatedAt: GENERATED_AT,
    corpusVersion: targetList.corpusVersion,
    localInventory,
    totalMatchingTargetArtifacts: artifactRecords.length,
    latestByTargetProfile: [...latestByDomainProfile.values()].map(serializeArtifactRecord),
  };
}

function buildCoverageMatrix(targets: TargetEntry[], artifactRecords: ArtifactRecord[]) {
  const rows = COVERAGE_KEYS.map((key) => {
    const targetDomains = targets
      .filter((target) => target.expectedSignalTags.includes(key as SignalTag))
      .map((target) => target.domain);
    const evidence = artifactRecords
      .filter((record) =>
        record.observedSignalTags.includes(key) ||
        record.reviewCandidates.some((candidate) => candidate.findingKey === key && candidate.eligibility === "eligible")
      )
      .slice(0, 12)
      .map((record) => ({
        artifactPaths: record.artifactPaths,
        confidence: highestConfidence(record, key),
        domain: record.domain,
        profile: record.profile,
        url: record.url,
      }));
    return {
      coverageKey: key,
      expectedTargetDomains: [...new Set(targetDomains)].sort(),
      observedExampleCount: evidence.length,
      status: evidence.length >= 3 ? "covered" : evidence.length > 0 ? "thin" : "gap",
      examples: evidence,
    };
  });

  return {
    matrixVersion: "wc01.v2_regulatory_gold_corpus_stage1.finding_coverage_matrix.1",
    generatedAt: GENERATED_AT,
    summary: {
      covered: rows.filter((row) => row.status === "covered").length,
      gaps: rows.filter((row) => row.status === "gap").length,
      thin: rows.filter((row) => row.status === "thin").length,
    },
    rows,
  };
}

function buildConfidenceDistribution(artifactRecords: ArtifactRecord[]) {
  const buckets = [
    { id: "0.00-0.24", min: 0, max: 0.249999 },
    { id: "0.25-0.49", min: 0.25, max: 0.499999 },
    { id: "0.50-0.69", min: 0.5, max: 0.699999 },
    { id: "0.70-0.84", min: 0.7, max: 0.849999 },
    { id: "0.85-1.00", min: 0.85, max: 1 },
  ];
  const allCandidates = artifactRecords.flatMap((record) =>
    record.reviewCandidates.map((candidate) => ({
      ...candidate,
      domain: record.domain,
      profile: record.profile,
    }))
  );
  const byFinding: Record<string, Record<string, number>> = {};
  for (const candidate of allCandidates) {
    const confidence = candidate.confidence ?? 0;
    const bucket = buckets.find((entry) => confidence >= entry.min && confidence <= entry.max)?.id ?? "unknown";
    byFinding[candidate.findingKey] ??= {};
    byFinding[candidate.findingKey][bucket] = (byFinding[candidate.findingKey][bucket] ?? 0) + 1;
  }
  return {
    distributionVersion: "wc01.v2_regulatory_gold_corpus_stage1.confidence_distribution.1",
    generatedAt: GENERATED_AT,
    summary: {
      candidateCount: allCandidates.length,
      eligibleCandidateCount: allCandidates.filter((candidate) => candidate.eligibility === "eligible").length,
      findingKeyCount: Object.keys(byFinding).length,
    },
    buckets: buckets.map(({ id, min, max }) => ({
      id,
      max,
      min,
      count: allCandidates.filter((candidate) => {
        const confidence = candidate.confidence ?? 0;
        return confidence >= min && confidence <= max;
      }).length,
    })),
    byFinding: sortNestedRecord(byFinding),
  };
}

function buildKnownGoodExamples(artifactRecords: ArtifactRecord[]) {
  const examples = artifactRecords
    .filter((record) => record.status === "completed")
    .map((record) => ({
      artifactPaths: record.artifactPaths,
      confidenceMax: maxConfidence(record),
      domain: record.domain,
      eligibleFindingKeys: record.reviewCandidates
        .filter((candidate) => candidate.eligibility === "eligible")
        .map((candidate) => candidate.findingKey)
        .sort(),
      observedSignalTags: record.observedSignalTags,
      profile: record.profile,
      reason: "Completed v2 artifact with eligible review candidates and retained diagnostic signal tags.",
      url: record.url,
    }))
    .filter((example) => example.eligibleFindingKeys.length > 0 && example.observedSignalTags.length > 0)
    .sort((left, right) =>
      right.observedSignalTags.length - left.observedSignalTags.length ||
      right.eligibleFindingKeys.length - left.eligibleFindingKeys.length ||
      right.confidenceMax - left.confidenceMax
    )
    .slice(0, 20);
  return {
    examplesVersion: "wc01.v2_regulatory_gold_corpus_stage1.known_good_examples.1",
    generatedAt: GENERATED_AT,
    examples,
  };
}

function buildKnownNearMisses(targets: TargetEntry[], artifactRecords: ArtifactRecord[]) {
  const misses = targets.flatMap((target) => {
    const latest = target.recommendedProfiles
      .map((profile) => latestRecordFor(artifactRecords, target.domain, profile))
      .filter((record): record is ArtifactRecord => Boolean(record));
    if (latest.length === 0) {
      return [{
        artifactPaths: {},
        domain: target.domain,
        expectedSignalTags: target.expectedSignalTags,
        knownLimitations: target.knownLimitations.length > 0 ? target.knownLimitations : ["not_yet_scanned_in_stage1"],
        missingSignalTags: target.expectedSignalTags,
        profile: target.recommendedProfiles.join(","),
        reason: "Target selected for Stage 1 but no matching local artifact exists yet.",
        url: target.url,
      }];
    }
    return latest
      .map((record) => {
        const missingSignalTags = target.expectedSignalTags.filter((tag) => !record.observedSignalTags.includes(tag));
        if (missingSignalTags.length === 0 && record.knownLimitations.length === 0) {
          return null;
        }
        return {
          artifactPaths: record.artifactPaths,
          domain: target.domain,
          expectedSignalTags: target.expectedSignalTags,
          knownLimitations: [...new Set([...target.knownLimitations, ...record.knownLimitations])].sort(),
          missingSignalTags,
          profile: record.profile,
          reason: missingSignalTags.length > 0
            ? "Expected diagnostic lane was not observed in the latest matching artifact."
            : "Artifact completed with limitations that should be reviewed before promotion to a stable gold example.",
          url: target.url,
        };
      })
      .filter((miss): miss is NonNullable<typeof miss> => Boolean(miss));
  });

  return {
    nearMissVersion: "wc01.v2_regulatory_gold_corpus_stage1.known_near_misses.1",
    generatedAt: GENERATED_AT,
    examples: misses.slice(0, 40),
  };
}

function renderReadme(input: {
  artifactIndex: ReturnType<typeof buildArtifactIndex>;
  confidenceDistribution: ReturnType<typeof buildConfidenceDistribution>;
  coverageMatrix: ReturnType<typeof buildCoverageMatrix>;
  knownGoodExamples: ReturnType<typeof buildKnownGoodExamples>;
  knownNearMisses: ReturnType<typeof buildKnownNearMisses>;
  runManifest: Awaited<ReturnType<typeof buildRunManifest>>;
  targetList: TargetList;
}) {
  const coverageRows = input.coverageMatrix.rows
    .filter((row) => row.status === "covered" || row.status === "thin")
    .slice(0, 12)
    .map((row) => `- ${row.coverageKey}: ${row.status}, ${row.observedExampleCount} examples`);
  const gaps = input.coverageMatrix.rows
    .filter((row) => row.status === "gap")
    .map((row) => `- ${row.coverageKey}`);
  return [
    "# WC01 v2 Regulatory Diagnostics Gold Corpus Stage 1",
    "",
    "Internal diagnostic only. Artifact-only. Non-persistent. Not customer-facing report output.",
    "",
    "This corpus refresh defines a compact, versioned target set for future confidence and reliability work. It indexes local v2 Scan Lab artifacts and keeps raw runtime evidence in its existing artifact locations; this directory stores only bounded metadata, paths, candidate keys, confidence summaries, and safe diagnostic tags.",
    "",
    "## Summary",
    "",
    `- Version: ${input.targetList.corpusVersion}`,
    `- Targets selected: ${input.targetList.targets.length}`,
    `- Planned profile runs: ${input.runManifest.summary.plannedProfileRuns}`,
    `- Scans attempted from this directory: ${input.runManifest.summary.attempted}`,
    `- Succeeded: ${input.runManifest.summary.succeeded}`,
    `- Failed: ${input.runManifest.summary.failed}`,
    `- Local matching target artifacts indexed: ${input.artifactIndex.totalMatchingTargetArtifacts}`,
    `- Local baseline bundles: ${input.targetList.localBaseline.canonicalEvidenceBundles}`,
    "",
    "## Resumable Commands",
    "",
    "```bash",
    ...input.runManifest.resumableCommands,
    "node --import tsx scripts/build-v2-regulatory-gold-corpus-stage1.ts",
    "```",
    "",
    "Use `--limit` with the cohort command for a bounded first pass, then rerun this indexer. The per-profile URL lists live in `run-lists/`.",
    "",
    "## Coverage Snapshot",
    "",
    ...coverageRows,
    "",
    "## Stage 2 Fixture Gaps",
    "",
    ...(gaps.length > 0 ? gaps : ["- No full gaps in the current local index; review thin rows before fixture work."]),
    "",
    "## Guardrails",
    "",
    ...input.targetList.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
  ].join("\n");
}

async function writeRunLists(outDir: string, targets: TargetEntry[]) {
  for (const profile of ["consent", "policy", "full", "standard", "tiny"] as ScanProfile[]) {
    const lines = targets
      .filter((target) => target.recommendedProfiles.includes(profile))
      .map((target) => JSON.stringify({
        url: target.url,
        privacyControlUrls: target.privacyControlUrls,
      }));
    await writeFile(path.join(outDir, "run-lists", `${profile}.urls.txt`), lines.length > 0 ? `${lines.join("\n")}\n` : "");
  }
  const firstBatch = targets
    .filter((target) => target.priority === "primary")
    .slice(0, 12)
    .map((target) => JSON.stringify({
      url: target.url,
      privacyControlUrls: target.privacyControlUrls,
    }));
  await writeFile(path.join(outDir, "run-lists", "representative-first-batch.urls.txt"), `${firstBatch.join("\n")}\n`);
}

async function readCohortSummaries(runsDir: string): Promise<CohortSummary[]> {
  if (!existsSync(runsDir)) {
    return [];
  }
  const summaryPaths = await findFiles(runsDir, "Wc01V2ScanLabCohort.summary.json");
  const summaries: CohortSummary[] = [];
  for (const summaryPath of summaryPaths) {
    const summary = await readJson<CohortSummary>(summaryPath).catch(() => null);
    if (summary) {
      summaries.push(summary);
    }
  }
  return summaries;
}

async function findFiles(root: string, fileName: string): Promise<string[]> {
  if (!existsSync(root)) {
    return [];
  }
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.name === fileName) {
        out.push(filePath);
      }
    }
  }
  await visit(root);
  return out.sort();
}

function buildTargetList(corpusVersion: string, localBaseline: LocalInventory): TargetList {
  return {
    corpusVersion,
    generatedAt: GENERATED_AT,
    guardrails: [
      "CertScore v2 internal diagnostic artifacts only.",
      "Do not wire these artifacts into WC01 production reports, scoring, checklist builders, normalized concerns, or customer-facing copy.",
      "No legal-conclusion language is encoded in the corpus indexes.",
      "Indexes retain bounded metadata and artifact paths; raw cookies, raw request bodies, sensitive query values, unbounded policy text, and raw model reasoning are not copied here.",
    ],
    localBaseline,
    purpose: "Refresh a compact Stage 1 gold corpus for v2 Regulatory Diagnostics confidence and reliability work.",
    selectionNotes: [
      "Target set is bounded to 64 URLs and biased toward consent controls, GPC/opt-out behavior, policy surfaces, endpoint/vendor review, and targeted advertising/session replay signals.",
      "Recommended profiles are selective: consent for control behavior, policy for disclosures, full for endpoint/vendor/replay/targeted-ad signals, and tiny only for controls or smoke targets.",
      "High-sensitivity adjacent sites are included as diagnostic coverage examples only; no legal conclusions are inferred.",
    ],
    targets: buildTargets(),
  };
}

function buildTargets(): TargetEntry[] {
  const target = (
    id: string,
    url: string,
    category: string,
    priority: TargetEntry["priority"],
    recommendedProfiles: ScanProfile[],
    expectedSignalTags: SignalTag[],
    expectedVendors: string[] = [],
    privacyControlUrls: string[] = [],
    knownLimitations: string[] = [],
    notes = "",
  ): TargetEntry => ({
    category,
    domain: domainFromUrl(url) ?? url.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    expectedSignalTags,
    expectedVendors,
    id,
    knownLimitations,
    notes,
    priority,
    privacyControlUrls,
    recommendedProfiles,
    url,
  });

  const consentFull = ["consent", "full"] as ScanProfile[];
  const policyConsentFull = ["consent", "policy", "full"] as ScanProfile[];
  const fullPolicy = ["full", "policy"] as ScanProfile[];

  return [
    target("media-nytimes", "https://nytimes.com/", "cmp-heavy news/media", "primary", policyConsentFull, ["reject_decline_option_availability", "post_choice_consent_controls", "tracking_after_refusal", "gpc_opt_out_signal_handling", "targeted_advertising_signals"], ["OneTrust", "Google Ads", "Meta Pixel", "The Trade Desk", "LiveRamp"]),
    target("media-washingtonpost", "https://www.washingtonpost.com/", "cmp-heavy news/media", "primary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "reject_decline_option_availability", "tracking_after_refusal", "targeted_advertising_signals"], ["Sourcepoint", "Google Ads", "Criteo"]),
    target("media-theguardian", "https://www.theguardian.com/us", "cmp-heavy news/media", "primary", policyConsentFull, ["gdpr_eprivacy_consent_surface_observed", "reject_decline_option_availability", "cookie_notice_availability", "targeted_advertising_signals"], ["Sourcepoint", "Google Ads"]),
    target("media-cnn", "https://www.cnn.com/", "cmp-heavy news/media", "primary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "tracking_after_refusal", "targeted_advertising_signals"], ["OneTrust", "Google Ads", "LiveRamp"]),
    target("media-bbc", "https://www.bbc.com/", "cmp-heavy news/media", "primary", policyConsentFull, ["gdpr_eprivacy_consent_surface_observed", "reject_decline_option_availability", "cookie_notice_availability"], ["OneTrust"]),
    target("media-forbes", "https://www.forbes.com/", "cmp-heavy news/media", "primary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "reject_decline_option_availability", "targeted_advertising_signals"], ["TrustArc", "Google Ads", "Criteo"]),
    target("media-bloomberg", "https://www.bloomberg.com/", "cmp-heavy news/media", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "tracking_after_refusal", "targeted_advertising_signals"], ["Sourcepoint", "Google Ads"]),
    target("media-weather", "https://weather.com/", "cmp-heavy news/media", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "targeted_advertising_signals", "session_replay_fingerprinting_review"], ["OneTrust", "Google Ads"]),
    target("media-nbcnews", "https://www.nbcnews.com/", "cmp-heavy news/media", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("media-axios", "https://www.axios.com/", "cmp-heavy news/media", "secondary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals"], ["Google Ads"]),
    target("media-abc", "https://abc.com/", "cmp-heavy news/media", "secondary", consentFull, ["reject_decline_option_availability", "tracking_after_refusal", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("media-vox", "https://www.vox.com/", "cmp-heavy news/media", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "targeted_advertising_signals"], ["Sourcepoint", "Google Ads"]),
    target("media-vanityfair", "https://www.vanityfair.com/", "cmp-heavy news/media", "secondary", consentFull, ["reject_decline_option_availability", "tracking_after_refusal", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("media-wired", "https://www.wired.com/", "cmp-heavy news/media", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),

    target("retail-walmart", "https://www.walmart.com/", "retail/ecommerce", "primary", policyConsentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "gpc_opt_out_signal_handling", "post_opt_out_tracking_behavior", "targeted_advertising_signals"], ["OneTrust", "Google Ads", "Meta Pixel"], ["https://www.walmart.com/help/article/your-privacy-choices/b599078dbd1a493b8e9dc81dc56cbbac"]),
    target("retail-target", "https://www.target.com/", "retail/ecommerce", "primary", policyConsentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals", "cookie_notice_availability"], ["OneTrust", "Google Ads", "Meta Pixel"]),
    target("retail-bestbuy", "https://www.bestbuy.com/", "retail/ecommerce", "primary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "post_opt_out_tracking_behavior", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("retail-homedepot", "https://www.homedepot.com/", "retail/ecommerce", "secondary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Google Ads", "Meta Pixel"]),
    target("retail-macys", "https://www.macys.com/", "retail/ecommerce", "secondary", consentFull, ["reject_decline_option_availability", "targeted_advertising_signals"], ["OneTrust", "Criteo", "Google Ads"]),
    target("retail-etsy", "https://www.etsy.com/", "retail/ecommerce", "secondary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["Google Ads", "Meta Pixel"]),
    target("retail-wayfair", "https://www.wayfair.com/", "retail/ecommerce", "secondary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "post_opt_out_tracking_behavior", "targeted_advertising_signals"], ["OneTrust", "Criteo"]),
    target("retail-ebay", "https://www.ebay.com/", "retail/ecommerce", "secondary", consentFull, ["post_choice_consent_controls", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("retail-ikea", "https://www.ikea.com/us/en/", "retail/ecommerce", "secondary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("retail-nike", "https://www.nike.com/", "retail/ecommerce", "secondary", fullPolicy, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Meta Pixel"]),
    target("retail-sephora", "https://www.sephora.com/", "retail/ecommerce", "secondary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Criteo"]),
    target("travel-booking", "https://www.booking.com/", "retail/ecommerce", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "reject_decline_option_availability", "targeted_advertising_signals"], ["Cookiebot", "Google Ads"]),
    target("travel-airbnb", "https://www.airbnb.com/", "retail/ecommerce", "secondary", consentFull, ["post_choice_consent_controls", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),

    target("health-healthline", "https://www.healthline.com/", "health/finance/high-sensitivity adjacent", "primary", policyConsentFull, ["gdpr_eprivacy_consent_surface_observed", "cookie_notice_availability", "targeted_advertising_signals"], ["OneTrust", "Google Ads"], [], ["high_sensitivity_adjacent_review_context"]),
    target("health-webmd", "https://www.webmd.com/", "health/finance/high-sensitivity adjacent", "primary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "targeted_advertising_signals", "session_replay_fingerprinting_review"], ["OneTrust", "Google Ads"], [], ["high_sensitivity_adjacent_review_context"]),
    target("health-mayoclinic", "https://www.mayoclinic.org/", "health/finance/high-sensitivity adjacent", "secondary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals"], ["Google Ads"], [], ["high_sensitivity_adjacent_review_context"]),
    target("health-plannedparenthood", "https://www.plannedparenthood.org/", "health/finance/high-sensitivity adjacent", "primary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals", "session_replay_fingerprinting_review"], ["Google Ads"], [], ["high_sensitivity_adjacent_review_context"]),
    target("health-cvs", "https://www.cvs.com/", "health/finance/high-sensitivity adjacent", "secondary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Google Ads"], [], ["high_sensitivity_adjacent_review_context"]),
    target("health-walgreens", "https://www.walgreens.com/", "health/finance/high-sensitivity adjacent", "secondary", consentFull, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Google Ads"], [], ["high_sensitivity_adjacent_review_context"]),
    target("finance-chase", "https://www.chase.com/", "health/finance/high-sensitivity adjacent", "primary", fullPolicy, ["cookie_notice_availability", "cross_border_endpoint_review"], ["Adobe", "Google"], [], ["financial_context_review_only"]),
    target("finance-bankofamerica", "https://www.bankofamerica.com/", "health/finance/high-sensitivity adjacent", "secondary", fullPolicy, ["cookie_notice_availability", "cross_border_endpoint_review"], ["Adobe", "Google"], [], ["financial_context_review_only"]),
    target("finance-fidelity", "https://www.fidelity.com/", "health/finance/high-sensitivity adjacent", "secondary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals"], ["OneTrust", "Google"], [], ["financial_context_review_only"]),
    target("finance-geico", "https://www.geico.com/", "health/finance/high-sensitivity adjacent", "secondary", fullPolicy, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Google"], [], ["financial_context_review_only"]),
    target("finance-progressive", "https://www.progressive.com/", "health/finance/high-sensitivity adjacent", "secondary", fullPolicy, ["ccpa_cpra_do_not_sell_or_share_availability", "targeted_advertising_signals"], ["OneTrust", "Google"], [], ["financial_context_review_only"]),

    target("tech-salesforce", "https://www.salesforce.com/", "tech/SaaS", "primary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "cross_border_endpoint_review", "targeted_advertising_signals"], ["OneTrust", "Google Ads"]),
    target("tech-hubspot", "https://www.hubspot.com/", "tech/SaaS", "primary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "session_replay_fingerprinting_review", "targeted_advertising_signals"], ["Cookiebot", "Google Ads"]),
    target("tech-segment", "https://segment.com/", "tech/SaaS", "primary", fullPolicy, ["cross_border_endpoint_review", "session_replay_fingerprinting_review"], ["Segment", "Google"]),
    target("tech-shopify", "https://www.shopify.com/", "tech/SaaS", "secondary", consentFull, ["post_choice_consent_controls", "cross_border_endpoint_review"], ["OneTrust", "Google"]),
    target("tech-cloudflare", "https://www.cloudflare.com/", "tech/SaaS", "secondary", fullPolicy, ["cookie_notice_availability", "cross_border_endpoint_review"], ["Google"]),
    target("tech-openai", "https://openai.com/", "tech/SaaS", "secondary", fullPolicy, ["cookie_notice_availability", "cross_border_endpoint_review"], ["Google"]),
    target("tech-vercel", "https://vercel.com/", "tech/SaaS", "secondary", fullPolicy, ["cookie_notice_availability", "session_replay_fingerprinting_review"], ["Google"]),
    target("tech-notion", "https://www.notion.so/", "tech/SaaS", "secondary", fullPolicy, ["cookie_notice_availability", "session_replay_fingerprinting_review"], ["Google"]),
    target("tech-linear", "https://linear.app/", "tech/SaaS", "control", ["standard"], ["weak_or_no_consent_surface", "cross_border_endpoint_review"], ["Google"]),
    target("tech-atlassian", "https://www.atlassian.com/", "tech/SaaS", "secondary", consentFull, ["gdpr_eprivacy_consent_surface_observed", "post_choice_consent_controls"], ["OneTrust", "Google"]),
    target("tech-adobe", "https://www.adobe.com/", "tech/SaaS", "secondary", fullPolicy, ["gdpr_eprivacy_consent_surface_observed", "targeted_advertising_signals"], ["OneTrust", "Adobe"]),
    target("tech-sap", "https://www.sap.com/", "tech/SaaS", "secondary", fullPolicy, ["gdpr_eprivacy_consent_surface_observed", "cross_border_endpoint_review"], ["OneTrust", "Google"]),
    target("tech-hotjar", "https://www.hotjar.com/", "tech/SaaS", "primary", fullPolicy, ["session_replay_fingerprinting_review", "cookie_notice_availability"], ["Hotjar"]),
    target("tech-fullstory", "https://www.fullstory.com/", "tech/SaaS", "primary", fullPolicy, ["session_replay_fingerprinting_review", "cookie_notice_availability"], ["FullStory"]),

    target("edu-mit", "https://www.mit.edu/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["control_site_low_cmp_expectation"]),
    target("edu-gatech", "https://www.gatech.edu/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["control_site_low_cmp_expectation"]),
    target("edu-caltech", "https://www.caltech.edu/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["control_site_low_cmp_expectation"]),
    target("edu-harvard", "https://www.harvard.edu/", "education/nonprofit/government-like", "secondary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals"], ["Google"]),
    target("edu-stanford", "https://www.stanford.edu/", "education/nonprofit/government-like", "secondary", fullPolicy, ["cookie_notice_availability", "targeted_advertising_signals"], ["Google"]),
    target("nonprofit-mozilla", "https://www.mozilla.org/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["control_site_low_cmp_expectation"]),
    target("nonprofit-wikipedia", "https://www.wikipedia.org/", "education/nonprofit/government-like", "control", ["tiny", "policy"], ["weak_or_no_consent_surface"], [], [], ["control_site_low_cmp_expectation"]),
    target("gov-usa", "https://www.usa.gov/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["government_like_control"]),
    target("gov-ftc", "https://www.ftc.gov/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["government_like_control"]),
    target("gov-consumerfinance", "https://www.consumerfinance.gov/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["government_like_control"]),
    target("gov-nih", "https://www.nih.gov/", "education/nonprofit/government-like", "control", ["standard", "policy"], ["weak_or_no_consent_surface", "cookie_notice_availability"], [], [], ["government_like_control"]),
    target("control-example", "https://example.com/", "weak/no-consent examples", "control", ["tiny"], ["weak_or_no_consent_surface"], [], [], ["synthetic_web_control"]),
    target("control-kbdlab", "https://kbdlab.io/", "weak/no-consent examples", "control", ["tiny", "standard"], ["weak_or_no_consent_surface"], [], [], ["local_known_control_candidate"]),
  ];
}

function summarizeReviewCandidates(review: Record<string, unknown>): CandidateSummary[] {
  return asArray(review.findingCandidates)
    .map(asRecord)
    .map((candidate) => ({
      confidence: asNumber(candidate.confidence),
      eligibility: getEligibilityStatus(candidate),
      findingKey: asString(candidate.findingKey) ?? "unknown",
    }))
    .filter((candidate) => candidate.findingKey !== "unknown");
}

function summarizeObservedSignalTags(bundle: Record<string, unknown>, candidates: CandidateSummary[]) {
  const tags = new Set<string>();
  const derived = asRecord(bundle.derivedRuntimeSignals);
  if (asBoolean(derived.consentBannerLikelyPresent) === true) {
    tags.add("gdpr_eprivacy_consent_surface_observed");
  }
  if (asBoolean(derived.preConsentTrackingObserved) === true) {
    tags.add("targeted_advertising_signals");
  }
  if (asBoolean(derived.sessionReplayOrBehavioralAnalyticsObserved) === true) {
    tags.add("session_replay_fingerprinting_review");
  }
  if (asBoolean(derived.thirdPartyCookiesPreConsentObserved) === true) {
    tags.add("targeted_advertising_signals");
  }
  if (asBoolean(derived.consentBannerLikelyPresent) === false) {
    tags.add("weak_or_no_consent_surface");
  }
  for (const candidate of candidates) {
    if (candidate.eligibility !== "eligible") {
      continue;
    }
    tags.add(candidate.findingKey);
    const mapped = FINDING_TO_SIGNAL_TAG[candidate.findingKey];
    if (mapped) {
      tags.add(mapped);
    }
  }
  return [...tags].sort();
}

function resultToObservedSignalTags(result: CohortResult) {
  const tags = new Set<string>();
  if (asBoolean(result.runtime?.consentBannerLikelyPresent) === true) {
    tags.add("gdpr_eprivacy_consent_surface_observed");
  }
  if (asBoolean(result.runtime?.preConsentTrackingObserved) === true) {
    tags.add("targeted_advertising_signals");
  }
  if (asBoolean(result.runtime?.sessionReplayOrBehavioralAnalyticsObserved) === true) {
    tags.add("session_replay_fingerprinting_review");
  }
  for (const key of result.eligibleFindingKeys ?? []) {
    tags.add(key);
    const mapped = FINDING_TO_SIGNAL_TAG[key];
    if (mapped) {
      tags.add(mapped);
    }
  }
  return [...tags];
}

function resultToLimitations(result: CohortResult) {
  const limitations = [
    ...asStringArray(result.runtime?.coverageLimitationKeys),
    ...asStringArray(result.runtime?.noGoReasons),
  ];
  if (result.status === "failed" && result.error) {
    limitations.push(result.error);
  }
  return [...new Set(limitations)].sort();
}

function latestRecordFor(records: ArtifactRecord[], domain: string, profile: string) {
  return records.find((record) => record.domain === domain && record.profile === profile);
}

function highestConfidence(record: ArtifactRecord, key: string) {
  const direct = record.reviewCandidates
    .filter((candidate) => candidate.findingKey === key || FINDING_TO_SIGNAL_TAG[candidate.findingKey] === key)
    .map((candidate) => candidate.confidence ?? 0);
  return direct.length > 0 ? Math.max(...direct) : undefined;
}

function maxConfidence(record: ArtifactRecord) {
  const confidences = record.reviewCandidates.map((candidate) => candidate.confidence ?? 0);
  return confidences.length > 0 ? Math.max(...confidences) : 0;
}

function serializeArtifactRecord(record: ArtifactRecord) {
  return {
    url: record.url,
    domain: record.domain,
    scanProfile: record.profile,
    artifactPaths: record.artifactPaths,
    scanStatus: record.status,
    createdTimestamp: record.createdAt,
    packageVersions: record.packageVersions,
    expectedOrObservedSignalTags: record.observedSignalTags,
    knownLimitations: record.knownLimitations,
  };
}

function getEligibilityStatus(candidate: Record<string, unknown>) {
  const eligibility = candidate.eligibility;
  if (typeof eligibility === "string") {
    return eligibility;
  }
  return asString(asRecord(eligibility).status) ?? "unknown";
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readBundleMetadata(filePath: string): Promise<BundleMetadata> {
  const file = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(16_384);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const url = firstJsonStringField(text, "url");
    const normalizedUrl = firstJsonStringField(text, "normalizedUrl");
    const profile = firstJsonStringField(text, "profileId") ?? "unknown";
    return {
      domain: domainFromUrl(url ?? normalizedUrl) ?? path.basename(path.dirname(filePath)),
      normalizedUrl,
      profile,
      url,
    };
  } finally {
    await file.close();
  }
}

function firstJsonStringField(text: string, fieldName: string): string | undefined {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(text);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/\\(["\\/bfnrt])/g, "$1");
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function domainFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function safeMtime(filePath: string) {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return GENERATED_AT;
  }
}

function isInside(filePath: string, maybeParent: string) {
  const relative = path.relative(path.resolve(maybeParent), path.resolve(filePath));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isGeneratedGoldCorpusFile(filePath: string, artifactRoot: string) {
  return isInside(filePath, path.join(artifactRoot, "gold-corpus"));
}

function compactRecord(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => existsSync(value)));
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function sortNestedRecord(record: Record<string, Record<string, number>>) {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, sortRecord(value)]),
  );
}
