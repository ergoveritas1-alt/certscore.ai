#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  replayConsentFlowEvidenceCorpus,
  type ReplayEvidenceReport,
  type ReplayEvidenceSiteReport,
} from "../packages/certscore-scan-core/src/index.js";

type LaneId =
  | "cmp_first_layer_accept_reject"
  | "post_reject_tracking"
  | "post_accept_behavior"
  | "gpc_context"
  | "privacy_opt_out"
  | "form_collection_probe"
  | "accessibility_probe"
  | "policy_surface_merge"
  | "no_go_or_non_representative";

interface LaneDefinition {
  id: LaneId;
  label: string;
  minimumSites: number;
  description: string;
}

interface LaneCoverage {
  id: LaneId;
  label: string;
  minimumSites: number;
  coveredSites: Array<{
    siteId: string;
    sourceUrl?: string;
    reason: string;
  }>;
  missingSites: number;
  status: "pass" | "gap";
}

interface GoldCorpusCoverageReport {
  reportVersion: "wc01.v2_replay_gold_corpus_coverage.1";
  generatedAt: string;
  input: {
    baselinePath?: string;
    corpusDir?: string;
    evidenceReportPath?: string;
    outDir?: string;
    minimumSitesPerLane: number;
  };
  summary: {
    evaluatedSites: number;
    lanesPassing: number;
    lanesWithGaps: number;
    qualityStatus: CoverageQualityStatus;
    ready: boolean;
  };
  quality: CoverageQualitySummary;
  lanes: LaneCoverage[];
  siteLaneMatrix: Array<{
    siteId: string;
    sourceUrl?: string;
    lanes: LaneId[];
  }>;
}

type CoverageQualityStatus = "pass" | "warn" | "fail";

interface CoverageValueCounts {
  observed: number;
  testable: number;
  notObserved: number;
  notTestable: number;
  needsAdditionalProbe: number;
}

interface CoverageQualitySummary {
  status: CoverageQualityStatus;
  coverageAssessmentCounts: CoverageValueCounts;
  primaryCoverageAssessmentCounts: CoverageValueCounts;
  primaryScope: {
    includedSites: number;
    excludedNoGoSites: number;
  };
  consentBehaviorCounts: Record<string, number>;
  policyEvidenceCounts: Record<string, number>;
  actionProofReview: ActionProofReviewSummary;
  coverageAssessmentBySection: Record<string, Record<string, number>>;
  opportunities: CoverageOpportunitySummary;
  siteStatusCounts: Array<{
    siteId: string;
    sourceUrl?: string;
    coverageAssessmentCounts: CoverageValueCounts;
    primaryQualityIncluded: boolean;
    lanes: LaneId[];
  }>;
  baselineComparison?: CoverageBaselineComparison;
}

interface ActionProofReviewSummary {
  cmpRegressionRiskCells: number;
  cmpRegressionRiskSites: Array<{
    siteId: string;
    sourceUrl?: string;
    fields: string[];
    notes: string[];
  }>;
  privacyOptOutNotTestableCells: number;
  privacyOptOutNotTestableSites: Array<{
    siteId: string;
    sourceUrl?: string;
    optOutAction: string;
    postOptOutPrivacyBehavior: string;
    notes: string[];
  }>;
}

type CoverageOpportunityBucket = "candidate_improvement" | "expected_limitation" | "regression_risk";
type CoverageOpportunityStatus = "not_observed" | "not_testable" | "needs_additional_probe";

interface CoverageOpportunitySummary {
  totals: Record<CoverageOpportunityBucket, number>;
  byStatus: Record<CoverageOpportunityStatus, Record<CoverageOpportunityBucket, number>>;
  topGroups: CoverageOpportunityGroup[];
  siteTotals: Array<{
    siteId: string;
    sourceUrl?: string;
    candidateImprovement: number;
    expectedLimitation: number;
    regressionRisk: number;
  }>;
}

interface CoverageOpportunityGroup {
  path: string;
  status: CoverageOpportunityStatus;
  bucket: CoverageOpportunityBucket;
  count: number;
  reasonCode: string;
  suggestedAction: string;
  affectedSites: Array<{
    siteId: string;
    sourceUrl?: string;
  }>;
}

interface CoverageBaselineComparison {
  baselinePath: string;
  comparisonMode: "strict_same_site_set" | "informational_site_set_changed";
  sameSiteSet: boolean;
  baselineSites: number;
  currentSites: number;
  laneDeltas: Array<{
    id: LaneId;
    label: string;
    baselineCovered: number;
    currentCovered: number;
    deltaCovered: number;
    baselineStatus: LaneCoverage["status"];
    currentStatus: LaneCoverage["status"];
  }>;
  coverageAssessmentDeltas: {
    observed: number;
    testable: number;
    notObserved: number;
    notTestable: number;
    needsAdditionalProbe: number;
  };
  regressions: string[];
  warnings: string[];
}

const laneDefinitions: LaneDefinition[] = [
  {
    id: "cmp_first_layer_accept_reject",
    label: "CMP accept/reject proof",
    minimumSites: 3,
    description: "Site has testable accept-all and reject/decline CMP behavior.",
  },
  {
    id: "post_reject_tracking",
    label: "Post-reject tracking comparison",
    minimumSites: 3,
    description: "Site has an established post-reject network/cookie comparison lane.",
  },
  {
    id: "post_accept_behavior",
    label: "Post-accept behavior",
    minimumSites: 3,
    description: "Site has an accept-all path and post-accept network activity.",
  },
  {
    id: "gpc_context",
    label: "GPC context",
    minimumSites: 3,
    description: "Site has a replayable GPC-enabled capture.",
  },
  {
    id: "privacy_opt_out",
    label: "Privacy opt-out / do-not-sell behavior",
    minimumSites: 3,
    description: "Site has an observed and testable privacy opt-out action.",
  },
  {
    id: "form_collection_probe",
    label: "Form collection probe",
    minimumSites: 3,
    description: "Site has a form/collection probe lane.",
  },
  {
    id: "accessibility_probe",
    label: "Consent/privacy accessibility probe",
    minimumSites: 3,
    description: "Site has an accessibility probe lane over retained controls/context.",
  },
  {
    id: "policy_surface_merge",
    label: "Policy-surface merge",
    minimumSites: 3,
    description: "Site has retained policy-surface evidence merged into replay evidence.",
  },
  {
    id: "no_go_or_non_representative",
    label: "No-go / non-representative page",
    minimumSites: 1,
    description: "Site represents blocked, unavailable, placeholder, or non-representative scan behavior.",
  },
];

