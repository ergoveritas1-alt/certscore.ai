import { buildFindingComparisonKey, runFullScanJob } from "@website-signal-risk-scanner/scan-core";
import { createValidationRankQueue } from "../queue/queues";
import { VALIDATION_RANK_JOB, SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  createValidationScan,
  ensureAnonymousValidationDomain,
  getValidationPipelineState,
  getValidationRunById,
  insertValidationScanEvent,
  loadRankableFindings,
  replaceValidationRunFindings,
  updateValidationRun,
  updateValidationTargetAfterRun,
  type ValidationRunFindingInsert
} from "./repository";

type RankableValidationFinding = Omit<ValidationRunFindingInsert, "rank">;

async function failValidationRun(
  input: {
    validationRunId: string;
    message: string;
    scanId?: string | null;
    domainId?: string | null;
    hostname: string;
    trancoRank: number | null;
    updateTarget: boolean;
    eventType?: string;
    eventMessage?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await updateValidationRun(input.validationRunId, {
    completed_at: new Date().toISOString(),
    error_message: input.message,
    status: "failed"
  });

  if (input.updateTarget) {
    await updateValidationTargetAfterRun({
      errorMessage: input.message,
      hostname: input.hostname,
      lastStatus: "failed",
      trancoRank: input.trancoRank
    });
  }

  if (input.scanId || input.domainId) {
    await insertValidationScanEvent({
      domainId: input.domainId,
      eventType: input.eventType ?? SCAN_EVENT_TYPES.validationRunFailed,
      message: input.eventMessage ?? "Validation run failed.",
      metadata: {
        ...input.metadata,
        error: input.message,
        validationRunId: input.validationRunId
      },
      scanId: input.scanId
    });
  }
}

function getSeverityWeight(severity: string) {
  if (severity === "high") {
    return 40;
  }

  if (severity === "medium") {
    return 25;
  }

  if (severity === "low") {
    return 10;
  }

  return 0;
}

function buildEvidenceWeight(evidence: Record<string, unknown>) {
  return Math.min(Object.keys(evidence ?? {}).length * 3, 18);
}

function rankFindings(findings: RankableValidationFinding[]) {
  const deduped = new Map<string, RankableValidationFinding>();

  for (const finding of findings) {
    const key = buildFindingComparisonKey({
      category: finding.category,
      page_url: finding.page_url,
      rule_key: finding.rule_key
    });

    const candidateScore = getSeverityWeight(finding.severity) + buildEvidenceWeight(finding.evidence_json);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, finding);
      continue;
    }

    const existingScore = getSeverityWeight(existing.severity) + buildEvidenceWeight(existing.evidence_json);
    if (candidateScore > existingScore) {
      deduped.set(key, finding);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => {
      const scoreDiff =
        getSeverityWeight(right.severity) +
        buildEvidenceWeight(right.evidence_json) -
        (getSeverityWeight(left.severity) + buildEvidenceWeight(left.evidence_json));
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.rule_key.localeCompare(right.rule_key) || left.title.localeCompare(right.title);
    })
    .map((finding, index) => ({
      ...finding,
      rank: index + 1
    }))
    .slice(0, 25);
}

