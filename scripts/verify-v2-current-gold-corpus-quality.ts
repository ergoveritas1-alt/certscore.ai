#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type QualityStatus = "accepted" | "accepted_with_limitations" | "needs_attention" | "planned_only";

interface CurrentGoldCorpusManifest {
  manifestVersion: string;
  generatedAt: string;
  summary: {
    qualityStatusCounts?: Record<string, number>;
    totalTargets?: number;
  };
  targets: CorpusTarget[];
}

interface CorpusTarget {
  targetId: string;
  targetType: "live_site" | "synthetic_fixture";
  canonicalUrl?: string;
  domain?: string;
  split: "train" | "validation" | "test";
  sourceSets: string[];
  laneTags: string[];
  corpusLabels?: Array<{
    labels?: string[];
    reason?: string;
  }>;
  qualityStatus: QualityStatus;
  acceptedArtifacts: Array<{
    artifactPaths?: Record<string, string>;
    profile?: string;
    reviewCandidateCounts?: {
      eligible?: number;
      notEligible?: number;
      total?: number;
    };
    source?: string;
    status?: string;
    statusReasons?: string[];
  }>;
  eligibility?: {
    candidateBacklog?: boolean;
    holdoutEligible?: boolean;
    regressionOnly?: boolean;
    trainingEligible?: boolean;
    validationEligible?: boolean;
    reasons?: string[];
  };
}

interface GateFinding {
  severity: "fail" | "warn" | "info";
  code: string;
  message: string;
  targetIds: string[];
}

type TriageBucket = "scanner_hardening" | "corpus_relabel_review" | "replacement_candidate";

interface TriageDecision {
  bucket: TriageBucket;
  domain?: string;
  reasons: string[];
  suggestedAction: string;
  targetId: string;
  url?: string;
}

interface QualityGateReport {
  reportVersion: "wc01.v2_current_gold_corpus_quality_gate.1";
  generatedAt: string;
  input: {
    manifestPath: string;
    outDir: string;
  };
  status: "pass" | "warn" | "fail";
  summary: {
    targets: number;
    liveTargets: number;
    syntheticFixtures: number;
    accepted: number;
    acceptedWithLimitations: number;
    needsAttention: number;
    plannedOnly: number;
    trainingEligible: number;
    validationEligible: number;
    holdoutEligible: number;
    regressionOnly: number;
    candidateBacklog: number;
  };
  findings: GateFinding[];
  triage: {
    scannerHardening: TriageDecision[];
    corpusRelabelReview: TriageDecision[];
    replacementCandidate: TriageDecision[];
  };
  queues: Record<string, {
    count: number;
    path: string;
  }>;
}

interface TriageDiagnosticsReport {
  reportVersion: "wc01.v2_current_gold_corpus_triage_diagnostics.1";
  generatedAt: string;
  input: {
    qualityGatePath: string;
  };
  summary: {
    scannerHardeningTargets: number;
    corpusRelabelReviewTargets: number;
    replacementCandidateTargets: number;
  };
  rootCauseGroups: RootCauseGroup[];
  recommendedCommandOrder: Array<{
    description: string;
    command: string;
    queue: string;
    rationale: string;
  }>;
}

interface RootCauseGroup {
  rootCause: string;
  bucket: TriageBucket;
  count: number;
  urls: string[];
  suggestedAction: string;
}

interface Args {
  help: boolean;
  manifestPath: string;
  outDir: string;
}