void main();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.corpusDir && !args.evidenceReportPath) {
    printUsage();
    process.exit(1);
  }

  const evidenceReport = args.evidenceReportPath
    ? JSON.parse(await readFile(args.evidenceReportPath, "utf8")) as ReplayEvidenceReport
    : await replayConsentFlowEvidenceCorpus({ corpusDir: args.corpusDir });
  const baselineReport = args.baselinePath
    ? await readCoverageBaseline(args.baselinePath, {
      minimumSitesPerLane: args.minimumSitesPerLane,
    })
    : undefined;

  const report = buildGoldCorpusCoverageReport(evidenceReport, {
    baselinePath: args.baselinePath,
    corpusDir: args.corpusDir,
    evidenceReportPath: args.evidenceReportPath,
    outDir: args.outDir,
    minimumSitesPerLane: args.minimumSitesPerLane,
  }, baselineReport);

  const markdown = renderGoldCorpusCoverageMarkdown(report);
  if (args.outDir) {
    await mkdir(args.outDir, { recursive: true });
    await writeFile(path.join(args.outDir, "ReplayGoldCorpusCoverage.json"), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(args.outDir, "ReplayGoldCorpusCoverage.md"), markdown);
  }
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(markdown);
  }

  if (!report.summary.ready && args.failOnGap) {
    process.exit(2);
  }
  if (report.quality.status === "fail" && args.failOnQualityRegression) {
    process.exit(3);
  }
}

function buildGoldCorpusCoverageReport(
  evidenceReport: ReplayEvidenceReport,
  input: GoldCorpusCoverageReport["input"],
  baselineReport?: GoldCorpusCoverageReport,
): GoldCorpusCoverageReport {
  const siteLaneMatrix = evidenceReport.sites.map((site) => ({
    siteId: site.siteId,
    sourceUrl: site.sourceUrl,
    lanes: laneDefinitions
      .filter((definition) => siteCoversLane(site, definition.id))
      .map((definition) => definition.id),
  }));
  const lanes: LaneCoverage[] = laneDefinitions.map((definition) => {
    const minimumSites = input.minimumSitesPerLane > 0 && definition.id !== "no_go_or_non_representative"
      ? input.minimumSitesPerLane
      : definition.minimumSites;
    const coveredSites = evidenceReport.sites
      .filter((site) => siteCoversLane(site, definition.id))
      .map((site) => ({
        siteId: site.siteId,
        sourceUrl: site.sourceUrl,
        reason: laneReason(site, definition.id),
      }));
    const missingSites = Math.max(0, minimumSites - coveredSites.length);
    const status: LaneCoverage["status"] = missingSites === 0 ? "pass" : "gap";
    return {
      id: definition.id,
      label: definition.label,
      minimumSites,
      coveredSites,
      missingSites,
      status,
    };
  });
  const lanesPassing = lanes.filter((lane) => lane.status === "pass").length;
  const reportWithoutQuality: Omit<GoldCorpusCoverageReport, "quality"> = {
    reportVersion: "wc01.v2_replay_gold_corpus_coverage.1",
    generatedAt: new Date().toISOString(),
    input,
    summary: {
      evaluatedSites: evidenceReport.sites.length,
      lanesPassing,
      lanesWithGaps: lanes.length - lanesPassing,
      qualityStatus: "pass" as CoverageQualityStatus,
      ready: lanes.every((lane) => lane.status === "pass"),
    },
    lanes,
    siteLaneMatrix,
  };
  const quality = buildCoverageQualitySummary(evidenceReport, reportWithoutQuality, baselineReport);
  return {
    ...reportWithoutQuality,
    summary: {
      ...reportWithoutQuality.summary,
      qualityStatus: quality.status,
    },
    quality,
  };
}

async function readCoverageBaseline(
  baselinePath: string,
  options: { minimumSitesPerLane: number },
): Promise<GoldCorpusCoverageReport> {
  const parsed = JSON.parse(await readFile(baselinePath, "utf8")) as unknown;
  if (isGoldCorpusCoverageReport(parsed)) {
    return parsed;
  }
  const evidenceReport = parsed as ReplayEvidenceReport;
  if (!Array.isArray(evidenceReport.sites)) {
    throw new Error(`Baseline must be a ReplayGoldCorpusCoverage.json or ReplayEvidenceReport.json file: ${baselinePath}`);
  }
  return buildGoldCorpusCoverageReport(evidenceReport, {
    evidenceReportPath: baselinePath,
    minimumSitesPerLane: options.minimumSitesPerLane,
  });
}

function isGoldCorpusCoverageReport(value: unknown): value is GoldCorpusCoverageReport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { reportVersion?: unknown; lanes?: unknown; summary?: unknown; quality?: unknown };
  return candidate.reportVersion === "wc01.v2_replay_gold_corpus_coverage.1" &&
    Array.isArray(candidate.lanes) &&
    Boolean(candidate.summary);
}

