import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  consentControlAssessmentSchema,
  deriveConsentControlAssessment,
  type ConsentControlAssessment,
  type ConsentControlAssessmentInput,
} from "../packages/certscore-contracts/src/consent-control-assessment";
import {
  canonicalEvidenceBundleSchema,
  type CanonicalEvidenceBundle,
} from "../packages/certscore-contracts/src/index";
import { deriveMaterializedConsentControlAssessment as deriveRetainedMaterializedAssessment } from "../apps/web/server/scans/consent-control-assessment-projector";

export const ARO_CAPTURE_REPLAY_VERSION = "aro-capture-replay.v1" as const;
const CONTROL_FIELDS = ["accept", "reject", "options"] as const;
type ControlField = (typeof CONTROL_FIELDS)[number];

export type AroReplayCase = {
  scanId: string;
  domain: string;
  sourceWindow: "oldest" | "previous" | "latest" | "fixture";
  attribution: "model_assisted";
  storedAssessment: Pick<ConsentControlAssessment, "artifactVersion" | "assessmentStatus" | "controls">;
  assessmentInput?: ConsentControlAssessmentInput;
  retainedInput?: {
    bundle: CanonicalEvidenceBundle;
    consentControlGeometryEvidence: Record<string, unknown> | null;
    finalUrl: string | null;
    noGo: boolean;
    noGoReasonCodes?: string[];
    requestedUrl?: string | null;
  };
};

export type AroReplayCorpus = {
  corpusVersion: typeof ARO_CAPTURE_REPLAY_VERSION;
  attribution: "model_assisted";
  excludedDomains: string[];
  sourceCohortRecords: number;
  cases: AroReplayCase[];
};

export type AroReplayChange = {
  scanId: string;
  domain: string;
  sourceWindow?: AroReplayCase["sourceWindow"];
  field: ControlField;
  stored: string;
  replayed: string;
  classification?: "expected_safety_change" | "expected_positive_retention" | "review_required";
  retainedTypedEvidence?: boolean;
  storedReasonCodes?: string[];
  replayReasonCodes?: string[];
  rationale?: string;
  evidenceRisk?: string;
};

export type AroReplayCaseResult = {
  scanId: string;
  domain: string;
  sourceWindow: AroReplayCase["sourceWindow"];
  stored: Record<ControlField, string>;
  replayed: Record<ControlField, string>;
  replayReasonCodes: Record<ControlField, string[]>;
  assessmentStatus: string;
};

export type AroReplayReport = {
  reportVersion: typeof ARO_CAPTURE_REPLAY_VERSION;
  attribution: "model_assisted";
  excludedDomains: string[];
  inputCases: number;
  replayedCases: number;
  schemaFailures: Array<{ scanId: string; message: string }>;
  compatibilityFailures: Array<{ scanId: string; message: string }>;
  assessmentStatusChanges: Array<{ scanId: string; domain: string; sourceWindow: AroReplayCase["sourceWindow"]; stored: string; replayed: string; classification: "expected_safety_change" | "review_required" }>;
  changedConclusions: AroReplayChange[];
  caseResults: AroReplayCaseResult[];
  reviewQueue: Array<{ scanId: string; domain: string; sourceWindow: AroReplayCase["sourceWindow"]; field: ControlField; reason: string; evidenceRisk: string }>;
  comparisonMode: "retrospective_canonical_recomputation";
  unchangedCases: number;
  distributions?: {
    stored: Record<ControlField, Record<string, number>>;
    replayed: Record<ControlField, Record<string, number>>;
    changedByField: Record<ControlField, number>;
    assessmentStatuses: Record<string, number>;
  };
  timingsMs?: { count: number; total: number; mean: number; p50: number; p95: number; max: number };
  cohort?: {
    sourceRoot: string;
    windows: string[];
    sourceRecords: number;
    excludedErgoveritas: number;
    missingBundles: number;
    invalidBundles: number;
    invalidAssessments: number;
  };
};

function isErgoveritas(domain: string): boolean {
  return domain.toLowerCase() === "ergoveritas.com" || domain.toLowerCase().endsWith(".ergoveritas.com");
}

