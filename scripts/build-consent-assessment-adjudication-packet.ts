import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ReplayRow = {
  artifactPath: string;
  scanId: string;
  url: string;
  status: string;
  geometry: string;
  bundleAro: Record<string, boolean | null>;
  geometryAro: Record<string, boolean | null>;
  legacyCombinedAro: Record<string, boolean | null>;
  assessmentAro: Record<string, boolean | null>;
  assessmentStatus: string | null;
  surfaceStatus: string | null;
  coverageStatus: string | null;
  limitationCodes: string[];
  changedFromLegacy: string[];
  positiveRetentions: string[];
  unknowns: string[];
};

type ReplayReport = { rows: ReplayRow[]; sourceRoot: string; generatedAt: string };

function parseArgs(argv: string[]) {
  const args = {
    replay: "artifacts/consent-control-assessment-replay-20260727.json",
    out: "artifacts/consent-control-assessment-adjudication-packet-20260727.json",
    includeAll: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--replay" && value) { args.replay = value; index += 1; }
    else if (arg === "--out" && value) { args.out = value; index += 1; }
    else if (arg === "--include-all") { args.includeAll = true; }
  }
  return args;
}

function boundedText(value: unknown, limit: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function relativeArtifactPath(value: string) {
  const cwd = process.cwd();
  return path.relative(cwd, value) || value;
}

function controlEvidence(bundle: Record<string, unknown>) {
  const observations = Array.isArray(bundle.consentUiObservations) ? bundle.consentUiObservations : [];
  return observations.flatMap((observation) => {
    if (!observation || typeof observation !== "object") return [];
    const row = observation as Record<string, unknown>;
    const controls = Array.isArray(row.controls) ? row.controls : [];
    return controls.slice(0, 24).map((control) => {
      const candidate = control as Record<string, unknown>;
      return {
        observationId: boundedText(row.observationId, 160),
        observedAtMs: typeof row.observedAtMs === "number" ? row.observedAtMs : null,
        likelyPresent: row.likelyPresent === true,
        layer: boundedText(candidate.layer ?? row.layerInspected, 40),
        actionType: boundedText(candidate.actionType, 60),
        semanticRole: boundedText(candidate.semanticRole, 60),
        label: boundedText(candidate.label, 160),
        visible: typeof candidate.visible === "boolean" ? candidate.visible : null,
        matchedTerm: boundedText(candidate.matchedTerm, 120),
        matchedLocale: boundedText(candidate.matchedLocale, 20),
        evidenceRef: boundedText(candidate.artifactRef, 240),
      };
    });
  }).slice(0, 48);
}

function geometryEvidence(raw: Record<string, unknown> | null) {
  if (!raw) return [];
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  return candidates.slice(0, 32).map((candidate) => {
    const row = candidate as Record<string, unknown>;
    return {
      candidateId: boundedText(row.candidateId, 160),
      label: boundedText(row.label, 160),
      actionType: boundedText(row.actionType, 60),
      layer: boundedText(row.layer, 40),
      decisionStatus: boundedText(row.decisionStatus, 60),
      enabled: typeof row.enabled === "boolean" ? row.enabled : null,
      matchedTerm: boundedText(row.matchedTerm, 120),
      screenshotArtifactRef: boundedText(row.screenshotArtifactRef, 240),
      reasons: Array.isArray(row.reasons) ? row.reasons.filter((value): value is string => typeof value === "string").slice(0, 8) : [],
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.replay, "utf8")) as ReplayReport;
  const selected = report.rows.filter((row) => row.status === "projected" && (args.includeAll || row.positiveRetentions.length > 0 || (
    row.legacyCombinedAro.accept === false && row.legacyCombinedAro.reject === false && row.legacyCombinedAro.options === false && row.assessmentAro.accept === null && row.assessmentAro.reject === null && row.assessmentAro.options === null
  )));
  const rows = [];
  for (const row of selected) {
    const bundle = JSON.parse(await readFile(row.artifactPath, "utf8")) as Record<string, unknown>;
    const geometryPath = path.join(path.dirname(row.artifactPath), "ConsentControlGeometryEvidence.json");
    let geometry: Record<string, unknown> | null = null;
    try { geometry = JSON.parse(await readFile(geometryPath, "utf8")) as Record<string, unknown>; } catch { /* optional */ }
    const category = row.positiveRetentions.length > 0 ? "positive_retention" : "legacy_false_to_unknown";
    rows.push({
      reviewId: `${category}:${row.scanId}`,
      category,
      reviewStatus: "pending_luna_adjudication",
      scanId: row.scanId,
      url: row.url,
      legacy: row.legacyCombinedAro,
      assessment: row.assessmentAro,
      geometryStatus: row.geometry,
      assessmentStatus: row.assessmentStatus,
      surfaceStatus: row.surfaceStatus,
      coverageStatus: row.coverageStatus,
      changedFields: row.changedFromLegacy,
      positiveRetentions: row.positiveRetentions,
      unknownFields: row.unknowns,
      limitationCodes: row.limitationCodes,
      document: {
        bundleUrl: boundedText(bundle.url, 500),
        normalizedUrl: boundedText(bundle.normalizedUrl, 500),
        finalDomUrl: Array.isArray(bundle.domSnapshots) ? boundedText((bundle.domSnapshots.at(-1) as Record<string, unknown> | undefined)?.url, 500) : null,
      },
      bundleControls: controlEvidence(bundle),
      geometryControls: geometryEvidence(geometry),
      artifacts: {
        bundle: relativeArtifactPath(row.artifactPath),
        geometry: geometry ? relativeArtifactPath(geometryPath) : null,
      },
    });
  }
  const output = {
    artifactType: "consent_control_assessment_adjudication_packet",
    artifactVersion: "1.0",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    reviewer: "Luna",
    sourceReplay: args.replay,
    sourceReplayGeneratedAt: report.generatedAt,
    evidencePolicy: "bounded labels, timestamps, classifications, and artifact references; no raw DOM, response bodies, cookies, or model reasoning",
    summary: {
      totalCases: rows.length,
      positiveRetentionCases: rows.filter((row) => row.category === "positive_retention").length,
      legacyFalseToUnknownCases: rows.filter((row) => row.category === "legacy_false_to_unknown").length,
    },
    adjudicationFields: [
      "retain_assessment",
      "accept_state",
      "reject_state",
      "options_state",
      "document_match_confirmed",
      "same_document_temporal_rule_applies",
      "false_to_unknown_repair_confirmed",
      "score_or_checklist_effect_reviewed",
      "reviewer_notes",
    ],
    rows,
  };
  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out: path.resolve(args.out), summary: output.summary }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