function buildCoverageQualitySummary(
  evidenceReport: ReplayEvidenceReport,
  report: Omit<GoldCorpusCoverageReport, "quality">,
  baselineReport?: GoldCorpusCoverageReport,
): CoverageQualitySummary {
  const coverageAssessmentCounts = createCoverageValueCounts();
  const primaryCoverageAssessmentCounts = createCoverageValueCounts();
  const coverageAssessmentBySection: Record<string, Record<string, number>> = {};
  const consentBehaviorCounts: Record<string, number> = {};
  const policyEvidenceCounts: Record<string, number> = {};
  const lanesBySite = new Map(report.siteLaneMatrix.map((site) => [site.siteId, site.lanes]));
  const opportunities = buildCoverageOpportunitySummary(evidenceReport, lanesBySite);
  const actionProofReview = buildActionProofReviewSummary(evidenceReport, lanesBySite);

  const siteStatusCounts = evidenceReport.sites.map((site) => {
    const siteCounts = createCoverageValueCounts();
    const lanes = lanesBySite.get(site.siteId) ?? [];
    const primaryQualityIncluded = !lanes.includes("no_go_or_non_representative");
    collectCoverageAssessmentCounts(site.coverageAssessment, {
      total: coverageAssessmentCounts,
      primaryTotal: primaryQualityIncluded ? primaryCoverageAssessmentCounts : undefined,
      bySection: coverageAssessmentBySection,
      site: siteCounts,
    });
    collectStringCounts(site.consentBehaviorOutcome, consentBehaviorCounts);
    collectStringCounts(site.policyEvidenceOutcome, policyEvidenceCounts);
    return {
      siteId: site.siteId,
      sourceUrl: site.sourceUrl,
      coverageAssessmentCounts: siteCounts,
      primaryQualityIncluded,
      lanes,
    };
  });
  const primaryScope = {
    includedSites: siteStatusCounts.filter((site) => site.primaryQualityIncluded).length,
    excludedNoGoSites: siteStatusCounts.filter((site) => !site.primaryQualityIncluded).length,
  };

  const baselineComparison = baselineReport && report.input.baselinePath
    ? buildBaselineComparison(report, baselineReport, report.input.baselinePath, coverageAssessmentCounts)
    : undefined;
  const status = baselineComparison?.regressions.length
    ? "fail"
    : baselineComparison?.warnings.length
      ? "warn"
      : "pass";

  return {
    status,
    coverageAssessmentCounts,
    primaryCoverageAssessmentCounts,
    primaryScope,
    consentBehaviorCounts,
    policyEvidenceCounts,
    actionProofReview,
    coverageAssessmentBySection,
    opportunities,
    siteStatusCounts,
    baselineComparison,
  };
}

function buildCoverageOpportunitySummary(
  evidenceReport: ReplayEvidenceReport,
  lanesBySite: Map<string, LaneId[]>,
): CoverageOpportunitySummary {
  const groups = new Map<string, CoverageOpportunityGroup>();
  const siteTotals = new Map<string, {
    siteId: string;
    sourceUrl?: string;
    candidateImprovement: number;
    expectedLimitation: number;
    regressionRisk: number;
  }>();

  for (const site of evidenceReport.sites) {
    const lanes = lanesBySite.get(site.siteId) ?? [];
    const siteKey = site.siteId;
    siteTotals.set(siteKey, {
      siteId: site.siteId,
      sourceUrl: site.sourceUrl,
      candidateImprovement: 0,
      expectedLimitation: 0,
      regressionRisk: 0,
    });
    for (const issue of collectCoverageIssues(site.coverageAssessment)) {
      const classification = classifyCoverageIssue(site, lanes, issue);
      const groupKey = `${issue.path}\u0000${issue.status}\u0000${classification.bucket}\u0000${classification.reasonCode}`;
      const group = groups.get(groupKey) ?? {
        path: issue.path,
        status: issue.status,
        bucket: classification.bucket,
        count: 0,
        reasonCode: classification.reasonCode,
        suggestedAction: classification.suggestedAction,
        affectedSites: [],
      };
      group.count += 1;
      group.affectedSites.push({
        siteId: site.siteId,
        sourceUrl: site.sourceUrl,
      });
      groups.set(groupKey, group);

      const totals = siteTotals.get(siteKey);
      if (totals) {
        if (classification.bucket === "candidate_improvement") {
          totals.candidateImprovement += 1;
        } else if (classification.bucket === "expected_limitation") {
          totals.expectedLimitation += 1;
        } else {
          totals.regressionRisk += 1;
        }
      }
    }
  }

  const totals = createOpportunityBucketCounts();
  const byStatus = createOpportunityStatusCounts();
  const topGroups = [...groups.values()].sort((a, b) =>
    b.count - a.count ||
    bucketRank(a.bucket) - bucketRank(b.bucket) ||
    a.path.localeCompare(b.path),
  );
  for (const group of topGroups) {
    totals[group.bucket] += group.count;
    byStatus[group.status][group.bucket] += group.count;
  }

  return {
    totals,
    byStatus,
    topGroups,
    siteTotals: [...siteTotals.values()].sort((a, b) =>
      (b.candidateImprovement + b.regressionRisk) - (a.candidateImprovement + a.regressionRisk) ||
      (b.expectedLimitation - a.expectedLimitation) ||
      (a.sourceUrl ?? a.siteId).localeCompare(b.sourceUrl ?? b.siteId),
    ),
  };
}

function createOpportunityBucketCounts(): Record<CoverageOpportunityBucket, number> {
  return {
    candidate_improvement: 0,
    expected_limitation: 0,
    regression_risk: 0,
  };
}

function createOpportunityStatusCounts(): Record<CoverageOpportunityStatus, Record<CoverageOpportunityBucket, number>> {
  return {
    needs_additional_probe: createOpportunityBucketCounts(),
    not_observed: createOpportunityBucketCounts(),
    not_testable: createOpportunityBucketCounts(),
  };
}

