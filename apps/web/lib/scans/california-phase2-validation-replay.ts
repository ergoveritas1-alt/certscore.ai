import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { deriveCaliforniaPrivacyCoveragePolicyOutcomes } from "./california-privacy-coverage-policy";
import {
  deriveCaliforniaPrivacyCoverageChecklist,
  type CaliforniaPrivacyCoverageChecklistItem
} from "./california-privacy-coverage-checklist";

export const CALIFORNIA_PHASE2_VALIDATION_DOMAINS = [
  "caltech.edu",
  "sony.com",
  "nbcnews.com",
  "kbdlab.io",
  "nvidia.com",
  "viking.com",
  "nike.com",
  "kalshi.com",
  "purdue.edu",
  "draftkings.com",
  "mit.edu",
  "grammarly.com",
  "fandango.com",
  "walmart.com",
  "uber.com",
  "amazon.com"
] as const;

export type CaliforniaPhase2ValidationArtifact = {
  domain?: string;
  runtimeArtifacts?: Record<string, unknown> | null;
  scanId?: string;
  snapshot?: Record<string, unknown> | null;
  validationVersion?: string;
};

export type CaliforniaPhase2RowAudit = {
  assessmentStatus: CaliforniaPrivacyCoverageChecklistItem["assessmentStatus"];
  evidenceFields: string[];
  evidenceFamily: CaliforniaPrivacyCoverageChecklistItem["criticalEvidence"]["evidenceFamily"];
  evidenceState: CaliforniaPrivacyCoverageChecklistItem["evidenceState"];
  missingOrIncompleteSourceSignals: CaliforniaPrivacyCoverageChecklistItem["criticalEvidence"]["missingOrIncompleteSourceSignals"];
  normalizedConcernKeys: string[];
  projectedFindingIds: string[];
  rowId: string;
  selfSufficient: boolean;
  selfSufficiencyReasons: string[];
  status: CaliforniaPrivacyCoverageChecklistItem["status"];
  statusBasis: string;
};

export type CaliforniaPhase2ReplayAudit = {
  domain: string;
  generatedAt: string;
  normalizedConcernKeys: string[];
  rowAudits: CaliforniaPhase2RowAudit[];
  scanId: string | null;
  unifiedFindingIds: string[];
  validationVersion: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRuntimeArtifacts(artifact: CaliforniaPhase2ValidationArtifact | Record<string, unknown>) {
  const runtimeArtifacts = isRecord(artifact.runtimeArtifacts) ? artifact.runtimeArtifacts : artifact;
  return runtimeArtifacts;
}

function getSnapshot(artifact: CaliforniaPhase2ValidationArtifact | Record<string, unknown>) {
  return isRecord(artifact.snapshot) ? artifact.snapshot : null;
}

function isCoverageLimited(artifact: CaliforniaPhase2ValidationArtifact | Record<string, unknown>) {
  const snapshot = getSnapshot(artifact);
  const coverageLevel = typeof snapshot?.coverageLevel === "string" ? snapshot.coverageLevel : null;
  return (
    snapshot?.blockedFlag === true ||
    coverageLevel === "limited_none" ||
    coverageLevel === "limited_partial" ||
    coverageLevel === "limited"
  );
}

function hasConcreteValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasConcreteValue);
  }
  if (isRecord(value)) {
    return Object.values(value).some(hasConcreteValue);
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

function getEvidenceFields(value: unknown, prefix = ""): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isRecord(nested)) {
      return getEvidenceFields(nested, nextKey);
    }
    return hasConcreteValue(nested) ? [nextKey] : [];
  });
}

function rowHasApplicabilityAndGapEvidence(item: CaliforniaPrivacyCoverageChecklistItem) {
  const retained = item.criticalEvidence.retainedEvidence;
  if (!isRecord(retained)) {
    return false;
  }

  const values = Object.entries(retained);
  const hasApplicability = values.some(([key, value]) =>
    /applicability|targeted|advertising|vendor|request|cookie|sensitive|gpc|policy|collection|context|field|source|url|notice/i.test(key) && hasConcreteValue(value)
  );
  const hasMissingOrFailedControl = values.some(([key, value]) =>
    /observed|found|reduction|honored|recognition|control|path|ui|cue/i.test(key) && value === false
  ) || values.some(([key, value]) =>
    /alignment|status|result/i.test(key) && typeof value === "string" && /gap|failed|missing|ignored|not_honored/i.test(value)
  ) || values.some(([key, value]) =>
    /unmatched|missing|persisted/i.test(key) && hasConcreteValue(value)
  );

  return hasApplicability && hasMissingOrFailedControl;
}

