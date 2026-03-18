import {
  SCAN_EVENT_TYPES,
  VALIDATION_COLLECT_JOB,
  VALIDATION_RANK_JOB,
  VALIDATION_VERDICT_JOB,
  deriveValidationFindingTaxonomy
} from "@website-signal-risk-scanner/shared";
import { buildFindingComparisonKey, runFullScanJob } from "@website-signal-risk-scanner/scan-core";
import {
  claimNextAutomaticTarget,
  createScanForValidationRun,
  createValidationRun,
  ensureValidationSettings,
  failValidationRun,
  finalizeValidationRun,
  getValidationPipelineState,
  getValidationRun,
  listRecentValidationRuns,
  loadCompletedScanArtifacts,
  loadValidationRunFindings,
  markValidationSchedule,
  replaceValidationRunFindings,
  syncTrancoTargets,
  updateValidationRun,
  upsertValidationVerdict
} from "./repository";
import { validateFindingWithLlm } from "./llm-client";
import { createValidationCollectQueue, createValidationRankQueue, createValidationVerdictQueue } from "../queue/queues";

function severityWeight(severity: string) {
  if (severity === "high") {
    return 300;
  }
  if (severity === "medium") {
    return 200;
  }
  if (severity === "low") {
    return 100;
  }
  return 0;
}

function humanizeReason(reason: string) {
  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function reviewIssueDefinition(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return {
        description: "The scan flagged a possible conflict between observed site behavior and policy language.",
        severity: "high" as const,
        title: "Possible policy-to-behavior conflict"
      };
    case "session_replay_without_disclosure_detected":
      return {
        description: "The scan flagged possible session replay behavior without clear matching policy disclosure.",
        severity: "high" as const,
        title: "Possible undisclosed session replay"
      };
    case "missing_dsar_high_exposure":
      return {
        description: "The scan flagged a likely missing or weak DSAR path despite higher regulatory exposure.",
        severity: "high" as const,
        title: "Possible missing DSAR path"
      };
    case "low_confidence_critical_fields":
      return {
        description: "The scan marked critical policy extraction fields as low confidence and in need of manual review.",
        severity: "medium" as const,
        title: "Low-confidence policy extraction"
      };
    default:
      return {
        description: `The scan report queued this item for review: ${humanizeReason(reason)}.`,
        severity: "medium" as const,
        title: humanizeReason(reason)
      };
  }
}

function getRecordBoolean(record: Record<string, unknown> | null, key: string) {
  return record?.[key] === true;
}

function getSnapshotNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Not observed";
  }

  return `${Math.round(value * 100)}%`;
}