function buildActionProofReviewSummary(
  evidenceReport: ReplayEvidenceReport,
  lanesBySite: Map<string, LaneId[]>,
): ActionProofReviewSummary {
  const cmpFields = [
    "acceptAction",
    "declineRejectAction",
    "trackingAfterRefusal",
    "postAcceptBehavior",
  ] as const;
  const cmpRegressionRiskSites: ActionProofReviewSummary["cmpRegressionRiskSites"] = [];
  const privacyOptOutNotTestableSites: ActionProofReviewSummary["privacyOptOutNotTestableSites"] = [];
  let cmpRegressionRiskCells = 0;
  let privacyOptOutNotTestableCells = 0;

  for (const site of evidenceReport.sites) {
    const lanes = lanesBySite.get(site.siteId) ?? [];
    if (siteHasCmpSurface(site, lanes)) {
      const fields = cmpFields.filter((field) => site.coverageAssessment.gdprEprivacy[field] === "not_testable");
      if (fields.length > 0) {
        cmpRegressionRiskCells += fields.length;
        cmpRegressionRiskSites.push({
          siteId: site.siteId,
          sourceUrl: site.sourceUrl,
          fields: [...fields],
          notes: site.consentBehaviorOutcome.notes,
        });
      }
    }
    if (site.coverageAssessment.ccpaCpra.privacyOptOutBehavior === "not_testable") {
      privacyOptOutNotTestableCells += 1;
      privacyOptOutNotTestableSites.push({
        siteId: site.siteId,
        sourceUrl: site.sourceUrl,
        optOutAction: site.consentBehaviorOutcome.optOutAction,
        postOptOutPrivacyBehavior: site.consentBehaviorOutcome.postOptOutPrivacyBehavior,
        notes: site.consentBehaviorOutcome.notes,
      });
    }
  }

  return {
    cmpRegressionRiskCells,
    cmpRegressionRiskSites: cmpRegressionRiskSites.sort((left, right) =>
      (left.sourceUrl ?? left.siteId).localeCompare(right.sourceUrl ?? right.siteId),
    ),
    privacyOptOutNotTestableCells,
    privacyOptOutNotTestableSites: privacyOptOutNotTestableSites.sort((left, right) =>
      (left.sourceUrl ?? left.siteId).localeCompare(right.sourceUrl ?? right.siteId),
    ),
  };
}

function bucketRank(bucket: CoverageOpportunityBucket): number {
  switch (bucket) {
    case "regression_risk":
      return 0;
    case "candidate_improvement":
      return 1;
    case "expected_limitation":
      return 2;
  }
}

function siteHasCmpSurface(site: ReplayEvidenceSiteReport, lanes: LaneId[]): boolean {
  return site.consentBehaviorOutcome.cmpBanner === "observed" ||
    site.consentSurfaceType === "first_layer_banner" ||
    site.consentSurfaceType === "iframe_banner" ||
    site.consentSurfaceType === "preference_center" ||
    lanes.includes("cmp_first_layer_accept_reject");
}

function collectCoverageIssues(value: unknown): Array<{
  path: string;
  status: CoverageOpportunityStatus;
}> {
  const issues: Array<{
    path: string;
    status: CoverageOpportunityStatus;
  }> = [];
  walkCoverageIssues(value, "coverageAssessment", issues);
  return issues;
}

