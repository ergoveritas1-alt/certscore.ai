import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import {
  applyGoverningPolicySelection,
  buildGdprTransparencyTopicCoverageDiagnostics,
  extractPolicySections,
  gdprTransparencyTopicCandidatesFromRetainedPolicySections,
  retainedArticle13SectionEvidenceFromSections,
} from "../packages/certscore-scan-core/src/scanners/policy-surface-scanner.js";

type PolicySurface = CanonicalEvidenceBundle["policySurfaceObservations"][number];

function normalizedPolicyTextPath(surface: PolicySurface) {
  return surface.artifactRefs.find((artifact) =>
    artifact.artifactId.startsWith("policy_surface_text_") ||
    /normalized text/i.test(artifact.label ?? "")
  )?.path;
}

function isTargetRelevantPolicy(surface: PolicySurface) {
  return surface.surfaceType === "privacy_policy" &&
    surface.status === "fetched" &&
    (surface.targetRelationship === "target_controller" ||
      surface.targetRelationship === "first_party_brand");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

async function replaySurface(surface: PolicySurface) {
  const textPath = normalizedPolicyTextPath(surface);
  if (!textPath) {
    return null;
  }
  const visibleText = await readFile(textPath, "utf8");
  const sourceUrl = surface.normalizedUrl ?? surface.url;
  const startedAt = performance.now();
  const sections = extractPolicySections({ html: "", sourceUrl, visibleText });
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections);
  const typedEvidence = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  const contentCoverage = surface.contentCoverage ?? {
    status: "partial" as const,
    sourceTextChars: visibleText.length,
    extractedSectionCount: sections.length,
    retainedSectionCount: sections.length,
    retainedTableRowCount: sections.filter((section) =>
      /\btable\b|(?:name|provider|purpose|duration)\s*\|/i.test(section.heading)
    ).length,
    limitationKeys: ["legacy_retained_surface_content_coverage_missing"],
  };
  const diagnostics = buildGdprTransparencyTopicCoverageDiagnostics({
    contentCoverage,
    documentRole: surface.documentRole ?? "unknown",
    documentTextCoverage: surface.documentTextCoverage,
    ownership: surface,
    sectionEvidence: typedEvidence,
  });
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  return {
    observation: {
      ...surface,
      contentCoverage,
      gdprTransparencyTopicCoverageDiagnostics: diagnostics,
      retainedArticle13SectionEvidence: typedEvidence,
    },
    sourceUrl,
    documentRole: surface.documentRole ?? "unknown",
    governingDocumentEligible: surface.documentRole !== "policy_index",
    durationMs,
    retainedTextChars: visibleText.length,
    sectionCount: sections.length,
    sectionMethodCounts: Object.fromEntries(
      unique(sections.map((section) => section.extractionMethod ?? "unknown"))
        .map((method) => [method, sections.filter((section) =>
          (section.extractionMethod ?? "unknown") === method
        ).length]),
    ),
    candidateTopics: unique(candidates.map((candidate) => candidate.topic)).sort(),
    observedTopics: unique(typedEvidence
      .filter((evidence) => evidence.signalObserved === "observed")
      .map((evidence) => evidence.coverageArea)).sort(),
    limitedTopics: unique(typedEvidence
      .filter((evidence) => evidence.signalObserved !== "observed")
      .map((evidence) => evidence.coverageArea)).sort(),
    topicCoverage: {
      complete: diagnostics?.filter((diagnostic) => diagnostic.coverageState === "complete").length ?? 0,
      limited: diagnostics?.filter((diagnostic) => diagnostic.coverageState === "limited").length ?? 0,
      observed: diagnostics?.filter((diagnostic) => diagnostic.evaluationState === "observed").length ?? 0,
      unknown: diagnostics?.filter((diagnostic) => diagnostic.evaluationState === "unknown").length ?? 0,
    },
    sourceHashesRetained: sections.length > 0 && sections.every((section) =>
      /^[a-f0-9]{64}$/.test(section.documentTextSha256 ?? "") &&
      /^[a-f0-9]{64}$/.test(section.evidenceTextSha256 ?? "")
    ),
  };
}

async function replayBundle(bundlePath: string) {
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as CanonicalEvidenceBundle;
  const surfaces = (bundle.policySurfaceObservations ?? []).filter(isTargetRelevantPolicy);
  const replayedWithObservations = (await Promise.all(surfaces.map(replaySurface))).filter(
    (row): row is NonNullable<typeof row> => row !== null,
  );
  const selected = applyGoverningPolicySelection(
    replayedWithObservations.map((row) => row.observation),
  );
  const selectionByObservationId = new Map(selected.map((observation) => [
    observation.observationId,
    observation.governingPolicySelection,
  ]));
  const replayed = replayedWithObservations.map(({ observation, ...row }) => ({
    ...row,
    governingPolicySelection: selectionByObservationId.get(observation.observationId),
  }));
  return {
    bundlePath,
    hostname: new URL(bundle.normalizedUrl ?? bundle.url).hostname,
    surfaceCount: replayed.length,
    candidateTopics: unique(replayed.flatMap((surface) => surface?.candidateTopics ?? [])).sort(),
    observedTopics: unique(replayed.flatMap((surface) => surface?.observedTopics ?? [])).sort(),
    productionEligibleCandidateTopics: unique(replayed
      .filter((surface) => surface?.governingDocumentEligible)
      .flatMap((surface) => surface?.candidateTopics ?? [])).sort(),
    productionEligibleObservedTopics: unique(replayed
      .filter((surface) => surface?.governingDocumentEligible)
      .flatMap((surface) => surface?.observedTopics ?? [])).sort(),
    maxSurfaceDurationMs: Math.max(0, ...replayed.map((surface) => surface?.durationMs ?? 0)),
    surfaces: replayed,
  };
}

async function main() {
  const bundlePaths = process.argv.slice(2).map((value) => path.resolve(value));
  if (bundlePaths.length === 0) {
    throw new Error("Pass one or more CanonicalEvidenceBundle.json paths.");
  }
  const rows = await Promise.all(bundlePaths.map(replayBundle));
  const report = {
    reportVersion: "certscore.retained_policy_section_graph_replay.1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    guardrails: [
      "Replays retained policy text only; it performs no network or browser work.",
      "Candidate and typed-observation counts are diagnostic and do not create findings or projections.",
      "Target ownership and governing-policy gates are preserved from the retained observation.",
    ],
    totals: {
      bundles: rows.length,
      candidateTopics: rows.reduce((sum, row) => sum + row.candidateTopics.length, 0),
      observedTopics: rows.reduce((sum, row) => sum + row.observedTopics.length, 0),
      productionEligibleCandidateTopics: rows.reduce(
        (sum, row) => sum + row.productionEligibleCandidateTopics.length,
        0,
      ),
      productionEligibleObservedTopics: rows.reduce(
        (sum, row) => sum + row.productionEligibleObservedTopics.length,
        0,
      ),
      maximumReplayDurationMs: Math.max(0, ...rows.map((row) => row.maxSurfaceDurationMs)),
    },
    rows,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