function pageTypeLabel(pageType: string | null) {
  return (pageType ?? "policy")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildSectionIssueFinding(input: {
  description: string;
  evidence: Record<string, unknown>;
  pageType: string | null;
  pageUrl: string | null;
  ruleKey: string;
  severity: "high" | "medium" | "low";
  title: string;
}) {
  const taxonomy = deriveValidationFindingTaxonomy({
    category: "scan_report_review",
    ruleKey: input.ruleKey,
    subtype: "scan_report_section"
  });

  return {
    category: "scan_report_review" as const,
    description: input.description,
    evidence: input.evidence,
    findingFamily: taxonomy.familyId,
    findingScope: taxonomy.scope,
    findingSource: taxonomy.source,
    findingSubject: taxonomy.subject,
    pageUrl: input.pageUrl,
    rank: 0,
    ruleKey: input.ruleKey,
    severity: input.severity,
    subtype: "scan_report_section" as const,
    title: input.title
  };
}

function derivePolicySectionFindings(input: {
  policyEnrichments: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
}) {
  const findings: ReturnType<typeof buildSectionIssueFinding>[] = [];
  const reviewReasonsByEnrichmentId = new Map<string, Set<string>>();

  for (const row of input.policyReviewQueue) {
    const enrichmentId = String(row.policy_enrichment_id ?? "");
    const reason = String(row.reason ?? "");
    if (!enrichmentId || !reason) {
      continue;
    }

    const existing = reviewReasonsByEnrichmentId.get(enrichmentId) ?? new Set<string>();
    existing.add(reason);
    reviewReasonsByEnrichmentId.set(enrichmentId, existing);
  }

  const highExposure =
    getRecordBoolean(input.snapshot, "eu_exposure_likely") ||
    getRecordBoolean(input.snapshot, "california_exposure_likely");

  for (const enrichment of input.policyEnrichments) {
    const enrichmentId = String(enrichment.id ?? "");
    const pageType = typeof enrichment.page_type === "string" ? enrichment.page_type : null;
    const pageUrl = typeof enrichment.page_url === "string" ? enrichment.page_url : null;
    const reasons = reviewReasonsByEnrichmentId.get(enrichmentId) ?? new Set<string>();
    const flags = Array.isArray(enrichment.policy_actionable_flags)
      ? enrichment.policy_actionable_flags.filter((value): value is string => typeof value === "string")
      : [];
    const mentions = Array.isArray(enrichment.policy_mentions) ? enrichment.policy_mentions : [];
    const retentionPeriods = Array.isArray(enrichment.policy_retention_periods) ? enrichment.policy_retention_periods : [];
    const transferMechanisms = Array.isArray(enrichment.policy_transfer_mechanisms) ? enrichment.policy_transfer_mechanisms : [];
    const confidence =
      typeof enrichment.policy_semantic_confidence === "number" && Number.isFinite(enrichment.policy_semantic_confidence)
        ? enrichment.policy_semantic_confidence
        : null;
    const ambiguity =
      typeof enrichment.policy_ambiguity_score === "number" && Number.isFinite(enrichment.policy_ambiguity_score)
        ? enrichment.policy_ambiguity_score
        : null;
    const dsarMechanism = typeof enrichment.policy_dsar_mechanism === "string" ? enrichment.policy_dsar_mechanism : null;
    const typeLabel = pageTypeLabel(pageType);
    const baseEvidence = {
      page_type: pageType,
      policy_actionable_flags: flags,
      policy_ambiguity_score: ambiguity,
      policy_semantic_confidence: confidence,
      policy_summary_short: enrichment.policy_summary_short ?? null
    };

    if (pageType === "privacy_policy" && dsarMechanism === "absent") {
      findings.push(
        buildSectionIssueFinding({
          description: `${typeLabel} did not provide a clear DSAR or privacy-request path.`,
          evidence: {
            ...baseEvidence,
            policy_dsar_mechanism: dsarMechanism
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.no_dsar_mechanism",
          severity: "high",
          title: "No DSAR mechanism"
        })
      );
    }

    if (dsarMechanism === "absent" && highExposure) {
      findings.push(
        buildSectionIssueFinding({
          description: "The site appears exposed to GDPR or California privacy obligations, but the policy did not provide a clear access, deletion, or privacy-request path.",
          evidence: {
            ...baseEvidence,
            policy_dsar_mechanism: dsarMechanism,
            california_exposure_likely: getRecordBoolean(input.snapshot, "california_exposure_likely"),
            eu_exposure_likely: getRecordBoolean(input.snapshot, "eu_exposure_likely")
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.missing_dsar_high_exposure",
          severity: "high",
          title: "No DSAR mechanism on an EU/California-exposed site"
        })
      );
    }

    if (reasons.has("session_replay_without_disclosure_detected")) {
      findings.push(
        buildSectionIssueFinding({
          description: "Session replay technology was observed at runtime, but the policy did not clearly disclose session recording or replay behavior.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.session_replay_detected_without_disclosure",
          severity: "high",
          title: "Session replay detected without clear disclosure"
        })
      );
    }

    if (pageType === "terms_of_service" && flags.includes("session_replay_undisclosed")) {
      findings.push(
        buildSectionIssueFinding({
          description: "Session replay activity was detected, but the policy text did not clearly disclose it.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.session_replay_may_be_undisclosed",
          severity: "medium",
          title: "Session replay may be undisclosed"
        })
      );
    }

    if (reasons.has("low_confidence_critical_fields")) {
      findings.push(
        buildSectionIssueFinding({
          description: "Key policy fields could not be extracted with enough confidence, usually because the page content is sparse, ambiguous, or difficult to parse reliably.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.low_confidence_critical_fields",
          severity: "medium",
          title: "Low confidence on critical policy fields"
        })
      );
    }

    if (pageType === "terms_of_service" && mentions.length === 0) {
      findings.push(
        buildSectionIssueFinding({
          description: "This policy row was derived from rule-based extraction only and did not include richer semantic topic coverage.",
          evidence: {
            ...baseEvidence,
            policy_mentions: mentions
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.rule_only_row_present",
          severity: "medium",
          title: "Rule-only row present"
        })
      );
    }

    if (pageType === "terms_of_service" && flags.includes("llm_provider_error")) {
      findings.push(
        buildSectionIssueFinding({
          description: "The semantic extraction provider failed during policy analysis, so weaker fallback extraction was used.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.policy_extraction_provider_error",
          severity: "medium",
          title: "Policy extraction provider error"
        })
      );
    }

    if (pageType === "terms_of_service" && flags.includes("low_confidence")) {
      findings.push(
        buildSectionIssueFinding({
          description: "The extracted policy signals were too uncertain to treat as fully reliable without follow-up review.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.low_extraction_confidence",
          severity: "medium",
          title: "Low extraction confidence"
        })
      );
    }

    if (pageType === "privacy_policy" && retentionPeriods.length === 0) {
      findings.push(
        buildSectionIssueFinding({
          description: "The privacy policy did not disclose any concrete retention periods for collected data.",
          evidence: {
            ...baseEvidence,
            policy_retention_periods: retentionPeriods
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.no_retention_periods_noted",
          severity: "medium",
          title: "No retention periods noted"
        })
      );
    }

    if (pageType === "privacy_policy" && transferMechanisms.length === 0) {
      findings.push(
        buildSectionIssueFinding({
          description: "The privacy policy did not disclose any transfer mechanism for cross-border or third-country data transfers.",
          evidence: {
            ...baseEvidence,
            policy_transfer_mechanisms: transferMechanisms
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.no_transfer_mechanism_noted",
          severity: "medium",
          title: "No transfer mechanism noted"
        })
      );
    }

    if (ambiguity !== null && ambiguity > 0) {
      findings.push(
        buildSectionIssueFinding({
          description: `${typeLabel} was flagged as part of the section score review because of policy clarity risk ${ambiguity}.`,
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: `section_review.clarity_risk_${ambiguity}`,
          severity: ambiguity >= 60 ? "medium" : "low",
          title: `Clarity risk ${ambiguity}`
        })
      );
    }

    if (pageType !== null && confidence !== null) {
      findings.push(
        buildSectionIssueFinding({
          description: `${typeLabel} was flagged as part of the section score review because semantic extraction confidence was ${formatPercent(confidence)}.`,
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: `section_review.confidence_${Math.round(confidence * 100)}`,
          severity: confidence < 0.6 ? "medium" : "low",
          title: `Confidence ${formatPercent(confidence)}`
        })
      );
    }
  }

  return findings;
}

function deriveAccessibilitySectionFindings(input: { snapshot: Record<string, unknown> | null }) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [];
  }

  const rows = [
    {
      count: getSnapshotNumber(snapshot, "wcag_contrast_failures_count"),
      description: "Contrast failures can make text and controls hard to perceive for low-vision users.",
      ruleKey: "accessibility_review.contrast_failures",
      title: "Contrast failures"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_missing_alt_count"),
      description: "Missing alt text reduces screen-reader access to informative images.",
      ruleKey: "accessibility_review.missing_alt_text",
      title: "Missing alt text"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_keyboard_navigation_issue_count") + getSnapshotNumber(snapshot, "wcag_focus_indicator_issue_count"),
      description: "Keyboard and focus issues make navigation harder without a mouse.",
      ruleKey: "accessibility_review.navigation_issues",
      title: "Navigation issues"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_aria_error_count"),
      description: "ARIA issues can break semantics or assistive-technology interpretation.",
      ruleKey: "accessibility_review.aria_problems",
      title: "ARIA problems"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      description: "Form label issues make inputs less understandable and harder to complete.",
      ruleKey: "accessibility_review.form_label_issues",
      title: "Form label issues"
    }
  ].filter((row) => row.count > 0);

  return rows.map((row) =>
    buildSectionIssueFinding({
      description: row.description,
      evidence: {
        count: row.count
      },
      pageType: null,
      pageUrl: null,
      ruleKey: row.ruleKey,
      severity: row.count >= 20 ? "high" : row.count >= 5 ? "medium" : "low",
      title: row.title
    })
  );
}

export function deriveValidationFindings(input: Awaited<ReturnType<typeof loadCompletedScanArtifacts>>) {
  const policyEnrichmentsById = new Map(
    input.policyEnrichments.map((row) => [String(row.id ?? ""), row])
  );
  const findings: Array<{
    category: "scan_report_review";
    description: string;
    evidence: Record<string, unknown>;
    findingFamily: string;
    findingScope: string;
    findingSource: string;
    findingSubject: string;
    pageUrl: string | null;
    rank: number;
    ruleKey: string;
    severity: "high" | "medium" | "low";
    subtype: string | null;
    title: string;
  }> = [];

  for (const reviewItem of input.policyReviewQueue) {
    const reason = String(reviewItem.reason ?? "");
    if (!reason) {
      continue;
    }

    const enrichment = policyEnrichmentsById.get(String(reviewItem.policy_enrichment_id ?? "")) ?? null;
    const definition = reviewIssueDefinition(reason);
    const pageUrl = typeof enrichment?.page_url === "string" ? enrichment.page_url : null;
    const taxonomy = deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: `scan_report_review.${reason}`,
      subtype: "policy_review_queue"
    });

    findings.push({
      category: "scan_report_review",
      description: definition.description,
      evidence: {
        policy_actionable_flags: enrichment?.policy_actionable_flags ?? [],
        policy_ambiguity_score: enrichment?.policy_ambiguity_score ?? null,
        policy_page_type: enrichment?.page_type ?? null,
        policy_review_reason: reason,
        policy_semantic_confidence: enrichment?.policy_semantic_confidence ?? null,
        policy_summary_short: enrichment?.policy_summary_short ?? null,
        review_status: reviewItem.review_status ?? null,
        review_verdict: reviewItem.review_verdict ?? null,
        reviewed_at: reviewItem.reviewed_at ?? null,
        reviewer_notes: reviewItem.reviewer_notes ?? null
      },
      findingFamily: taxonomy.familyId,
      findingScope: taxonomy.scope,
      findingSource: taxonomy.source,
      findingSubject: taxonomy.subject,
      pageUrl,
      rank: 0,
      ruleKey: `scan_report_review.${reason}`,
      severity: definition.severity,
      subtype: "policy_review_queue",
      title: definition.title
    });
  }

  findings.push(
    ...derivePolicySectionFindings({
      policyEnrichments: input.policyEnrichments,
      policyReviewQueue: input.policyReviewQueue,
      snapshot: input.snapshot
    }),
    ...deriveAccessibilitySectionFindings({
      snapshot: input.snapshot
    })
  );

  const deduped = [...new Map(findings.map((finding) => [buildFindingComparisonKey({
    category: finding.category,
    page_url: finding.pageUrl,
    rule_key: finding.ruleKey
  }), finding])).values()];

  return deduped
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity) || left.ruleKey.localeCompare(right.ruleKey))
    .map((finding, index) => ({
      ...finding,
      rank: index + 1
    }));
}