function walkCoverageIssues(
  value: unknown,
  path: string,
  issues: Array<{
    path: string;
    status: CoverageOpportunityStatus;
  }>,
): void {
  if (typeof value === "string") {
    if (isOpportunityStatus(value)) {
      issues.push({ path, status: value });
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      walkCoverageIssues(entry, `${path}[]`, issues);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    walkCoverageIssues(entry, `${path}.${key}`, issues);
  }
}

function isOpportunityStatus(value: string): value is CoverageOpportunityStatus {
  return value === "not_observed" || value === "not_testable" || value === "needs_additional_probe";
}

function classifyCoverageIssue(
  site: ReplayEvidenceSiteReport,
  lanes: LaneId[],
  issue: {
    path: string;
    status: CoverageOpportunityStatus;
  },
): {
  bucket: CoverageOpportunityBucket;
  reasonCode: string;
  suggestedAction: string;
} {
  const noGo = lanes.includes("no_go_or_non_representative");
  const hasPolicySurface = lanes.includes("policy_surface_merge") ||
    site.policyEvidenceOutcome.policyArtifactStatus === "present" ||
    site.policyEvidenceOutcome.privacyNoticeAvailability === "observed";
  const hasCmpSurface = siteHasCmpSurface(site, lanes);
  const hasConsentSurface = hasCmpSurface ||
    site.consentBehaviorOutcome.privacyChoicesSurface === "observed";
  const pathTail = issue.path.split(".").at(-1) ?? issue.path;

  if (noGo) {
    return {
      bucket: "expected_limitation",
      reasonCode: "no_go_or_non_representative_site",
      suggestedAction: "Keep as control coverage; exclude from primary improvement denominator unless the corpus target is replaced.",
    };
  }

  if (issue.status === "needs_additional_probe") {
    if (/noticeAtCollection/i.test(pathTail)) {
      return {
        bucket: "candidate_improvement",
        reasonCode: "notice_at_collection_probe_needed",
        suggestedAction: "Add bounded notice-at-collection page/form checks before leaving this as probe-needed.",
      };
    }
    if (/privacyOptOutBehavior/i.test(pathTail)) {
      return {
        bucket: "candidate_improvement",
        reasonCode: "privacy_opt_out_action_probe_needed",
        suggestedAction: "Improve seeded privacy-choice action recipes and final-state proof capture.",
      };
    }
    return {
      bucket: "candidate_improvement",
      reasonCode: "additional_probe_needed",
      suggestedAction: "Add a focused probe or fixture only if this lane is required by the profile.",
    };
  }

  if (/postChoiceConsentControls/i.test(pathTail)) {
    if (hasConsentSurface) {
      return {
        bucket: "candidate_improvement",
        reasonCode: "post_choice_control_absent_despite_consent_surface",
        suggestedAction: "Inspect CMP reopen/withdrawal control discovery before accepting post-choice absence.",
      };
    }
    return {
      bucket: "expected_limitation",
      reasonCode: "post_choice_control_absent_without_consent_surface",
      suggestedAction: "Keep as bounded absence unless later evidence discovers a consent surface.",
    };
  }

  if (isConsentActionPath(pathTail)) {
    if (hasCmpSurface) {
      return {
        bucket: "regression_risk",
        reasonCode: "consent_action_not_testable_despite_surface",
        suggestedAction: "Inspect baseline candidates/action proof; this may indicate a missed or failed CMP recipe.",
      };
    }
    return {
      bucket: "expected_limitation",
      reasonCode: "consent_action_not_testable_without_surface",
      suggestedAction: "Keep as limitation unless later evidence discovers a CMP, banner, or preference surface.",
    };
  }

  if (/privacyOptOutBehavior/i.test(pathTail) || /doNotSellShareAvailability|privacyChoicesAvailability/i.test(pathTail)) {
    if (hasPolicySurface) {
      return {
        bucket: "candidate_improvement",
        reasonCode: "privacy_choice_signal_absent_after_policy_surface",
        suggestedAction: "Improve privacy-choice link extraction and seeded URL discovery before accepting absence.",
      };
    }
    return {
      bucket: "candidate_improvement",
      reasonCode: "privacy_choice_signal_absent_without_policy_surface",
      suggestedAction: "Improve policy-surface discovery first; absence may be scan-limited.",
    };
  }

  if (isPolicyDisclosurePath(pathTail)) {
    if (issue.status === "not_testable") {
      if (hasPolicySurface) {
        return {
          bucket: "candidate_improvement",
          reasonCode: "policy_context_not_testable_despite_policy_surface",
          suggestedAction: "Inspect retained policy/runtime linkage and add a focused merge rule only if evidence is bounded.",
        };
      }
      return {
        bucket: "candidate_improvement",
        reasonCode: "policy_context_not_testable_without_policy_surface",
        suggestedAction: "Improve policy discovery/merge before interpreting this as a durable limitation.",
      };
    }
    if (hasPolicySurface) {
      return {
        bucket: "expected_limitation",
        reasonCode: "disclosure_not_observed_after_policy_surface",
        suggestedAction: "Treat as a valid negative observation unless a lane-specific fixture says this disclosure is expected.",
      };
    }
    return {
      bucket: "candidate_improvement",
      reasonCode: "disclosure_not_observed_without_policy_surface",
      suggestedAction: "Improve policy discovery/merge before interpreting this absence.",
    };
  }

  if (issue.status === "not_testable") {
    return {
      bucket: "expected_limitation",
      reasonCode: "not_testable_no_actionable_probe",
      suggestedAction: "Keep as explicit limitation unless this field becomes required for the profile.",
    };
  }

  return {
    bucket: "expected_limitation",
    reasonCode: "not_observed_after_available_coverage",
    suggestedAction: "Treat as bounded absence; do not convert to a finding without expected-lane evidence.",
  };
}

function isConsentActionPath(pathTail: string): boolean {
  return /acceptAction|postAcceptBehavior|declineRejectAction|trackingAfterRefusal/i.test(pathTail);
}

function isPolicyDisclosurePath(pathTail: string): boolean {
  return /privacyNoticeAvailability|noticeAtCollection|saleShareDisclosureSignals|targetedAdvertisingDisclosureSignals|sensitivePersonalInformationDisclosureSignals|consumerRightsSignals|runtimeVendorDisclosureContext|crossBorderEndpointReview/i.test(pathTail);
}

function buildBaselineComparison(
  current: Omit<GoldCorpusCoverageReport, "quality">,
  baseline: GoldCorpusCoverageReport,
  baselinePath: string,
  currentCoverageAssessmentCounts: CoverageValueCounts,
): CoverageBaselineComparison {
  const currentSiteIds = current.siteLaneMatrix.map((site) => site.siteId).sort();
  const baselineSiteIds = baseline.siteLaneMatrix.map((site) => site.siteId).sort();
  const sameSiteSet = JSON.stringify(currentSiteIds) === JSON.stringify(baselineSiteIds);
  const baselineLaneById = new Map(baseline.lanes.map((lane) => [lane.id, lane]));
  const regressions: string[] = [];
  const warnings: string[] = [];
  const laneDeltas = current.lanes.map((lane) => {
    const baselineLane = baselineLaneById.get(lane.id);
    const baselineCovered = baselineLane?.coveredSites.length ?? 0;
    const deltaCovered = lane.coveredSites.length - baselineCovered;
    if (baselineLane?.status === "pass" && lane.status === "gap") {
      regressions.push(`${lane.id} moved from pass to gap.`);
    } else if (deltaCovered < 0) {
      warnings.push(`${lane.id} covered ${Math.abs(deltaCovered)} fewer site(s) than baseline.`);
    }
    return {
      id: lane.id,
      label: lane.label,
      baselineCovered,
      currentCovered: lane.coveredSites.length,
      deltaCovered,
      baselineStatus: baselineLane?.status ?? "gap",
      currentStatus: lane.status,
    };
  });
  if (!sameSiteSet) {
    warnings.push("Coverage value counts are informational because the current site set differs from the baseline.");
  }

  const baselineCounts = baseline.quality?.coverageAssessmentCounts;
  const coverageAssessmentDeltas = baselineCounts
    ? subtractCoverageValueCounts(currentCoverageAssessmentCounts, baselineCounts)
    : {
      observed: 0,
      testable: 0,
      notObserved: 0,
      notTestable: 0,
      needsAdditionalProbe: 0,
    };
  if (!baselineCounts) {
    warnings.push("Baseline artifact has no coverage quality counters; only lane coverage was compared.");
  }

  if (sameSiteSet && baselineCounts) {
    if (coverageAssessmentDeltas.testable < 0) {
      regressions.push(`testable coverage count decreased by ${Math.abs(coverageAssessmentDeltas.testable)}.`);
    }
    if (coverageAssessmentDeltas.notTestable > 0) {
      if (coverageAssessmentDeltas.testable >= 0 && coverageAssessmentDeltas.notObserved <= -coverageAssessmentDeltas.notTestable) {
        warnings.push(
          `not_testable coverage count increased by ${coverageAssessmentDeltas.notTestable} while not_observed decreased; likely a more precise action-proof limitation classification.`,
        );
      } else {
        regressions.push(`not_testable coverage count increased by ${coverageAssessmentDeltas.notTestable}.`);
      }
    }
    if (coverageAssessmentDeltas.notObserved > 0) {
      warnings.push(`not_observed coverage count increased by ${coverageAssessmentDeltas.notObserved}.`);
    }
    if (coverageAssessmentDeltas.needsAdditionalProbe > 0) {
      warnings.push(`needs_additional_probe coverage count increased by ${coverageAssessmentDeltas.needsAdditionalProbe}.`);
    }
  }

  return {
    baselinePath,
    comparisonMode: sameSiteSet ? "strict_same_site_set" : "informational_site_set_changed",
    sameSiteSet,
    baselineSites: baseline.summary.evaluatedSites,
    currentSites: current.summary.evaluatedSites,
    laneDeltas,
    coverageAssessmentDeltas,
    regressions,
    warnings,
  };
}

function createCoverageValueCounts(): CoverageValueCounts {
  return {
    observed: 0,
    testable: 0,
    notObserved: 0,
    notTestable: 0,
    needsAdditionalProbe: 0,
  };
}

function subtractCoverageValueCounts(current: CoverageValueCounts, baseline: CoverageValueCounts): CoverageBaselineComparison["coverageAssessmentDeltas"] {
  return {
    observed: current.observed - baseline.observed,
    testable: current.testable - baseline.testable,
    notObserved: current.notObserved - baseline.notObserved,
    notTestable: current.notTestable - baseline.notTestable,
    needsAdditionalProbe: current.needsAdditionalProbe - baseline.needsAdditionalProbe,
  };
}

function collectCoverageAssessmentCounts(
  value: unknown,
  output: {
    total: CoverageValueCounts;
    primaryTotal?: CoverageValueCounts;
    bySection: Record<string, Record<string, number>>;
    site: CoverageValueCounts;
  },
): void {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [section, sectionValue] of Object.entries(value)) {
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
      continue;
    }
    const sectionCounts = output.bySection[section] ?? {};
    collectKnownCoverageValues(sectionValue, output.total);
    if (output.primaryTotal) {
      collectKnownCoverageValues(sectionValue, output.primaryTotal);
    }
    collectKnownCoverageValues(sectionValue, output.site);
    collectStringCounts(sectionValue, sectionCounts);
    output.bySection[section] = sectionCounts;
  }
}