/**
 * Pure canonical replay boundary. Root may replace the implementation behind
 * this interface with the retained-lane materializer while preserving callers.
 */
export function deriveMaterializedConsentControlAssessment(input: ConsentControlAssessmentInput): ConsentControlAssessment {
  return deriveConsentControlAssessment(input);
}

type ReplayMaterializedInput = ConsentControlAssessmentInput | NonNullable<AroReplayCase["retainedInput"]>;

function deriveReplayAssessment(input: ReplayMaterializedInput): ConsentControlAssessment {
  if ("bundle" in input) {
    return deriveRetainedMaterializedAssessment(input as Parameters<typeof deriveRetainedMaterializedAssessment>[0]);
  }
  return deriveMaterializedConsentControlAssessment(input);
}

function controlReasonCodes(assessment: Pick<ConsentControlAssessment, "controls">, field: ControlField) {
  const reasons = assessment.controls[field].reasonCodes;
  return (Array.isArray(reasons) ? reasons : []).filter((value) => /^[a-z0-9_:-]+$/i.test(value)).slice(0, 16);
}

function blankDistribution(): Record<ControlField, Record<string, number>> {
  return { accept: {}, reject: {}, options: {} };
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index] ?? 0;
}

function typedEvidenceForField(item: AroReplayCase, field: ControlField) {
  const bundle = item.retainedInput?.bundle;
  if (!bundle) return false;
  const matches = (actionType: unknown) =>
    field === "accept" ? actionType === "accept_all" :
      field === "reject" ? actionType === "reject_all" :
        actionType === "manage_preferences" || actionType === "save_preferences";
  const observations = bundle.consentUiObservations ?? [];
  if (observations.some((observation) => observation.controls.some((control) => control.visible !== false && matches(control.actionType)))) return true;
  const geometry = item.retainedInput?.consentControlGeometryEvidence;
  const candidates = geometry && Array.isArray(geometry.candidates) ? geometry.candidates : [];
  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const row = candidate as Record<string, unknown>;
    return row.decisionStatus !== "hidden" && matches(row.actionType);
  });
}

function classifyChange(
  item: AroReplayCase,
  field: ControlField,
  stored: string,
  replayed: string,
  storedReasonCodes: string[],
  replayReasonCodes: string[],
) {
  const retainedTypedEvidence = typedEvidenceForField(item, field);
  const explicitSafetyGuardReasons = [
    "consent_session_access_limited",
    "consent_lane_document_unverified",
    "document_mismatch",
    "geometry_document_mismatch",
    "scan_no_go",
    "structured_control_evidence_incomplete",
    "incomplete_first_layer_inventory",
  ];
  const hasSafetyGuard = replayReasonCodes.some((reason) => explicitSafetyGuardReasons.includes(reason));
  const hasObservedReason = replayReasonCodes.some((reason) => [
    "same_document_first_layer_control_observed",
    "geometry_control_observed",
    "structured_control_observed",
  ].includes(reason));
  const classification = replayed === "observed" && retainedTypedEvidence && hasObservedReason
    ? "expected_positive_retention"
    : replayed !== "observed" && hasSafetyGuard
      ? "expected_safety_change"
      : "review_required";
  const rationale = replayed === "observed"
    ? `Retrospective replay produced observed from ${stored}; reason codes: ${replayReasonCodes.join(", ") || "none"}.`
    : `Retrospective replay produced ${replayed} from ${stored}; reason codes: ${replayReasonCodes.join(", ") || "none"}.`;
  const evidenceRisk = replayed === "unknown"
    ? "unknown_state_requires_evidence_review"
    : stored === "observed" && replayed !== "observed"
      ? "observed_state_reduced_or_lost_in_replay"
      : replayed === "observed" && !retainedTypedEvidence
        ? "observed_state_lacks_retained_typed_control_support"
        : "retrospective_state_delta_requires_review";
  return { classification: classification as AroReplayChange["classification"], retainedTypedEvidence, storedReasonCodes, replayReasonCodes, rationale, evidenceRisk };
}