export async function enqueueValidationCollect(runId: string) {
  await createValidationCollectQueue().add(
    VALIDATION_COLLECT_JOB,
    { validationRunId: runId },
    {
      attempts: 2,
      removeOnComplete: 50,
      removeOnFail: 50
    }
  );
}

async function enqueueValidationRank(runId: string) {
  await createValidationRankQueue().add(
    VALIDATION_RANK_JOB,
    { validationRunId: runId },
    {
      attempts: 2,
      removeOnComplete: 50,
      removeOnFail: 50
    }
  );
}

async function enqueueValidationVerdict(runId: string) {
  await createValidationVerdictQueue().add(
    VALIDATION_VERDICT_JOB,
    { validationRunId: runId },
    {
      attempts: 2,
      removeOnComplete: 50,
      removeOnFail: 50
    }
  );
}

export async function processValidationCollectJob(validationRunId: string) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  try {
    const scanId = await createScanForValidationRun(validationRunId);
    await runFullScanJob(scanId);

    const run = await getValidationRun(validationRunId);
    if (!run?.scan_id) {
      throw new Error("Validation run scan was not created.");
    }

    const artifacts = await loadCompletedScanArtifacts(run.scan_id);
    if (artifacts.scan?.status !== "completed") {
      throw new Error(String(artifacts.scan?.error_message ?? "Validation scan did not complete."));
    }

    await updateValidationRun(validationRunId, {
      status: "ranking"
    });
    await enqueueValidationRank(validationRunId);
  } catch (error) {
    await failValidationRun(validationRunId, error instanceof Error ? error.message : "Validation collect failed.");
    throw error;
  }
}