function collectKnownCoverageValues(value: unknown, counts: CoverageValueCounts): void {
  if (typeof value === "string") {
    incrementKnownCoverageValue(value, counts);
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectKnownCoverageValues(entry, counts);
    }
    return;
  }
  for (const entry of Object.values(value)) {
    collectKnownCoverageValues(entry, counts);
  }
}

function incrementKnownCoverageValue(value: string, counts: CoverageValueCounts): void {
  switch (value) {
    case "observed":
      counts.observed += 1;
      break;
    case "testable":
      counts.testable += 1;
      break;
    case "not_observed":
      counts.notObserved += 1;
      break;
    case "not_testable":
      counts.notTestable += 1;
      break;
    case "needs_additional_probe":
      counts.needsAdditionalProbe += 1;
      break;
  }
}

function collectStringCounts(value: unknown, counts: Record<string, number>): void {
  if (typeof value === "string") {
    counts[value] = (counts[value] ?? 0) + 1;
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringCounts(entry, counts);
    }
    return;
  }
  for (const entry of Object.values(value)) {
    collectStringCounts(entry, counts);
  }
}

function siteCoversLane(site: ReplayEvidenceSiteReport, lane: LaneId): boolean {
  const coverage = site.coverageAssessment;
  switch (lane) {
    case "cmp_first_layer_accept_reject":
      return coverage.gdprEprivacy.acceptAction === "testable" &&
        coverage.gdprEprivacy.declineRejectAction === "testable";
    case "post_reject_tracking":
      return site.consentBehaviorOutcome.postRejectCookieBehavior === "established" ||
        coverage.gdprEprivacy.trackingAfterRefusal === "testable";
    case "post_accept_behavior":
      return coverage.gdprEprivacy.postAcceptBehavior === "testable";
    case "gpc_context":
      return coverage.corpusScenarios.gpcEnabled && coverage.ccpaCpra.gpcHandling === "testable";
    case "privacy_opt_out":
      return coverage.corpusScenarios.privacyOptOutFlow &&
        site.consentBehaviorOutcome.optOutAction === "observed_and_testable";
    case "form_collection_probe":
      return coverage.corpusScenarios.formCollectionProbe &&
        coverage.ccpaCpra.sensitiveFormsWithThirdPartyTracking === "testable";
    case "accessibility_probe":
      return coverage.corpusScenarios.accessibilityProbe &&
        (coverage.ccpaCpra.privacyControlAccessibility === "testable" ||
          coverage.gdprEprivacy.consentControlAccessibility === "testable");
    case "policy_surface_merge":
      return site.policyEvidenceOutcome.policyArtifactStatus === "present" &&
        site.policyEvidenceOutcome.privacyNoticeAvailability === "observed";
    case "no_go_or_non_representative":
      return site.failureReasons.includes("insufficient_artifacts") ||
        site.failureReasons.includes("frame_dom_unavailable") ||
        siteLooksNonRepresentative(site);
  }
}

function siteLooksNonRepresentative(site: ReplayEvidenceSiteReport): boolean {
  if (site.consentSurfaceType !== "not_observed" || site.policyEvidenceOutcome.policyArtifactStatus !== "missing") {
    return false;
  }
  const preConsent = site.networkVendorSummary.preConsent;
  if (preConsent.requestCount === 0) {
    return true;
  }
  if (preConsent.vendors.length > 0) {
    return false;
  }
  const endpoints = preConsent.endpoints.map((endpoint) => endpoint.toLowerCase());
  if (endpoints.length === 0) {
    return true;
  }
  return endpoints.every((endpoint) =>
    /captcha|challenge|turnstile|cdn-cgi|akamai|perimeterx|datadome|blocked|access|forbidden/.test(endpoint) ||
    endpoint.includes(hostnameFromUrl(site.sourceUrl ?? "")),
  );
}

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
  }
}