export function assessCaliforniaChecklistRowEvidence(item: CaliforniaPrivacyCoverageChecklistItem) {
  const retainedEvidence = item.criticalEvidence.retainedEvidence;
  const evidenceFields = getEvidenceFields(retainedEvidence);
  const normalizedConcernKeys = Array.isArray(retainedEvidence.normalizedConcernKeys)
    ? retainedEvidence.normalizedConcernKeys.filter((value): value is string => typeof value === "string")
    : [];
  const projectedFindingIds = item.criticalEvidence.projectedFindings.map((finding) => finding.id);
  const reasons: string[] = [];
  let selfSufficient = false;

  if (item.assessmentStatus === "checked" && item.evidenceState === "observed") {
    selfSufficient = hasConcreteValue(retainedEvidence) || projectedFindingIds.length > 0 || item.evidenceRefs.length > 0;
    if (!selfSufficient) {
      reasons.push("Checked observed rows need retained concrete URL/control/snippet/vendor/count evidence.");
    }
  } else if (item.assessmentStatus === "gap_observed") {
    selfSufficient = rowHasApplicabilityAndGapEvidence(item);
    if (!selfSufficient) {
      reasons.push("Potential gaps need both applicability evidence and retained missing/failed control evidence.");
    }
  } else if (item.assessmentStatus === "review_signal") {
    selfSufficient = hasConcreteValue(retainedEvidence) || projectedFindingIds.length > 0 || item.evidenceRefs.length > 0;
    if (!selfSufficient) {
      reasons.push("Review signals need concrete retained runtime, policy, interaction, accessibility, or alignment evidence.");
    }
  } else if (item.evidenceState === "not_testable") {
    selfSufficient = item.criticalEvidence.missingOrIncompleteSourceSignals.length > 0 || /not testable|unavailable|limited|incomplete/i.test(item.criticalEvidence.statusBasis);
    if (!selfSufficient) {
      reasons.push("Not-testable rows need a retained missing-source-signal reason.");
    }
  } else if (item.assessmentStatus === "checked" && item.evidenceState === "not_observed") {
    selfSufficient = hasConcreteValue(retainedEvidence) || /not observed|not surfaced|no .*signal|no .*context|no .*issue|no eligible/i.test(item.criticalEvidence.statusBasis);
    if (!selfSufficient) {
      reasons.push("Checked not-observed rows need evidence or a status basis explaining the negative observation.");
    }
  } else {
    selfSufficient = item.criticalEvidence.statusBasis.trim().length > 0;
    if (!selfSufficient) {
      reasons.push("Not-observed rows need a status basis explaining no projected signal was retained.");
    }
  }

  if (selfSufficient) {
    reasons.push("Retained JSON evidence is sufficient for this row posture.");
  }

  return {
    assessmentStatus: item.assessmentStatus,
    evidenceFields,
    evidenceFamily: item.criticalEvidence.evidenceFamily,
    evidenceState: item.evidenceState,
    missingOrIncompleteSourceSignals: item.criticalEvidence.missingOrIncompleteSourceSignals,
    normalizedConcernKeys,
    projectedFindingIds,
    rowId: item.id,
    selfSufficient,
    selfSufficiencyReasons: reasons,
    status: item.status,
    statusBasis: item.criticalEvidence.statusBasis
  } satisfies CaliforniaPhase2RowAudit;
}

export function replayCaliforniaPhase2Artifact(
  artifact: CaliforniaPhase2ValidationArtifact | Record<string, unknown>
): CaliforniaPhase2ReplayAudit {
  const runtimeArtifacts = getRuntimeArtifacts(artifact);
  const coverageLimited = isCoverageLimited(artifact);
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  const unifiedFindings = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const coverageOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited,
    normalizedConcerns,
    runtimeArtifacts,
    scanCompleted: true
  });
  const withholdForNonRepresentativeScan = unifiedFindings.some(
    (finding) => finding.unifiedFindingId === "scan_quality_visual_no_go"
  );
  const checklist = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited,
    coverageOutcomes,
    scanCompleted: true,
    unifiedFindings,
    withholdForNonRepresentativeScan
  });

  return {
    domain: typeof artifact.domain === "string" ? artifact.domain : "unknown",
    generatedAt: new Date().toISOString(),
    normalizedConcernKeys: normalizedConcerns.map((concern) => concern.canonicalConcernKey).sort(),
    rowAudits: checklist.map(assessCaliforniaChecklistRowEvidence),
    scanId: typeof artifact.scanId === "string" ? artifact.scanId : null,
    unifiedFindingIds: unifiedFindings.map((finding) => finding.unifiedFindingId).sort(),
    validationVersion: "wc01.california_phase2_replay.v1"
  };
}

export async function loadCaliforniaPhase2Artifacts(inputDir: string) {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".runtime-artifacts.json"))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();

  return Promise.all(
    files.map(async (filePath) => {
      const artifact = JSON.parse(await readFile(filePath, "utf8")) as CaliforniaPhase2ValidationArtifact;
      return { artifact, filePath };
    })
  );
}

export function renderCaliforniaPhase2ReplayMarkdown(audits: CaliforniaPhase2ReplayAudit[]) {
  const lines = ["# California Phase 2 Validation Replay", ""];
  for (const audit of audits) {
    lines.push(`## ${audit.domain}`, "");
    lines.push(`- Scan ID: ${audit.scanId ?? "n/a"}`);
    lines.push(`- Unified findings: ${audit.unifiedFindingIds.length ? audit.unifiedFindingIds.join(", ") : "none"}`);
    lines.push(`- Normalized concerns: ${audit.normalizedConcernKeys.length ? audit.normalizedConcernKeys.join(", ") : "none"}`);
    lines.push("");
    lines.push("| Row | Assessment | Evidence state | Status | Self-sufficient | Evidence fields |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of audit.rowAudits) {
      lines.push(`| ${row.rowId} | ${row.assessmentStatus} | ${row.evidenceState} | ${row.status} | ${row.selfSufficient ? "yes" : "no"} | ${row.evidenceFields.slice(0, 8).join(", ") || "none"} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function writeCaliforniaPhase2ReplayReports(input: {
  audits: CaliforniaPhase2ReplayAudit[];
  outDir: string;
}) {
  await mkdir(input.outDir, { recursive: true });
  const jsonPath = path.join(input.outDir, "wc01-california-phase2-replay.audit.json");
  const markdownPath = path.join(input.outDir, "wc01-california-phase2-replay.audit.md");
  await writeFile(jsonPath, `${JSON.stringify(input.audits, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderCaliforniaPhase2ReplayMarkdown(input.audits), "utf8");
  return { jsonPath, markdownPath };
}