const DEFAULT_MANIFEST_PATH = path.join("artifacts", "gold-corpus", "v2-current", "GoldCorpusManifest.json");
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current", "quality-gate");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const manifest = JSON.parse(await readFile(args.manifestPath, "utf8")) as CurrentGoldCorpusManifest;
  const findings = buildFindings(manifest);
  const triage = buildTriage(manifest);
  const queues = buildQueues(manifest);
  const status = findings.some((finding) => finding.severity === "fail")
    ? "fail"
    : findings.some((finding) => finding.severity === "warn") ? "warn" : "pass";
  const report: QualityGateReport = {
    reportVersion: "wc01.v2_current_gold_corpus_quality_gate.1",
    generatedAt: new Date().toISOString(),
    input: {
      manifestPath: args.manifestPath,
      outDir: args.outDir,
    },
    status,
    summary: summarize(manifest),
    findings,
    triage,
    queues: {},
  };

  await mkdir(args.outDir, { recursive: true });
  await mkdir(path.join(args.outDir, "queues"), { recursive: true });
  for (const [queueName, urls] of Object.entries(queues)) {
    const queuePath = path.join(args.outDir, "queues", `${queueName}.urls.txt`);
    await writeFile(queuePath, urls.length > 0 ? `${urls.join("\n")}\n` : "");
    report.queues[queueName] = {
      count: urls.length,
      path: queuePath,
    };
  }
  const diagnostics = buildTriageDiagnostics(report);
  await writeFile(path.join(args.outDir, "GoldCorpusQualityGate.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(args.outDir, "GoldCorpusQualityGate.md"), renderMarkdown(report));
  await writeFile(path.join(args.outDir, "GoldCorpusTriageDiagnostics.json"), `${JSON.stringify(diagnostics, null, 2)}\n`);
  await writeFile(path.join(args.outDir, "GoldCorpusTriageDiagnostics.md"), renderTriageDiagnosticsMarkdown(diagnostics));
  console.log(JSON.stringify({
    outDir: args.outDir,
    status: report.status,
    summary: report.summary,
    queueCounts: Object.fromEntries(Object.entries(report.queues).map(([key, value]) => [key, value.count])),
  }, null, 2));
}

function buildFindings(manifest: CurrentGoldCorpusManifest): GateFinding[] {
  const findings: GateFinding[] = [];
  const needsAttention = manifest.targets.filter((target) => target.qualityStatus === "needs_attention");
  const plannedOnly = manifest.targets.filter((target) => target.qualityStatus === "planned_only");
  const missingArtifacts = manifest.targets.filter((target) =>
    target.qualityStatus !== "planned_only" &&
    target.acceptedArtifacts.length === 0
  );
  const missingConsentExecution = manifest.targets.filter((target) =>
    target.targetType === "live_site" &&
    target.sourceSets.includes("consent_dag_expansion_50") &&
    !target.acceptedArtifacts.some((artifact) => artifact.artifactPaths?.consentScenarioExecution)
  );
  const privacyOptOutWeak = manifest.targets.filter(targetNeedsPrivacyOptOutProofReview);
  const cmpWeak = manifest.targets.filter(targetNeedsCmpActionProofReview);
  const unstableHoldout = manifest.targets.filter((target) =>
    target.split === "test" && ["needs_attention", "planned_only"].includes(target.qualityStatus)
  );
  const zeroEligible = manifest.targets.filter((target) =>
    target.targetType === "live_site" &&
    hasUnresolvedZeroEligibleTarget(target)
  );

  if (needsAttention.length > 0) {
    findings.push(finding("fail", "needs_attention_targets", `${needsAttention.length} targets need attention.`, needsAttention));
  }
  if (plannedOnly.length > 0) {
    findings.push(finding("fail", "planned_only_targets", `${plannedOnly.length} targets are planned only.`, plannedOnly));
  }
  if (missingArtifacts.length > 0) {
    findings.push(finding("fail", "missing_accepted_artifacts", `${missingArtifacts.length} accepted targets have no artifact refs.`, missingArtifacts));
  }
  if (missingConsentExecution.length > 0) {
    findings.push(finding("fail", "missing_consent_scenario_execution", `${missingConsentExecution.length} consent DAG targets lack execution artifacts.`, missingConsentExecution));
  }
  if (privacyOptOutWeak.length > 0) {
    findings.push(finding("warn", "privacy_opt_out_needs_proof_review", `${privacyOptOutWeak.length} privacy opt-out targets need action-proof review.`, privacyOptOutWeak));
  }
  if (cmpWeak.length > 0) {
    findings.push(finding("warn", "cmp_accept_reject_needs_review", `${cmpWeak.length} CMP accept/reject targets need action-proof or deadline review.`, cmpWeak));
  }
  if (unstableHoldout.length > 0) {
    findings.push(finding("fail", "unstable_holdout_targets", `${unstableHoldout.length} holdout targets are unstable or planned-only.`, unstableHoldout));
  }
  if (zeroEligible.length > 0) {
    findings.push(finding("warn", "zero_eligible_review_candidates", `${zeroEligible.length} live targets have a completed artifact with zero eligible review candidates.`, zeroEligible));
  }

  return findings;
}

function buildQueues(manifest: CurrentGoldCorpusManifest): Record<string, string[]> {
  const liveTargets = manifest.targets.filter((target) => target.targetType === "live_site" && target.canonicalUrl);
  const triage = buildTriage(manifest);
  const needsAttention = liveTargets.filter((target) => target.qualityStatus === "needs_attention");
  const plannedOnly = liveTargets.filter((target) => target.qualityStatus === "planned_only");
  const privacyOptOut = liveTargets.filter(targetNeedsPrivacyOptOutProofReview);
  const cmpHeavy = liveTargets.filter(targetNeedsCmpActionProofReview);
  const consentRerun = needsAttention.filter((target) =>
    target.acceptedArtifacts.some((artifact) => (artifact.statusReasons ?? []).some((reason) => /consentFlow|preConsent|Target page|deadline|budget/i.test(reason)))
  );
  const policyRerun = needsAttention.filter((target) =>
    target.acceptedArtifacts.some((artifact) => (artifact.statusReasons ?? []).some((reason) => /policySurface|policy/i.test(reason)))
  );
  const fullRerun = needsAttention.filter((target) =>
    target.acceptedArtifacts.some((artifact) => artifact.profile === "full" && (artifact.statusReasons ?? []).length > 0)
  );
  const trainingEligible = liveTargets.filter((target) => target.eligibility?.trainingEligible);
  const validationEligible = liveTargets.filter((target) => target.eligibility?.validationEligible);
  const holdoutEligible = liveTargets.filter((target) => target.eligibility?.holdoutEligible);
  const zeroEligible = liveTargets.filter((target) =>
    hasUnresolvedZeroEligibleTarget(target)
  );

  return {
    "needs-attention": urls(needsAttention),
    "planned-only": urls(plannedOnly),
    "consent-dag-rerun": urls(consentRerun),
    "policy-rerun": urls(policyRerun),
    "full-profile-rerun": urls(fullRerun),
    "privacy-opt-out-proof-review": urls(privacyOptOut),
    "cmp-heavy-review": urls(cmpHeavy),
    "training-eligible": urls(trainingEligible),
    "validation-eligible": urls(validationEligible),
    "holdout-eligible": urls(holdoutEligible),
    "zero-eligible-review": urls(zeroEligible),
    "scanner-hardening": urlsFromTriage(triage.scannerHardening),
    "corpus-relabel-review": urlsFromTriage(triage.corpusRelabelReview),
    "replacement-candidate": urlsFromTriage(triage.replacementCandidate),
  };
}

function buildTriage(manifest: CurrentGoldCorpusManifest): QualityGateReport["triage"] {
  const liveTargets = manifest.targets.filter((target) => target.targetType === "live_site");
  const replacementCandidate = liveTargets
    .filter((target) => isReplacementCandidate(target))
    .map((target) => triageDecision(target, "replacement_candidate"));
  const replacementIds = new Set(replacementCandidate.map((decision) => decision.targetId));
  const scannerHardening = liveTargets
    .filter((target) =>
      !replacementIds.has(target.targetId) &&
      !hasCorpusLabel(target, "quarantine_replacement_candidate") &&
      target.qualityStatus === "needs_attention" &&
      hasScannerHardeningSignal(target)
    )
    .map((target) => triageDecision(target, "scanner_hardening"));
  const hardeningIds = new Set(scannerHardening.map((decision) => decision.targetId));
  const corpusRelabelReview = liveTargets
    .filter((target) =>
      !replacementIds.has(target.targetId) &&
      !hardeningIds.has(target.targetId) &&
      hasUnresolvedZeroEligibleTarget(target)
    )
    .map((target) => triageDecision(target, "corpus_relabel_review"));
  return {
    scannerHardening,
    corpusRelabelReview,
    replacementCandidate,
  };
}

function isReplacementCandidate(target: CorpusTarget): boolean {
  if (hasCorpusLabel(target, "quarantine_replacement_candidate")) {
    return false;
  }
  if (target.split === "test" && ["needs_attention", "planned_only"].includes(target.qualityStatus)) {
    return true;
  }
  const reasons = reasonText(target);
  const hardNavigationFailures = reasons.filter((reason) =>
    /ERR_HTTP2_PROTOCOL_ERROR|Target page, context or browser has been closed|context or browser has been closed|page\.goto: Timeout|net::ERR_ABORTED/i.test(reason)
  );
  const scannerFailures = reasons.filter((reason) =>
    /preConsentRuntimeScanner:failed|consentFlowRuntimeScanner:failed|policySurfaceScanner:failed/i.test(reason)
  );
  return hardNavigationFailures.length >= 2 || scannerFailures.length >= 2;
}

function hasScannerHardeningSignal(target: CorpusTarget): boolean {
  return reasonText(target).some((reason) =>
    /skipped_budget|deadline|Timeout|Target page|context or browser|policySurfaceScanner|consentFlowRuntimeScanner|preConsentRuntimeScanner|Screenshot fallback|ERR_HTTP2_PROTOCOL_ERROR|net::ERR_ABORTED/i.test(reason)
  );
}

function targetNeedsPrivacyOptOutProofReview(target: CorpusTarget): boolean {
  if (
    target.targetType !== "live_site" ||
    !target.laneTags.includes("privacy_opt_out_flow") ||
    target.qualityStatus === "planned_only" ||
    hasCorpusLabel(target, "quarantine_replacement_candidate")
  ) {
    return false;
  }
  return !target.acceptedArtifacts.some((artifact) =>
    artifactHasConsentScenarioExecution(artifact) &&
    !artifactHasPrivacyOptOutFailureReason(artifact)
  );
}

function targetNeedsCmpActionProofReview(target: CorpusTarget): boolean {
  if (
    target.targetType !== "live_site" ||
    target.qualityStatus === "planned_only" ||
    (!target.laneTags.includes("reject_all_flow") && !target.laneTags.includes("accept_all_flow"))
  ) {
    return false;
  }
  if (target.acceptedArtifacts.some((artifact) =>
    artifactHasConsentScenarioExecution(artifact) &&
    !artifactHasCmpActionFailureReason(artifact)
  )) {
    return false;
  }
  return target.acceptedArtifacts.some(artifactHasCmpActionFailureReason);
}

function artifactHasConsentScenarioExecution(artifact: CorpusTarget["acceptedArtifacts"][number]): boolean {
  return Object.values(artifact.artifactPaths ?? {}).some((artifactPath) =>
    /consent_scenario_execution\.json$/.test(artifactPath)
  );
}

function artifactHasPrivacyOptOutFailureReason(artifact: CorpusTarget["acceptedArtifacts"][number]): boolean {
  return (artifact.statusReasons ?? []).some((reason) =>
    /privacy_opt_out_flow:.*(?:failed|Timeout|deadline|Target page|budget_exhausted)|do_not_sell.*(?:failed|deadline|Target page|budget_exhausted)|opt.?out.*(?:failed|deadline|Target page|budget_exhausted)/i.test(reason)
  );
}

function artifactHasCmpActionFailureReason(artifact: CorpusTarget["acceptedArtifacts"][number]): boolean {
  return (artifact.statusReasons ?? []).some((reason) =>
    /(?:reject_all_flow|accept_all_flow):.*(?:failed|Timeout|deadline|Target page|budget_exhausted)|consentFlowRuntimeScanner:failed/i.test(reason)
  );
}

function hasUnresolvedZeroEligibleTarget(target: CorpusTarget): boolean {
  return hasOnlyZeroEligibleReviewedArtifacts(target) &&
    !hasCorpusLabel(target, "expected_zero_control") &&
    !hasCorpusLabel(target, "quarantine_replacement_candidate");
}

function hasOnlyZeroEligibleReviewedArtifacts(target: CorpusTarget): boolean {
  const reviewedCounts = target.acceptedArtifacts
    .filter((artifact) => artifact.status === "completed" && (artifact.reviewCandidateCounts?.total ?? 0) > 0)
    .map((artifact) => artifact.reviewCandidateCounts?.eligible ?? 0);
  return reviewedCounts.length > 0 && reviewedCounts.every((count) => count === 0);
}

function hasCorpusLabel(target: CorpusTarget, label: string): boolean {
  return (target.corpusLabels ?? []).some((entry) => (entry.labels ?? []).includes(label));
}

function triageDecision(target: CorpusTarget, bucket: TriageBucket): TriageDecision {
  return {
    bucket,
    domain: target.domain,
    reasons: triageReasons(target, bucket),
    suggestedAction: suggestedActionForBucket(bucket),
    targetId: target.targetId,
    url: target.canonicalUrl,
  };
}

function triageReasons(target: CorpusTarget, bucket: TriageBucket): string[] {
  const reasons = reasonText(target);
  if (bucket === "corpus_relabel_review") {
    const zeroArtifacts = target.acceptedArtifacts
      .filter((artifact) =>
        artifact.status === "completed" &&
        (artifact.reviewCandidateCounts?.total ?? 0) > 0 &&
        (artifact.reviewCandidateCounts?.eligible ?? 0) === 0
      )
      .map((artifact) => `${artifact.profile ?? "unknown"}: zero eligible of ${artifact.reviewCandidateCounts?.total ?? 0} review candidates`);
    return uniqueStrings(zeroArtifacts.length > 0 ? zeroArtifacts : ["zero eligible review candidates"]);
  }
  if (bucket === "replacement_candidate" && target.split === "test" && ["needs_attention", "planned_only"].includes(target.qualityStatus)) {
    return uniqueStrings([`unstable holdout ${target.qualityStatus}`, ...reasons]).slice(0, 8);
  }
  return uniqueStrings(reasons).slice(0, 8);
}

function suggestedActionForBucket(bucket: TriageBucket): string {
  if (bucket === "scanner_hardening") {
    return "Harden scanner/runtime handling, then rerun the relevant quality-gate repair queue.";
  }
  if (bucket === "corpus_relabel_review") {
    return "Review as a likely clean/control target or explicitly label expected zero-eligible behavior.";
  }
  return "Replace or quarantine before using this target as validation/holdout signal.";
}

function reasonText(target: CorpusTarget): string[] {
  return target.acceptedArtifacts.flatMap((artifact) => artifact.statusReasons ?? []);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function buildTriageDiagnostics(report: QualityGateReport): TriageDiagnosticsReport {
  const qualityGatePath = path.join(report.input.outDir, "GoldCorpusQualityGate.json");
  return {
    reportVersion: "wc01.v2_current_gold_corpus_triage_diagnostics.1",
    generatedAt: new Date().toISOString(),
    input: {
      qualityGatePath,
    },
    summary: {
      scannerHardeningTargets: report.triage.scannerHardening.length,
      corpusRelabelReviewTargets: report.triage.corpusRelabelReview.length,
      replacementCandidateTargets: report.triage.replacementCandidate.length,
    },
    rootCauseGroups: buildRootCauseGroups(report),
    recommendedCommandOrder: buildRecommendedCommandOrder(report, qualityGatePath),
  };
}

function buildRootCauseGroups(report: QualityGateReport): RootCauseGroup[] {
  const groups = new Map<string, { bucket: TriageBucket; decisions: TriageDecision[]; rootCause: string }>();
  const decisions = [
    ...report.triage.scannerHardening,
    ...report.triage.corpusRelabelReview,
    ...report.triage.replacementCandidate,
  ];
  for (const decision of decisions) {
    const rootCause = rootCauseForDecision(decision);
    const key = `${decision.bucket}:${rootCause}`;
    const existing = groups.get(key);
    if (existing) {
      existing.decisions.push(decision);
    } else {
      groups.set(key, {
        bucket: decision.bucket,
        decisions: [decision],
        rootCause,
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({
      rootCause: group.rootCause,
      bucket: group.bucket,
      count: group.decisions.length,
      urls: urlsFromTriage(group.decisions),
      suggestedAction: suggestedActionForRootCause(group.rootCause, group.bucket),
    }))
    .sort((left, right) =>
      bucketRank(left.bucket) - bucketRank(right.bucket) ||
      right.count - left.count ||
      left.rootCause.localeCompare(right.rootCause)
    );
}

function rootCauseForDecision(decision: TriageDecision): string {
  const reason = decision.reasons.join("\n");
  if (decision.bucket === "corpus_relabel_review") {
    return "zero_eligible_clean_control_review";
  }
  if (/unstable holdout/i.test(reason)) {
    return "unstable_holdout";
  }
  if (/policySurfaceScanner:skipped_budget|Policy-surface scanner was not ready/i.test(reason)) {
    return "policy_surface_late_or_budget";
  }
  if (/Screenshot fallback used|page\.screenshot: Timeout/i.test(reason)) {
    return "screenshot_capture_timeout";
  }
  if (/gpc_enabled: Scenario global deadline|gpc_enabled: page\.goto|gpc_enabled: browserContext\.cookies/i.test(reason)) {
    return "gpc_lane_timeout_or_navigation";
  }
  if (/privacy_opt_out_flow:.*Timeout|privacy_opt_out_flow:.*Target page|privacy_opt_out_flow:.*deadline/i.test(reason)) {
    return "privacy_opt_out_lane_timeout_or_navigation";
  }
  if (/reject_all_flow:.*deadline|accept_all_flow:.*Timeout/i.test(reason)) {
    return "choice_action_lane_timeout";
  }
  if (/ERR_HTTP2_PROTOCOL_ERROR|net::ERR_ABORTED|page\.goto: Timeout|Target page, context or browser has been closed|context or browser has been closed/i.test(reason)) {
    return "site_navigation_or_context_instability";
  }
  if (/policySurfaceScanner:failed/i.test(reason)) {
    return "policy_surface_failure";
  }
  if (/consentFlowRuntimeScanner:failed|Scenario global deadline/i.test(reason)) {
    return "consent_flow_global_deadline";
  }
  if (/preConsentRuntimeScanner:failed/i.test(reason)) {
    return "pre_consent_runtime_failure";
  }
  return "uncategorized";
}

function suggestedActionForRootCause(rootCause: string, bucket: TriageBucket): string {
  if (rootCause === "zero_eligible_clean_control_review") {
    return "Review as explicit clean/control corpus rows; relabel expected-zero targets or replace if they do not exercise useful coverage.";
  }
  if (rootCause === "unstable_holdout") {
    return "Quarantine from holdout and choose replacement targets before using test split quality.";
  }
  if (rootCause === "policy_surface_late_or_budget") {
    return "Decouple policy-surface completion from consent DAG deadline or run policy repair separately before full-profile repair.";
  }
  if (rootCause === "screenshot_capture_timeout") {
    return "Keep screenshot optional/late for consent lanes and verify DOM/HAR evidence remains sufficient.";
  }
  if (rootCause === "gpc_lane_timeout_or_navigation") {
    return "Harden GPC lane navigation/readiness and consider skipping comparison-only work when GPC evidence is already captured.";
  }
  if (rootCause === "privacy_opt_out_lane_timeout_or_navigation") {
    return "Give seeded privacy-choice paths a targeted navigation budget and fail as not-testable when the target control is unreachable.";
  }
  if (rootCause === "choice_action_lane_timeout") {
    return "Reuse baseline action recipes and tighten action-specific readiness before spending full scenario budget.";
  }
  if (rootCause === "site_navigation_or_context_instability") {
    return "Treat as unstable live target unless a scanner transport workaround proves repeatable.";
  }
  if (rootCause === "policy_surface_failure") {
    return "Run policy-rerun first and inspect whether this is scanner parsing, site blocking, or a corpus label issue.";
  }
  if (rootCause === "consent_flow_global_deadline") {
    return "Inspect scenario timings and either reduce lower-priority lanes or increase only the targeted scenario budget.";
  }
  if (rootCause === "pre_consent_runtime_failure") {
    return "Inspect navigation/screenshot failures before considering the target stable enough for train/validation.";
  }
  return bucket === "replacement_candidate"
    ? "Quarantine or replace unless repeatable evidence can be captured."
    : "Review manually and assign a sharper repair label.";
}

function buildRecommendedCommandOrder(
  report: QualityGateReport,
  qualityGatePath: string,
): TriageDiagnosticsReport["recommendedCommandOrder"] {
  const commandPrefix = "pnpm v2:gold-corpus-repair-pass --";
  const commands: TriageDiagnosticsReport["recommendedCommandOrder"] = [];
  if ((report.queues["scanner-hardening"]?.count ?? 0) > 0) {
    commands.push({
      queue: "scanner-hardening",
      description: "Run scanner-hardening repair captures first.",
      rationale: "These are the rows most likely to improve corpus quality after code/runtime fixes.",
      command: `${commandPrefix} --quality-gate ${qualityGatePath} --queues scanner-hardening --execute --isolated-sites --scan-step-timeout-ms 300000 --site-timeout-ms 360000 --out-dir artifacts/gold-corpus/v2-current/repair-pass-scanner-hardening`,
    });
  }
  if ((report.queues["corpus-relabel-review"]?.count ?? 0) > 0) {
    commands.push({
      queue: "corpus-relabel-review",
      description: "Review zero-eligible rows as clean/control candidates.",
      rationale: "These probably should not drive scanner hardening unless manual review finds missed expected signals.",
      command: `${commandPrefix} --quality-gate ${qualityGatePath} --queues corpus-relabel-review --out-dir artifacts/gold-corpus/v2-current/repair-pass-corpus-relabel-review`,
    });
  }
  if ((report.queues["replacement-candidate"]?.count ?? 0) > 0) {
    commands.push({
      queue: "replacement-candidate",
      description: "Quarantine or replace unstable rows.",
      rationale: "Avoid tuning against targets with repeated transport/context instability or unstable holdout behavior.",
      command: `${commandPrefix} --quality-gate ${qualityGatePath} --queues replacement-candidate --out-dir artifacts/gold-corpus/v2-current/repair-pass-replacement-candidate`,
    });
  }
  return commands;
}

function bucketRank(bucket: TriageBucket): number {
  if (bucket === "scanner_hardening") return 0;
  if (bucket === "corpus_relabel_review") return 1;
  return 2;
}

function summarize(manifest: CurrentGoldCorpusManifest): QualityGateReport["summary"] {
  return {
    targets: manifest.targets.length,
    liveTargets: manifest.targets.filter((target) => target.targetType === "live_site").length,
    syntheticFixtures: manifest.targets.filter((target) => target.targetType === "synthetic_fixture").length,
    accepted: manifest.targets.filter((target) => target.qualityStatus === "accepted").length,
    acceptedWithLimitations: manifest.targets.filter((target) => target.qualityStatus === "accepted_with_limitations").length,
    needsAttention: manifest.targets.filter((target) => target.qualityStatus === "needs_attention").length,
    plannedOnly: manifest.targets.filter((target) => target.qualityStatus === "planned_only").length,
    trainingEligible: manifest.targets.filter((target) => target.eligibility?.trainingEligible).length,
    validationEligible: manifest.targets.filter((target) => target.eligibility?.validationEligible).length,
    holdoutEligible: manifest.targets.filter((target) => target.eligibility?.holdoutEligible).length,
    regressionOnly: manifest.targets.filter((target) => target.eligibility?.regressionOnly).length,
    candidateBacklog: manifest.targets.filter((target) => target.eligibility?.candidateBacklog).length,
  };
}

function finding(
  severity: GateFinding["severity"],
  code: string,
  message: string,
  targets: CorpusTarget[],
): GateFinding {
  return {
    severity,
    code,
    message,
    targetIds: targets.map((target) => target.targetId).sort(),
  };
}

function urls(targets: CorpusTarget[]): string[] {
  return [...new Set(targets.map((target) => target.canonicalUrl).filter((url): url is string => Boolean(url)))].sort();
}

function urlsFromTriage(decisions: TriageDecision[]): string[] {
  return [...new Set(decisions.map((decision) => decision.url).filter((url): url is string => Boolean(url)))].sort();
}

function renderMarkdown(report: QualityGateReport): string {
  const lines = [
    "# V2 Current Gold Corpus Quality Gate",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Targets: ${report.summary.targets}`,
    `- Live targets: ${report.summary.liveTargets}`,
    `- Synthetic fixtures: ${report.summary.syntheticFixtures}`,
    `- Accepted: ${report.summary.accepted}`,
    `- Accepted with limitations: ${report.summary.acceptedWithLimitations}`,
    `- Needs attention: ${report.summary.needsAttention}`,
    `- Planned only: ${report.summary.plannedOnly}`,
    `- Training eligible: ${report.summary.trainingEligible}`,
    `- Validation eligible: ${report.summary.validationEligible}`,
    `- Holdout eligible: ${report.summary.holdoutEligible}`,
    "",
    "## Findings",
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("- No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
    }
  }
  lines.push("", "## Triage", "");
  lines.push(`- Scanner hardening: ${report.triage.scannerHardening.length}`);
  lines.push(`- Corpus relabel review: ${report.triage.corpusRelabelReview.length}`);
  lines.push(`- Replacement candidates: ${report.triage.replacementCandidate.length}`);
  lines.push("");
  for (const [title, decisions] of [
    ["Scanner Hardening", report.triage.scannerHardening],
    ["Corpus Relabel Review", report.triage.corpusRelabelReview],
    ["Replacement Candidates", report.triage.replacementCandidate],
  ] as const) {
    lines.push(`### ${title}`);
    lines.push("");
    if (decisions.length === 0) {
      lines.push("- None.");
      lines.push("");
      continue;
    }
    for (const decision of decisions) {
      const reason = decision.reasons[0] ? `: ${decision.reasons[0]}` : "";
      lines.push(`- ${decision.targetId} (${decision.url ?? decision.domain ?? "unknown"})${reason}`);
    }
    lines.push("");
  }
  lines.push("", "## Queues", "");
  for (const [name, queue] of Object.entries(report.queues)) {
    lines.push(`- ${name}: ${queue.count} (${queue.path})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderTriageDiagnosticsMarkdown(report: TriageDiagnosticsReport): string {
  const lines = [
    "# V2 Current Gold Corpus Triage Diagnostics",
    "",
    "Internal diagnostic only. Artifact-only. Does not change production report behavior.",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Scanner hardening targets: ${report.summary.scannerHardeningTargets}`,
    `- Corpus relabel review targets: ${report.summary.corpusRelabelReviewTargets}`,
    `- Replacement candidates: ${report.summary.replacementCandidateTargets}`,
    "",
    "## Recommended Command Order",
    "",
  ];
  if (report.recommendedCommandOrder.length === 0) {
    lines.push("- No commands recommended.");
  } else {
    for (const [index, command] of report.recommendedCommandOrder.entries()) {
      lines.push(`${index + 1}. ${command.description}`);
      lines.push("");
      lines.push(`   Rationale: ${command.rationale}`);
      lines.push("");
      lines.push("   ```bash");
      lines.push(`   ${command.command}`);
      lines.push("   ```");
      lines.push("");
    }
  }
  lines.push("## Root Cause Groups", "");
  if (report.rootCauseGroups.length === 0) {
    lines.push("- No root cause groups.");
  } else {
    for (const group of report.rootCauseGroups) {
      lines.push(`### ${group.rootCause}`);
      lines.push("");
      lines.push(`- Bucket: ${group.bucket}`);
      lines.push(`- Count: ${group.count}`);
      lines.push(`- Suggested action: ${group.suggestedAction}`);
      lines.push(`- URLs: ${group.urls.join(", ") || "none"}`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outDir: DEFAULT_OUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--manifest" && next) {
      args.manifestPath = next;
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
    "Usage: pnpm v2:gold-corpus-quality-gate -- [options]",
    "",
    "Verifies the unified v2 current gold corpus manifest and emits rerun/training queues.",
    "Artifact-only. Does not change production behavior.",
    "",
    "Options:",
    "  --manifest <path>",
    "  --out-dir <path>",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