function laneReason(site: ReplayEvidenceSiteReport, lane: LaneId): string {
  switch (lane) {
    case "cmp_first_layer_accept_reject":
      return `${site.consentBehaviorOutcome.acceptAllAction}; reject=${site.coverageAssessment.gdprEprivacy.declineRejectAction}`;
    case "post_reject_tracking":
      return `postReject=${site.consentBehaviorOutcome.postRejectCookieBehavior}`;
    case "post_accept_behavior":
      return `postAccept=${site.coverageAssessment.gdprEprivacy.postAcceptBehavior}`;
    case "gpc_context":
      return `gpc=${site.coverageAssessment.ccpaCpra.gpcHandling}`;
    case "privacy_opt_out":
      return `optOut=${site.consentBehaviorOutcome.optOutAction}`;
    case "form_collection_probe":
      return "form collection probe captured";
    case "accessibility_probe":
      return "accessibility probe captured";
    case "policy_surface_merge":
      return `policy surfaces=${site.policyEvidenceOutcome.policySurfaceCount}`;
    case "no_go_or_non_representative":
      return site.failureReasons.join(", ") || "non-representative/no-evidence shape";
  }
}

function renderGoldCorpusCoverageMarkdown(report: GoldCorpusCoverageReport): string {
  const lines = [
    "# Replay Gold Corpus Coverage",
    "",
    `- Evaluated sites: ${report.summary.evaluatedSites}`,
    `- Lanes passing: ${report.summary.lanesPassing}`,
    `- Lanes with gaps: ${report.summary.lanesWithGaps}`,
    `- Quality status: ${report.summary.qualityStatus}`,
    `- Ready: ${report.summary.ready ? "yes" : "no"}`,
    `- Coverage counters: ${formatCoverageValueCounts(report.quality.coverageAssessmentCounts)}`,
    `- Primary coverage counters: ${formatCoverageValueCounts(report.quality.primaryCoverageAssessmentCounts)}`,
    `- Primary quality scope: ${report.quality.primaryScope.includedSites} included, ${report.quality.primaryScope.excludedNoGoSites} no-go/non-representative controls excluded`,
    "",
    "## Lane Coverage",
    "",
    "| Lane | Status | Covered / Required | Missing | Sites |",
    "| --- | --- | ---: | ---: | --- |",
  ];
  for (const lane of report.lanes) {
    lines.push([
      lane.label,
      lane.status,
      `${lane.coveredSites.length} / ${lane.minimumSites}`,
      String(lane.missingSites),
      lane.coveredSites.map((site) => site.sourceUrl ?? site.siteId).join(", ") || "none",
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push(
    "",
    "## Quality Counters",
    "",
    "| Scope | Observed | Testable | Not observed | Not testable | Needs additional probe |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    `| Coverage assessment | ${coverageCountsToMarkdownCells(report.quality.coverageAssessmentCounts)} |`,
    `| Primary coverage assessment | ${coverageCountsToMarkdownCells(report.quality.primaryCoverageAssessmentCounts)} |`,
  );
  for (const [section, counts] of Object.entries(report.quality.coverageAssessmentBySection).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${markdownCell(section)} | ${statusRecordToKnownCoverageCells(counts)} |`);
  }
  lines.push(
    "",
    "## Quality Opportunities",
    "",
    `- Candidate improvement: ${report.quality.opportunities.totals.candidate_improvement}`,
    `- Expected limitation: ${report.quality.opportunities.totals.expected_limitation}`,
    `- Regression risk: ${report.quality.opportunities.totals.regression_risk}`,
    "",
    "| Status | Candidate improvement | Expected limitation | Regression risk |",
    "| --- | ---: | ---: | ---: |",
  );
  for (const status of ["needs_additional_probe", "not_testable", "not_observed"] as const) {
    const counts = report.quality.opportunities.byStatus[status];
    lines.push([
      status,
      String(counts.candidate_improvement),
      String(counts.expected_limitation),
      String(counts.regression_risk),
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push(
    "",
    "### Top Opportunity Groups",
    "",
    "| Count | Bucket | Status | Field | Reason | Suggested action | Sites |",
    "| ---: | --- | --- | --- | --- | --- | --- |",
  );
  for (const group of report.quality.opportunities.topGroups.slice(0, 20)) {
    lines.push([
      String(group.count),
      group.bucket,
      group.status,
      group.path.replace(/^coverageAssessment\./, ""),
      group.reasonCode,
      group.suggestedAction,
      group.affectedSites.map((site) => site.sourceUrl ?? site.siteId).join(", "),
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push(
    "",
    "### Opportunity Sites",
    "",
    "| Site | Candidate improvement | Expected limitation | Regression risk |",
    "| --- | ---: | ---: | ---: |",
  );
  for (const site of report.quality.opportunities.siteTotals.slice(0, 20)) {
    lines.push([
      site.sourceUrl ?? site.siteId,
      String(site.candidateImprovement),
      String(site.expectedLimitation),
      String(site.regressionRisk),
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push(
    "",
    "## Action Proof Review",
    "",
    `- CMP regression-risk cells: ${report.quality.actionProofReview.cmpRegressionRiskCells}`,
    `- Privacy opt-out not-testable cells: ${report.quality.actionProofReview.privacyOptOutNotTestableCells}`,
    "",
    "### CMP Action-Proof Risks",
    "",
    "| Site | Fields | Notes |",
    "| --- | --- | --- |",
  );
  for (const site of report.quality.actionProofReview.cmpRegressionRiskSites) {
    lines.push([
      site.sourceUrl ?? site.siteId,
      site.fields.join(", "),
      site.notes.join("; ") || "none",
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (report.quality.actionProofReview.cmpRegressionRiskSites.length === 0) {
    lines.push("| none | none | none |");
  }
  lines.push(
    "",
    "### Privacy Opt-Out Action-Proof Limitations",
    "",
    "| Site | Opt-out action | Post-opt-out behavior | Notes |",
    "| --- | --- | --- | --- |",
  );
  for (const site of report.quality.actionProofReview.privacyOptOutNotTestableSites) {
    lines.push([
      site.sourceUrl ?? site.siteId,
      site.optOutAction,
      site.postOptOutPrivacyBehavior,
      site.notes.join("; ") || "none",
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (report.quality.actionProofReview.privacyOptOutNotTestableSites.length === 0) {
    lines.push("| none | none | none | none |");
  }
  if (report.quality.baselineComparison) {
    const comparison = report.quality.baselineComparison;
    lines.push(
      "",
      "## Baseline Comparison",
      "",
      `- Baseline: ${comparison.baselinePath}`,
      `- Mode: ${comparison.comparisonMode}`,
      `- Sites: ${comparison.currentSites} current / ${comparison.baselineSites} baseline`,
      `- Coverage deltas: ${formatCoverageDeltas(comparison.coverageAssessmentDeltas)}`,
      `- Regressions: ${comparison.regressions.length}`,
      `- Warnings: ${comparison.warnings.length}`,
      "",
      "| Lane | Baseline | Current | Delta | Status |",
      "| --- | ---: | ---: | ---: | --- |",
    );
    for (const lane of comparison.laneDeltas) {
      lines.push([
        lane.label,
        String(lane.baselineCovered),
        String(lane.currentCovered),
        formatDelta(lane.deltaCovered),
        `${lane.baselineStatus} -> ${lane.currentStatus}`,
      ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    if (comparison.regressions.length > 0) {
      lines.push("", "### Regressions", "", ...comparison.regressions.map((entry) => `- ${entry}`));
    }
    if (comparison.warnings.length > 0) {
      lines.push("", "### Warnings", "", ...comparison.warnings.map((entry) => `- ${entry}`));
    }
  }
  lines.push("", "## Site Matrix", "", "| Site | Lanes |", "| --- | --- |");
  for (const site of report.siteLaneMatrix) {
    lines.push(`| ${markdownCell(site.sourceUrl ?? site.siteId)} | ${markdownCell(site.lanes.join(", ") || "none")} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatCoverageValueCounts(counts: CoverageValueCounts): string {
  return [
    `observed=${counts.observed}`,
    `testable=${counts.testable}`,
    `not_observed=${counts.notObserved}`,
    `not_testable=${counts.notTestable}`,
    `needs_additional_probe=${counts.needsAdditionalProbe}`,
  ].join(", ");
}

function coverageCountsToMarkdownCells(counts: CoverageValueCounts): string {
  return [
    counts.observed,
    counts.testable,
    counts.notObserved,
    counts.notTestable,
    counts.needsAdditionalProbe,
  ].map(String).join(" | ");
}

function statusRecordToKnownCoverageCells(counts: Record<string, number>): string {
  return [
    counts.observed ?? 0,
    counts.testable ?? 0,
    counts.not_observed ?? 0,
    counts.not_testable ?? 0,
    counts.needs_additional_probe ?? 0,
  ].map(String).join(" | ");
}

function formatCoverageDeltas(deltas: CoverageBaselineComparison["coverageAssessmentDeltas"]): string {
  return [
    `observed=${formatDelta(deltas.observed)}`,
    `testable=${formatDelta(deltas.testable)}`,
    `not_observed=${formatDelta(deltas.notObserved)}`,
    `not_testable=${formatDelta(deltas.notTestable)}`,
    `needs_additional_probe=${formatDelta(deltas.needsAdditionalProbe)}`,
  ].join(", ");
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function parseArgs(argv: string[]): {
  baselinePath?: string;
  corpusDir?: string;
  evidenceReportPath?: string;
  failOnGap: boolean;
  failOnQualityRegression: boolean;
  format: "text" | "json";
  minimumSitesPerLane: number;
  outDir?: string;
} {
  const parsed = {
    failOnGap: false,
    failOnQualityRegression: false,
    format: "text" as const,
    minimumSitesPerLane: 3,
  } as {
    baselinePath?: string;
    corpusDir?: string;
    evidenceReportPath?: string;
    failOnGap: boolean;
    failOnQualityRegression: boolean;
    format: "text" | "json";
    minimumSitesPerLane: number;
    outDir?: string;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--corpus" && value) {
      parsed.corpusDir = value;
      index += 1;
    } else if (key === "--baseline" && value) {
      parsed.baselinePath = value;
      index += 1;
    } else if (key === "--evidence-report" && value) {
      parsed.evidenceReportPath = value;
      index += 1;
    } else if (key === "--out" && value) {
      parsed.outDir = value;
      index += 1;
    } else if (key === "--minimum-sites-per-lane" && value) {
      const minimum = Number(value);
      if (Number.isFinite(minimum) && minimum >= 0) {
        parsed.minimumSitesPerLane = minimum;
      }
      index += 1;
    } else if (key === "--format" && (value === "text" || value === "json")) {
      parsed.format = value;
      index += 1;
    } else if (key === "--fail-on-gap") {
      parsed.failOnGap = true;
    } else if (key === "--fail-on-quality-regression") {
      parsed.failOnQualityRegression = true;
    }
  }
  return parsed;
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function printUsage(): void {
  console.error([
    "Usage:",
    "  pnpm v2:replay-gold-coverage --evidence-report artifacts/.../ReplayEvidenceReport.json --out artifacts/...",
    "  pnpm v2:replay-gold-coverage --evidence-report artifacts/.../ReplayEvidenceReport.json --baseline artifacts/.../ReplayEvidenceReport.json --fail-on-gap --fail-on-quality-regression",
    "  pnpm v2:replay-gold-coverage --corpus artifacts/replay-corpus --out artifacts/...",
  ].join("\n"));
}
