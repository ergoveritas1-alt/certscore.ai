import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assessPolicyDocumentSubstance,
  assessPolicyDocumentUsefulness,
  hasExplicitProviderPolicyLinkContext,
} from "@certscore/scan-core";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function domain(value: unknown): string {
  const input = text(value) ?? "unknown";
  try {
    return new URL(input.includes("://") ? input : `https://${input}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return input.replace(/^www\./i, "").toLowerCase();
  }
}

function retainedText(observation: JsonRecord): string {
  return [
    text(observation.title),
    text(observation.textExcerpt),
    ...array(observation.retainedPolicySections).map((value) => text(record(value).textExcerpt)),
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function hasSubstantiveEvidence(observation: JsonRecord): boolean {
  return Boolean(
    text(observation.textExcerpt) ||
    array(observation.observedTopics).length ||
    array(observation.article13DisclosureSignals).length ||
    array(observation.retainedPolicySections).length ||
    array(observation.retainedArticle13SectionEvidence).length
  );
}

function replayObservation(observation: JsonRecord) {
  const observationText = retainedText(observation);
  const substance = assessPolicyDocumentSubstance({
    surfaceType: "privacy_policy",
    title: text(observation.title),
    text: observationText,
  });
  const usefulness = assessPolicyDocumentUsefulness({
    surfaceType: "privacy_policy",
    title: text(observation.title),
    text: observationText,
    targetRelationship: text(observation.targetRelationship) as
      | "target_controller"
      | "first_party_brand"
      | "service_provider"
      | "unrelated"
      | "unknown"
      | undefined,
    ownershipConfidence: number(observation.ownershipConfidence),
    observedTopicCount: array(observation.observedTopics).length,
    gdprTransparencyTopicCandidateCount: array(observation.gdprTransparencyTopicCandidates).length,
    documentSubstanceMatchesExpectedSurface: substance.matchesExpectedSurface,
    providerLinkContextObserved: hasExplicitProviderPolicyLinkContext({
      documentUrl: text(observation.normalizedUrl) ?? text(observation.url),
      linkText: text(observation.linkText),
      surroundingText: text(observation.surroundingTextExcerpt),
    }),
  });
  return {
    useful: observation.status === "fetched" &&
      hasSubstantiveEvidence(observation) &&
      substance.matchesExpectedSurface &&
      usefulness.documentEvaluationState === "usable",
    reasonCodes: [substance.reasonCode, ...usefulness.documentEvaluationReasonCodes],
  };
}

async function main() {
  const root = process.argv[2];
  const outputPath = process.argv[3];
  if (!root || !outputPath) {
    throw new Error("Usage: replay-policy-useful-capture-baseline <baseline-directory> <output.json>");
  }
  const diagnosis = JSON.parse(await readFile(path.join(root, "scaled-diagnosis-progress.json"), "utf8"));
  const ownershipAudit = JSON.parse(await readFile(path.join(root, "positive-ownership-audit-00.json"), "utf8"));
  const baseline = JSON.parse(await readFile(path.join(root, "baseline.json"), "utf8"));
  const baselineByScanId = new Map(
    array(record(baseline).rows).map(record).flatMap((row) => {
      const scanId = text(row.scan_id);
      return scanId ? [[scanId, row] as const] : [];
    }),
  );
  const bundleDirectory = path.join(root, "representative-bundles");
  const bundleNames = (await readdir(bundleDirectory)).filter((name) => name.endsWith(".json"));
  const bundles = await Promise.all(bundleNames.map(async (name) =>
    JSON.parse(await readFile(path.join(bundleDirectory, name), "utf8")) as JsonRecord
  ));
  const latestByDomainId = new Map<string, { baselineRow: JsonRecord; bundle: JsonRecord }>();
  for (const bundle of bundles) {
    const baselineRow = baselineByScanId.get(text(bundle.scanId) ?? "");
    const domainId = text(baselineRow?.domain_id);
    if (!baselineRow || !domainId) continue;
    const current = latestByDomainId.get(domainId);
    if (!current || String(bundle.completedAt ?? "") > String(current.bundle.completedAt ?? "")) {
      latestByDomainId.set(domainId, { baselineRow, bundle });
    }
  }

  const confirmedCases = array(record(diagnosis).confirmedCases).map(record);
  const expectedPolicyDomains = new Set(confirmedCases
    .filter((row) => text(row.label)?.startsWith("false_negative_"))
    .map((row) => domain(row.hostname)));
  const falsePositiveDomains = new Set([
    ...array(record(ownershipAudit).providerOnlyDomains).map((row) => domain(record(row).hostname)),
    ...confirmedCases
      .filter((row) => row.label === "false_positive_non_policy_document")
      .map((row) => domain(row.hostname)),
  ]);

  const rows = [...latestByDomainId].map(([domainId, { baselineRow, bundle }]) => {
    const hostname = domain(baselineRow.hostname ?? bundle.normalizedUrl ?? bundle.url);
    const observations = array(bundle.policySurfaceObservations).map(record)
      .filter((observation) => observation.surfaceType === "privacy_policy");
    const fetched = observations.filter((observation) => observation.status === "fetched");
    const scannerDeclaredUsable = fetched.some((observation) =>
      observation.documentEvaluationState === "usable" && hasSubstantiveEvidence(observation)
    );
    const replayed = fetched.map(replayObservation);
    const replayUseful = replayed.some((row) => row.useful);
    return {
      domain: hostname,
      domainId,
      scanId: text(bundle.scanId),
      locale: observations.map((row) => text(row.matchedLocale)).find(Boolean),
      scannerDeclaredUsable,
      replayUseful,
      transition: scannerDeclaredUsable === replayUseful
        ? "unchanged"
        : scannerDeclaredUsable ? "usable_to_insufficient" : "insufficient_to_usable",
      expectedPolicyAdjudicated: expectedPolicyDomains.has(hostname),
      falsePositiveAdjudicated: falsePositiveDomains.has(hostname),
      reasonCodes: [...new Set(replayed.flatMap((row) => row.reasonCodes))].sort(),
    };
  }).sort((left, right) => left.domain.localeCompare(right.domain));

  const suppressed = rows.filter((row) => row.transition === "usable_to_insufficient");
  const gained = rows.filter((row) => row.transition === "insufficient_to_usable");
  const adjudicatedFalsePositiveRows = rows.filter((row) => row.falsePositiveAdjudicated);
  const adjudicatedExpectedRows = rows.filter((row) => row.expectedPolicyAdjudicated);
  const adjudicatedFalsePositiveDomainsSuppressed = [...falsePositiveDomains].filter((hostname) =>
    !adjudicatedFalsePositiveRows.some((row) => row.domain === hostname && row.replayUseful)
  );
  const adjudicatedExpectedDomainsWithUsefulEvidence = [...expectedPolicyDomains].filter((hostname) =>
    adjudicatedExpectedRows.some((row) => row.domain === hostname && row.replayUseful)
  );
  const report = {
    schemaVersion: "policy_useful_capture_retained_replay.v1",
    generatedAt: new Date().toISOString(),
    source: {
      baselineDirectory: root,
      inputBundleFiles: bundles.length,
      baselineMatchedBundleFiles: bundles.filter((bundle) => baselineByScanId.has(text(bundle.scanId) ?? "")).length,
      uniqueProductionDomainIds: rows.length,
      publicSitesContacted: 0,
      productionMutations: 0,
    },
    metrics: {
      scannerDeclaredUsablePrivacyPolicies: rows.filter((row) => row.scannerDeclaredUsable).length,
      replayUsefulPrivacyPolicies: rows.filter((row) => row.replayUseful).length,
      usableToInsufficient: suppressed.length,
      insufficientToUsable: gained.length,
      adjudicatedFalsePositiveDomains: falsePositiveDomains.size,
      adjudicatedFalsePositiveDomainsSuppressed: adjudicatedFalsePositiveDomainsSuppressed.length,
      adjudicatedExpectedPolicyDomains: expectedPolicyDomains.size,
      adjudicatedExpectedDomainsWithUsefulRetainedEvidence: adjudicatedExpectedDomainsWithUsefulEvidence.length,
    },
    interpretation: [
      "This is a retained-evidence replay of document usefulness and ownership, not a browser discovery rerun.",
      "Suppression results are measurable from retained documents; a useful retained row in a false-negative domain is not discovery recovery. Missed-link and missed-retrieval recovery require owned canaries or a cooldown-approved live sample.",
      "No model output, customer-facing finding, score, or production record was created or changed.",
    ],
    transitions: {
      usableToInsufficient: suppressed.map((row) => row.domain),
      insufficientToUsable: gained.map((row) => row.domain),
      adjudicatedFalsePositivesNotSuppressed: adjudicatedFalsePositiveRows
        .filter((row) => row.replayUseful)
        .map((row) => row.domain),
      adjudicatedExpectedPoliciesStillMissed: adjudicatedExpectedRows
        .filter((row) => !row.replayUseful)
        .map((row) => row.domain),
    },
    rows,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