export async function processValidationRankJob(validationRunId: string) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  try {
    const run = await getValidationRun(validationRunId);
    if (!run?.scan_id) {
      throw new Error("Validation run is missing a scan.");
    }

    const artifacts = await loadCompletedScanArtifacts(run.scan_id);
    const findings = deriveValidationFindings(artifacts);
    await replaceValidationRunFindings(validationRunId, findings);

    if (findings.length === 0) {
      await finalizeValidationRun(validationRunId);
      return;
    }

    await updateValidationRun(validationRunId, {
      status: "validating"
    });
    await enqueueValidationVerdict(validationRunId);
  } catch (error) {
    await failValidationRun(validationRunId, error instanceof Error ? error.message : "Validation ranking failed.");
    throw error;
  }
}

export async function processValidationVerdictJob(validationRunId: string) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  try {
    const run = await getValidationRun(validationRunId);
    if (!run?.scan_id) {
      throw new Error("Validation run is missing a scan.");
    }

    const findings = await loadValidationRunFindings(validationRunId);
    const scanArtifacts = await loadCompletedScanArtifacts(run.scan_id);

    for (const finding of findings) {
      const verdict = await validateFindingWithLlm({
        domain: run.hostname,
        finding: {
          category: finding.category,
          description: finding.description,
          evidence: finding.evidence_json ?? {},
          pageUrl: finding.page_url ?? null,
          ruleKey: finding.rule_key,
          severity: finding.severity,
          title: finding.title
        },
        scanEvidence: {
          pages: scanArtifacts.pages,
          policyEnrichments: scanArtifacts.policyEnrichments,
          preconsentViolations: scanArtifacts.preconsentViolations,
          runtimeArtifacts: scanArtifacts.runtimeArtifacts,
          snapshot: scanArtifacts.snapshot,
          trackerVendors: scanArtifacts.trackerVendors
        }
      });

      await upsertValidationVerdict({
        agreementScore: verdict.agreementScore,
        confidence: verdict.confidence,
        evidence: verdict.evidence,
        model: verdict.model,
        promptVersion: verdict.promptVersion,
        rationale: verdict.rationale,
        validationRunFindingId: String(finding.id),
        verdict: verdict.verdict
      });
    }

    await finalizeValidationRun(validationRunId);
  } catch (error) {
    await failValidationRun(validationRunId, error instanceof Error ? error.message : "Validation verdicting failed.");
    throw error;
  }
}

export async function runValidationSchedulerTick(now = new Date()) {
  const { settings, state } = await getValidationPipelineState();
  if (state !== "running") {
    return {
      createdRunId: null,
      reason: state
    };
  }

  if (settings.run_mode !== "automatic") {
    return {
      createdRunId: null,
      reason: "manual_mode"
    };
  }

  const dueAt = settings.next_due_at ? new Date(settings.next_due_at) : null;
  if (dueAt && dueAt > now) {
    return {
      createdRunId: null,
      reason: "not_due"
    };
  }

  await syncTrancoTargets(false);
  const target = await claimNextAutomaticTarget(now);

  const nextDueAt = new Date(now.getTime() + settings.automatic_interval_minutes * 60_000);
  await markValidationSchedule({
    nextDueAt,
    now
  });

  if (!target) {
    return {
      createdRunId: null,
      reason: "no_eligible_target"
    };
  }

  const run = await createValidationRun({
    hostname: target.hostname,
    normalizedUrl: target.normalized_url,
    rankBand: target.rank_band,
    targetId: target.id,
    trancoRank: target.tranco_rank,
    triggerMode: "automatic"
  });

  await enqueueValidationCollect(run.id);
  return {
    createdRunId: run.id,
    reason: "scheduled"
  };
}