export async function runValidationCollectJob(validationRunId: string) {
  const validationRun = await getValidationRunById(validationRunId);
  if (!validationRun) {
    throw new Error(`Validation run ${validationRunId} was not found.`);
  }

  const pipelineState = await getValidationPipelineState();
  if (pipelineState !== "running") {
    throw new Error(`Validation pipeline is ${pipelineState}.`);
  }

  await updateValidationRun(validationRunId, {
    started_at: new Date().toISOString(),
    status: "collecting"
  });

  try {
    const domain =
      validationRun.domainId && validationRun.scanId
        ? { id: validationRun.domainId }
        : await ensureAnonymousValidationDomain(validationRun.hostname, validationRun.normalizedUrl);
    const scanId =
      validationRun.scanId ??
      (await createValidationScan({
        domainId: domain.id,
        hostname: validationRun.hostname,
        normalizedUrl: validationRun.normalizedUrl
      }));

    if (!validationRun.domainId || !validationRun.scanId) {
      await updateValidationRun(validationRunId, {
        domain_id: domain.id,
        scan_id: scanId
      });
    }

    await insertValidationScanEvent({
      domainId: domain.id,
      eventType: SCAN_EVENT_TYPES.validationRunStarted,
      message: "Validation collection started.",
      metadata: {
        validationRunId
      },
      scanId
    });

    await runFullScanJob(scanId);

    const findings = await loadRankableFindings(scanId);
    await updateValidationRun(validationRunId, {
      finding_count: findings.length,
      status: "ranking"
    });

    if ((await getValidationPipelineState()) === "running") {
      await createValidationRankQueue().add(
        VALIDATION_RANK_JOB,
        { validationRunId },
        {
          attempts: 2,
          jobId: `${validationRunId}--rank`
        }
      );
    } else {
      await failValidationRun({
        domainId: domain.id,
        eventMessage: "Validation pipeline paused before ranking could start.",
        eventType: SCAN_EVENT_TYPES.validationPipelinePaused,
        hostname: validationRun.hostname,
        message: "Validation pipeline paused before ranking could start.",
        scanId,
        trancoRank: validationRun.trancoRank,
        updateTarget: false,
        validationRunId
      });
      return;
    }

    await insertValidationScanEvent({
      domainId: domain.id,
      eventType: SCAN_EVENT_TYPES.validationCollectCompleted,
      message: "Validation collection completed.",
      metadata: {
        validationRunId,
        findingCount: findings.length
      },
      scanId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation collect error";
    await failValidationRun({
      hostname: validationRun.hostname,
      message,
      trancoRank: validationRun.trancoRank,
      updateTarget: true,
      validationRunId
    });
    throw error;
  }
}

export async function runValidationRankJob(validationRunId: string) {
  const validationRun = await getValidationRunById(validationRunId);
  if (!validationRun || !validationRun.scanId) {
    throw new Error(`Validation run ${validationRunId} is missing a scan.`);
  }

  try {
    const findings = await loadRankableFindings(validationRun.scanId);
    const ranked = rankFindings(findings);
    await replaceValidationRunFindings(validationRunId, ranked);
    await updateValidationRun(validationRunId, {
      finding_count: ranked.length,
      status: "validating"
    });

    await insertValidationScanEvent({
      domainId: validationRun.domainId,
      eventType: SCAN_EVENT_TYPES.validationRankCompleted,
      message: "Validation ranking completed.",
      metadata: {
        rankedFindingCount: ranked.length,
        validationRunId
      },
      scanId: validationRun.scanId
    });

    if ((await getValidationPipelineState()) !== "running") {
      await failValidationRun({
        domainId: validationRun.domainId,
        eventMessage: "Validation pipeline paused before completion.",
        eventType: SCAN_EVENT_TYPES.validationPipelinePaused,
        hostname: validationRun.hostname,
        message: "Validation pipeline paused before completion.",
        scanId: validationRun.scanId,
        trancoRank: validationRun.trancoRank,
        updateTarget: false,
        validationRunId
      });
      return;
    }

    await updateValidationRun(validationRunId, {
      average_agreement_score: null,
      completed_at: new Date().toISOString(),
      reviewed_finding_count: 0,
      status: "completed"
    });
    await updateValidationTargetAfterRun({
      hostname: validationRun.hostname,
      lastStatus: "completed",
      trancoRank: validationRun.trancoRank
    });
    await insertValidationScanEvent({
      domainId: validationRun.domainId,
      eventType: SCAN_EVENT_TYPES.validationRunCompleted,
      message: "Validation findings finalized.",
      metadata: {
        findingCount: ranked.length,
        validationRunId
      },
      scanId: validationRun.scanId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation ranking error";
    await failValidationRun({
      domainId: validationRun.domainId,
      eventMessage: "Validation ranking failed.",
      hostname: validationRun.hostname,
      message,
      metadata: {
        stage: "ranking"
      },
      scanId: validationRun.scanId,
      trancoRank: validationRun.trancoRank,
      updateTarget: true,
      validationRunId
    });
    throw error;
  }
}