export function replayAroCaptureRegression(
  corpus: AroReplayCorpus,
  materializer: (input: ReplayMaterializedInput) => ConsentControlAssessment = deriveReplayAssessment,
): AroReplayReport {
  const report: AroReplayReport = {
    reportVersion: ARO_CAPTURE_REPLAY_VERSION,
    attribution: "model_assisted",
    excludedDomains: [...corpus.excludedDomains],
    inputCases: corpus.cases.length,
    replayedCases: 0,
    schemaFailures: [],
    compatibilityFailures: [],
    assessmentStatusChanges: [],
    changedConclusions: [],
    caseResults: [],
    reviewQueue: [],
    comparisonMode: "retrospective_canonical_recomputation",
    unchangedCases: 0,
    distributions: {
      stored: blankDistribution(),
      replayed: blankDistribution(),
      changedByField: { accept: 0, reject: 0, options: 0 },
      assessmentStatuses: {},
    },
    timingsMs: { count: 0, total: 0, mean: 0, p50: 0, p95: 0, max: 0 },
  };

  if (corpus.corpusVersion !== ARO_CAPTURE_REPLAY_VERSION) {
    report.compatibilityFailures.push({ scanId: "corpus", message: `Unsupported corpus version: ${corpus.corpusVersion}` });
    return report;
  }
  if (corpus.attribution !== "model_assisted") {
    report.compatibilityFailures.push({ scanId: "corpus", message: "Corpus attribution must remain model_assisted." });
    return report;
  }

  const timings: number[] = [];
  for (const item of corpus.cases) {
    if (isErgoveritas(item.domain) || corpus.excludedDomains.some((domain) => domain.toLowerCase() === item.domain.toLowerCase())) {
      report.compatibilityFailures.push({ scanId: item.scanId, message: "Excluded domain was supplied to replay." });
      continue;
    }
    try {
      for (const field of CONTROL_FIELDS) increment(report.distributions!.stored[field], item.storedAssessment.controls[field].state);
      const startedAt = performance.now();
      const replayed = materializer(item.assessmentInput ?? item.retainedInput!);
      timings.push(performance.now() - startedAt);
      const parsed = consentControlAssessmentSchema.safeParse(replayed);
      if (!parsed.success) {
        report.schemaFailures.push({ scanId: item.scanId, message: parsed.error.message });
        continue;
      }
      report.replayedCases++;
      increment(report.distributions!.assessmentStatuses, parsed.data.assessmentStatus);
      const storedStates = Object.fromEntries(CONTROL_FIELDS.map((field) => [field, item.storedAssessment.controls[field].state])) as Record<ControlField, string>;
      const replayedStates = Object.fromEntries(CONTROL_FIELDS.map((field) => [field, parsed.data.controls[field].state])) as Record<ControlField, string>;
      const replayReasons = Object.fromEntries(CONTROL_FIELDS.map((field) => [field, controlReasonCodes(parsed.data, field)])) as Record<ControlField, string[]>;
      report.caseResults.push({
        scanId: item.scanId,
        domain: item.domain,
        sourceWindow: item.sourceWindow,
        stored: storedStates,
        replayed: replayedStates,
        replayReasonCodes: replayReasons,
        assessmentStatus: parsed.data.assessmentStatus,
      });
      if (parsed.data.artifactVersion !== item.storedAssessment.artifactVersion) {
        report.compatibilityFailures.push({
          scanId: item.scanId,
          message: `Artifact version changed: stored ${item.storedAssessment.artifactVersion}, replayed ${parsed.data.artifactVersion}`,
        });
      }
      if (parsed.data.assessmentStatus !== item.storedAssessment.assessmentStatus) {
        report.assessmentStatusChanges.push({
          scanId: item.scanId,
          domain: item.domain,
          sourceWindow: item.sourceWindow,
          stored: item.storedAssessment.assessmentStatus,
          replayed: parsed.data.assessmentStatus,
          classification: parsed.data.assessmentStatus === "limited" || item.storedAssessment.assessmentStatus === "complete"
            ? "expected_safety_change"
            : "review_required",
        });
      }
      let changed = false;
      for (const field of CONTROL_FIELDS) {
        const stored = item.storedAssessment.controls[field].state;
        const replayedState = parsed.data.controls[field].state;
        if (stored !== replayedState) {
          changed = true;
          report.distributions!.changedByField[field]++;
          increment(report.distributions!.replayed[field], replayedState);
          const change = {
            scanId: item.scanId,
            domain: item.domain,
            sourceWindow: item.sourceWindow,
            field,
            stored,
            replayed: replayedState,
            ...classifyChange(item, field, stored, replayedState, controlReasonCodes(item.storedAssessment, field), controlReasonCodes(parsed.data, field)),
          } satisfies AroReplayChange;
          report.changedConclusions.push(change);
          if (change.classification === "review_required" || replayedState !== "observed" || stored === "observed") {
            report.reviewQueue.push({
              scanId: item.scanId,
              domain: item.domain,
              sourceWindow: item.sourceWindow,
              field,
              reason: change.rationale ?? "Retrospective state delta requires review.",
              evidenceRisk: change.evidenceRisk ?? "retrospective_state_delta_requires_review",
            });
          }
        } else {
          increment(report.distributions!.replayed[field], replayedState);
        }
      }
      if (!changed) report.unchangedCases++;
    } catch (error) {
      report.schemaFailures.push({ scanId: item.scanId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const sortedTimings = [...timings].sort((a, b) => a - b);
  const total = timings.reduce((sum, value) => sum + value, 0);
  report.timingsMs = {
    count: timings.length,
    total,
    mean: timings.length ? total / timings.length : 0,
    p50: percentile(sortedTimings, 0.5),
    p95: percentile(sortedTimings, 0.95),
    max: sortedTimings.at(-1) ?? 0,
  };
  return report;
}

export function loadAroReplayCorpus(filePath: string): AroReplayCorpus {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return parsed as AroReplayCorpus;
}

type CohortLoad = {
  corpus: AroReplayCorpus;
  sourceRoot: string;
  windows: string[];
  sourceRecords: number;
  excludedErgoveritas: number;
  missingBundles: number;
  invalidBundles: number;
  invalidAssessments: number;
};

function jsonLines(filePath: string): unknown[] {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) return [];
    try { return [JSON.parse(trimmed) as unknown]; } catch { return []; }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function retainedFinalUrl(_bundle: CanonicalEvidenceBundle, storedFinalUrl: unknown) {
  // Preserve the stored assessment's finalUrl exactly. Substituting a later
  // bundle snapshot would hide the original document-mismatch condition.
  return typeof storedFinalUrl === "string" && storedFinalUrl.length > 0 ? storedFinalUrl : null;
}

/**
 * Read-only loader for the three retained cohort windows. It reads only the
 * cohort manifest lines, bundle.json, and ConsentControlGeometryEvidence.json;
 * it never opens DOM text, screenshots, action packets, or runtime logs.
 */
export function loadRetainedCohort(cohortRoot: string): CohortLoad {
  const sourceRoot = path.resolve(cohortRoot);
  const windows: Array<"latest" | "previous" | "oldest"> = ["latest", "previous", "oldest"];
  const cases: AroReplayCase[] = [];
  let sourceRecords = 0;
  let excludedErgoveritas = 0;
  let missingBundles = 0;
  let invalidBundles = 0;
  let invalidAssessments = 0;
  for (const sourceWindow of windows) {
    const periodRoot = sourceWindow === "latest" ? sourceRoot : path.join(sourceRoot, sourceWindow);
    const cohortPath = path.join(periodRoot, "cohort.ndjson");
    if (!fs.existsSync(cohortPath)) continue;
    for (const raw of jsonLines(cohortPath)) {
      if (!isRecord(raw) || raw.kind !== "scan") continue;
      sourceRecords++;
      const scanId = typeof raw.id === "string" ? raw.id : "";
      const domain = typeof raw.domain === "string" ? raw.domain : "";
      if (!scanId || !domain) continue;
      if (isErgoveritas(domain)) { excludedErgoveritas++; continue; }
      const scanDir = path.join(periodRoot, "scans", scanId);
      const bundlePath = path.join(scanDir, "bundle.json");
      const geometryPath = path.join(scanDir, "ConsentControlGeometryEvidence.json");
      if (!fs.existsSync(bundlePath)) { missingBundles++; continue; }
      let bundle: CanonicalEvidenceBundle;
      try {
        const parsed = canonicalEvidenceBundleSchema.safeParse(JSON.parse(fs.readFileSync(bundlePath, "utf8")));
        if (!parsed.success) { invalidBundles++; continue; }
        bundle = parsed.data;
      } catch { invalidBundles++; continue; }
      const stored = isRecord(raw.assessment) ? consentControlAssessmentSchema.safeParse(raw.assessment) : { success: false as const };
      if (!stored.success) { invalidAssessments++; continue; }
      let geometry: Record<string, unknown> | null = null;
      if (fs.existsSync(geometryPath)) {
        try {
          const parsedGeometry: unknown = JSON.parse(fs.readFileSync(geometryPath, "utf8"));
          geometry = isRecord(parsedGeometry) ? parsedGeometry : null;
        } catch { geometry = null; }
      }
      const storedAssessment = stored.data;
      cases.push({
        scanId,
        domain,
        sourceWindow,
        attribution: "model_assisted",
        storedAssessment: {
          artifactVersion: storedAssessment.artifactVersion,
          assessmentStatus: storedAssessment.assessmentStatus,
          controls: storedAssessment.controls,
        },
        retainedInput: {
          bundle,
          consentControlGeometryEvidence: geometry,
          finalUrl: retainedFinalUrl(bundle, storedAssessment.scan.finalUrl),
          noGo: storedAssessment.scan.noGo,
          noGoReasonCodes: [],
          requestedUrl: storedAssessment.scan.requestedUrl,
        },
      });
    }
  }
  return {
    corpus: {
      corpusVersion: ARO_CAPTURE_REPLAY_VERSION,
      attribution: "model_assisted",
      excludedDomains: ["ergoveritas.com"],
      sourceCohortRecords: sourceRecords,
      cases,
    },
    sourceRoot,
    windows,
    sourceRecords,
    excludedErgoveritas,
    missingBundles,
    invalidBundles,
    invalidAssessments,
  };
}

function printUsage(): void {
  console.error("Usage: node --import tsx scripts/aro-capture-regression.ts <fixture.json> [report.json]");
  console.error("   or: node --import tsx scripts/aro-capture-regression.ts --cohort-root artifacts/aro-prod-review-20260910 [report.json]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cliArgs = process.argv.slice(2);
  const cohortFlag = cliArgs.indexOf("--cohort-root");
  const cohortRoot = cohortFlag >= 0 ? cliArgs[cohortFlag + 1] : undefined;
  const fixturePath = cohortFlag < 0 ? cliArgs[0] : undefined;
  const reportPath = cohortFlag < 0 ? cliArgs[1] : cliArgs[cohortFlag + 2];
  if (cohortFlag >= 0 && !cohortRoot) {
    printUsage();
    process.exitCode = 2;
  } else if (!fixturePath && !cohortRoot) {
    printUsage();
    process.exitCode = 2;
  } else {
    const loadedCohort = cohortRoot ? loadRetainedCohort(cohortRoot) : null;
    const report = replayAroCaptureRegression(loadedCohort?.corpus ?? loadAroReplayCorpus(path.resolve(fixturePath!)));
    if (loadedCohort) {
      report.cohort = {
        sourceRoot: loadedCohort.sourceRoot,
        windows: loadedCohort.windows,
        sourceRecords: loadedCohort.sourceRecords,
        excludedErgoveritas: loadedCohort.excludedErgoveritas,
        missingBundles: loadedCohort.missingBundles,
        invalidBundles: loadedCohort.invalidBundles,
        invalidAssessments: loadedCohort.invalidAssessments,
      };
    }
    if (reportPath) {
      const resolvedReportPath = path.resolve(reportPath);
      const artifactRoot = path.resolve("artifacts") + path.sep;
      if (!resolvedReportPath.startsWith(artifactRoot)) {
        console.error("Replay reports may only be written under artifacts/.");
        process.exitCode = 2;
      } else {
        fs.writeFileSync(resolvedReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
        process.exitCode = report.schemaFailures.length || report.compatibilityFailures.length ? 1 : 0;
      }
    } else {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      process.exitCode = report.schemaFailures.length || report.compatibilityFailures.length ? 1 : 0;
    }
  }
}
