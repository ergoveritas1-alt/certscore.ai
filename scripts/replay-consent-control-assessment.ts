import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  canonicalEvidenceBundleSchema,
  deriveConsentControlAssessment,
  type ConsentControlAssessmentCandidate,
  type ConsentControlAssessmentGeometry,
  type ConsentControlAssessmentInput,
  type ConsentControlAssessment,
} from "../packages/certscore-contracts/src/index.js";

type Aro = { accept: boolean | null; reject: boolean | null; options: boolean | null };
type ReplayRow = {
  artifactPath: string;
  scanId: string;
  url: string;
  status: "projected" | "invalid_bundle" | "failed";
  geometry: "complete_positive" | "complete_negative" | "document_mismatch" | "incomplete" | "missing";
  bundleAro: Aro;
  geometryAro: Aro;
  legacyCombinedAro: Aro;
  assessmentAro: Aro;
  assessmentStatus: string | null;
  surfaceStatus: string | null;
  coverageStatus: string | null;
  assessment?: ConsentControlAssessment;
  limitationCodes: string[];
  changedFromLegacy: string[];
  positiveRetentions: string[];
  unknowns: string[];
  error?: string;
};

function parseArgs(argv: string[]) {
  const args = {
    root: "artifacts/local-v2-dag-scans",
    out: "artifacts/consent-control-assessment-replay-20260727.json",
    limit: Number.POSITIVE_INFINITY,
    requireEgressLabel: null as string | null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--root" && value) { args.root = value; index += 1; }
    else if (arg === "--out" && value) { args.out = value; index += 1; }
    else if (arg === "--limit" && value) { args.limit = Number.parseInt(value, 10); index += 1; }
    else if (arg === "--require-egress-label" && value) { args.requireEgressLabel = value; index += 1; }
  }
  return args;
}

async function findBundlePaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await findBundlePaths(entryPath));
    else if (entry.isFile() && entry.name === "CanonicalEvidenceBundle.json") paths.push(entryPath);
  }
  return paths;
}

async function filterByExplicitEgressLabel(paths: string[], requiredLabel: string | null) {
  if (!requiredLabel) return paths;
  const selected: string[] = [];
  for (const artifactPath of paths) {
    try {
      const manifest = JSON.parse(await readFile(path.join(path.dirname(artifactPath), "LocalV2DagLambdaManifest.json"), "utf8")) as Record<string, unknown>;
      const diagnostics = manifest.runtimeDiagnostics as Record<string, unknown> | undefined;
      if (diagnostics?.egressLabel === requiredLabel) selected.push(artifactPath);
    } catch {
      // An explicit provenance filter must fail closed when the sibling manifest is absent or invalid.
    }
  }
  return selected;
}

function urlIdentity(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return null;
  }
}

function finalDocumentUrl(bundle: { domSnapshots: Array<{ url: string }>; normalizedUrl: string; url: string }) {
  return urlIdentity(bundle.domSnapshots.at(-1)?.url ?? bundle.normalizedUrl ?? bundle.url);
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function candidateIntent(candidate: Record<string, unknown>) {
  if (candidate.actionType === "accept_all") return "accept" as const;
  if (candidate.actionType === "reject_all") return "reject" as const;
  if (candidate.actionType === "manage_preferences" || candidate.actionType === "save_preferences") return "options" as const;
  if (candidate.actionType === "do_not_sell_share") return "privacy_opt_out" as const;
  return null;
}

function bundleAro(bundle: { consentUiObservations: Array<Record<string, unknown>> }): Aro {
  const observation = bundle.consentUiObservations.find((row) => row.likelyPresent === true) ?? bundle.consentUiObservations[0];
  if (!observation) return { accept: null, reject: null, options: null };
  const controls = Array.isArray(observation.controls) ? observation.controls : [];
  return {
    accept: controls.some((control) => {
      const row = control as Record<string, unknown>;
      return row.visible !== false && row.actionType === "accept_all";
    }),
    reject: controls.some((control) => {
      const row = control as Record<string, unknown>;
      return row.visible !== false && row.actionType === "reject_all";
    }),
    options: controls.some((control) => {
      const row = control as Record<string, unknown>;
      return row.visible !== false && (row.actionType === "manage_preferences" || row.actionType === "save_preferences");
    }),
  };
}

function geometryData(raw: Record<string, unknown>, bundleUrl: string): { status: ReplayRow["geometry"]; aro: Aro; input: ConsentControlAssessmentGeometry } {
  const summary = raw.summary as Record<string, unknown> | undefined;
  const pageUrl = urlIdentity(typeof raw.pageUrl === "string" ? raw.pageUrl : null);
  const finalUrl = urlIdentity(bundleUrl);
  const complete = Boolean(
    summary && typeof summary.firstLayerAccept === "boolean" &&
    typeof summary.firstLayerReject === "boolean" &&
    typeof summary.firstLayerOptions === "boolean" &&
    typeof summary.confidence === "number" && summary.confidence > 0 &&
    Array.isArray(raw.candidates) && pageUrl && finalUrl,
  );
  const status = !complete ? "incomplete" : pageUrl !== finalUrl ? "document_mismatch" : summary!.firstLayerAccept || summary!.firstLayerReject || summary!.firstLayerOptions ? "complete_positive" : "complete_negative";
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((candidate): ConsentControlAssessmentCandidate => {
        const row = candidate as Record<string, unknown>;
        const actionType = typeof row.actionType === "string" ? row.actionType : "other";
        const intent = candidateIntent(row);
        const visible = row.decisionStatus === "confirmed_visible" || row.decisionStatus === "covered";
        return {
          evidenceId: typeof row.candidateId === "string" ? row.candidateId : undefined,
          intent: intent ?? undefined,
          actionType: ["accept_all", "reject_all", "manage_preferences", "save_preferences", "do_not_sell_share", "other"].includes(actionType)
            ? actionType as ConsentControlAssessmentCandidate["actionType"]
            : "other",
          label: typeof row.label === "string" ? row.label : null,
          matchedTerm: typeof row.matchedTerm === "string" ? row.matchedTerm : null,
          matchedLocale: typeof row.matchedLocale === "string" ? row.matchedLocale as ConsentControlAssessmentCandidate["locale"] : null,
          matchStrength: typeof row.matchStrength === "string" ? row.matchStrength as ConsentControlAssessmentCandidate["matchStrength"] : null,
          classifierReasonCodes: Array.isArray(row.classifierReasonCodes) ? row.classifierReasonCodes.filter((value): value is string => typeof value === "string") : [],
          layer: row.layer === "deeper_layer" ? "deeper_layer" : row.layer === "first_layer" ? "first_layer" : "unknown",
          visible,
          actionable: row.enabled !== false,
          channels: ["geometry"],
          artifactRefs: typeof row.screenshotArtifactRef === "string" ? [row.screenshotArtifactRef] : [],
        };
      })
    : [];
  return {
    status,
    aro: {
      accept: summary ? bool(summary.firstLayerAccept) : null,
      reject: summary ? bool(summary.firstLayerReject) : null,
      options: summary ? bool(summary.firstLayerOptions) : null,
    },
    input: {
      artifactVersion: typeof raw.artifactVersion === "string" ? raw.artifactVersion : null,
      assessmentStatus: status === "complete_positive" || status === "complete_negative" ? "complete" : status === "document_mismatch" ? "document_mismatch" : "incomplete",
      documentId: pageUrl,
      observedAtMs: typeof raw.observedAtMs === "number" ? raw.observedAtMs : null,
      completedChannels: status === "complete_positive" || status === "complete_negative" ? ["geometry"] : [],
      incompleteChannels: status === "incomplete" ? ["geometry"] : [],
      evidenceRefs: candidates.flatMap((candidate) => candidate.artifactRefs ?? []),
      candidates,
    },
  };
}

function legacyCombined(bundle: Aro, geometry: Aro, geometryStatus: ReplayRow["geometry"]): Aro {
  if (geometryStatus === "complete_positive" || geometryStatus === "complete_negative") return geometry;
  if (geometryStatus === "document_mismatch" || geometryStatus === "incomplete") return { accept: null, reject: null, options: null };
  return bundle;
}

function assessmentAro(assessment: ReturnType<typeof deriveConsentControlAssessment>): Aro {
  return {
    accept: assessment.controls.accept.state === "observed" ? true : assessment.controls.accept.state === "not_observed" ? false : null,
    reject: assessment.controls.reject.state === "observed" ? true : assessment.controls.reject.state === "not_observed" ? false : null,
    options: assessment.controls.options.state === "observed" ? true : assessment.controls.options.state === "not_observed" ? false : null,
  };
}

function differences(left: Aro, right: Aro) {
  return (["accept", "reject", "options"] as const).filter((key) => left[key] !== right[key]);
}

export async function replayBundle(artifactPath: string): Promise<ReplayRow> {
  const rawText = await readFile(artifactPath, "utf8");
  let bundle: ReturnType<typeof canonicalEvidenceBundleSchema.parse>;
  try {
    bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(rawText));
  } catch (error) {
    return {
      artifactPath, scanId: "unknown", url: "unknown", status: "invalid_bundle", geometry: "missing",
      bundleAro: { accept: null, reject: null, options: null }, geometryAro: { accept: null, reject: null, options: null },
      legacyCombinedAro: { accept: null, reject: null, options: null }, assessmentAro: { accept: null, reject: null, options: null },
      assessmentStatus: null, surfaceStatus: null, coverageStatus: null, limitationCodes: [], changedFromLegacy: [], positiveRetentions: [], unknowns: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const geometryPath = path.join(path.dirname(artifactPath), "ConsentControlGeometryEvidence.json");
    let geometryRaw: Record<string, unknown> | null = null;
    try { geometryRaw = JSON.parse(await readFile(geometryPath, "utf8")) as Record<string, unknown>; } catch { /* optional */ }
    const bundleUrl = finalDocumentUrl(bundle);
    const geometry = geometryRaw ? geometryData(geometryRaw, bundleUrl ?? bundle.url) : { status: "missing" as const, aro: { accept: null, reject: null, options: null }, input: null };
    const legacyBundle = bundleAro(bundle as unknown as { consentUiObservations: Array<Record<string, unknown>> });
    const legacy = legacyCombined(legacyBundle, geometry.aro, geometry.status);
    const observations = bundle.consentUiObservations.map((observation) => ({
      observationId: observation.observationId,
      observedAtMs: observation.observedAtMs,
      likelyPresent: observation.likelyPresent,
      layerInspected: observation.layerInspected,
      documentId: bundleUrl,
      captureStatus: observation.captureStatus,
      completedChannels: observation.captureDiagnostics?.completedChannels,
      incompleteChannels: [...(observation.captureDiagnostics?.timedOutChannels ?? []), ...(observation.captureDiagnostics?.failedChannels ?? [])],
      evidenceRefs: observation.evidenceRefs.map((ref) => ref.refId),
      controls: observation.controls.map((control) => ({
        evidenceId: control.artifactRef ?? `${observation.observationId}:${control.label}`,
        actionType: control.actionType,
        semanticRole: control.semanticRole,
        label: control.label,
        locale: control.matchedLocale,
        matchedTerm: control.matchedTerm,
        matchStrength: control.matchStrength,
        classifierReasonCodes: control.classifierReasonCodes,
        layer: control.layer ?? observation.layerInspected,
        visible: control.visible,
        actionable: control.visible,
        observedAtMs: observation.observedAtMs,
        documentId: bundleUrl,
        channels: observation.captureDiagnostics?.completedChannels,
        artifactRefs: control.artifactRef ? [control.artifactRef] : [],
      })),
    }));
    const assessmentInput: ConsentControlAssessmentInput = {
      scan: {
        scanId: bundle.scanId,
        requestedUrl: bundle.url,
        finalUrl: bundleUrl,
        scanStatus: "completed",
        noGo: bundle.scanNoGoAssessment?.decision === "no_go" || bundle.visualAccessReview?.go_no_go === "NO_GO",
        noGoReasonCodes: bundle.scanNoGoAssessment?.reasonCodes ?? [],
      },
      document: { canonicalDocumentId: bundleUrl },
      observations,
      geometry: geometry.input,
      surface: bundle.consentSurfaceInspection ? {
        status: bundle.consentSurfaceInspection.outcome === "actionable_surface_observed" ? "observed_actionable" : bundle.consentSurfaceInspection.outcome === "non_actionable_surface_observed" ? "observed_non_actionable" : bundle.consentSurfaceInspection.outcome === "no_surface_observed_complete_coverage" ? "not_observed" : "unknown",
        firstObservedAtMs: bundle.consentSurfaceInspection.observedAtMs,
        lastObservedAtMs: bundle.consentSurfaceInspection.observedAtMs,
        evidenceRefs: [],
      } : undefined,
      coverage: (() => {
        const preConsentComplete = bundle.modulesRun.some((moduleRun) => moduleRun.moduleName === "preConsentRuntimeScanner" && moduleRun.status === "completed");
        const explicitIncomplete = bundle.consentUiObservations.some((observation) => observation.captureStatus === "incomplete");
        const inspectionChannels = bundle.consentSurfaceInspection?.evidenceChannels ?? [];
        const mapChannel = (channel: string) => channel === "page_script_inventory" ? "dom_inventory" as const : channel === "viewport_screenshot" ? "screenshot" as const : channel === "cmp_runtime" ? "cmp_runtime" as const : channel === "navigation_network" ? "network_cmp" as const : channel as "accessibility_tree" | "dom_snapshot" | "geometry";
        return {
          status: bundle.consentSurfaceInspection?.coverageStatus === "complete" || (!bundle.consentSurfaceInspection && preConsentComplete && !explicitIncomplete) ? "complete" as const : "limited" as const,
          requiredChannels: ["dom_inventory"] as const,
          completedChannels: bundle.consentSurfaceInspection
            ? inspectionChannels.filter((channel) => channel.status === "observed").map((channel) => mapChannel(channel.channel))
            : preConsentComplete ? ["dom_inventory"] as const : [],
          incompleteChannels: bundle.consentSurfaceInspection
            ? inspectionChannels.filter((channel) => channel.status === "inspection_incomplete").map((channel) => mapChannel(channel.channel))
            : explicitIncomplete ? ["dom_inventory"] as const : [],
          reasonCodes: bundle.consentSurfaceInspection?.limitationKeys ?? (preConsentComplete && !explicitIncomplete ? [] : ["pre_consent_runtime_incomplete"]),
        };
      })(),
      source: { bundleVersion: bundle.schemaVersion, geometryVersion: geometry.input?.artifactVersion ?? null, computedAt: bundle.completedAt },
    };
    const assessment = deriveConsentControlAssessment(assessmentInput);
    const projected = assessmentAro(assessment);
    const changed = differences(legacy, projected);
    const positiveRetentions = (["accept", "reject", "options"] as const).filter((key) => legacy[key] === false && projected[key] === true);
    const unknowns = (["accept", "reject", "options"] as const).filter((key) => projected[key] === null);
    return {
      artifactPath, scanId: bundle.scanId, url: bundle.url, status: "projected", geometry: geometry.status,
      bundleAro: legacyBundle, geometryAro: geometry.aro, legacyCombinedAro: legacy, assessmentAro: projected,
      assessmentStatus: assessment.assessmentStatus, surfaceStatus: assessment.surface.status, coverageStatus: assessment.coverage.status,
      limitationCodes: assessment.limitations.map((limitation) => limitation.code), changedFromLegacy: changed, positiveRetentions, unknowns,
      assessment,
    };
  } catch (error) {
    return {
      artifactPath, scanId: bundle.scanId, url: bundle.url, status: "failed", geometry: "missing",
      bundleAro: { accept: null, reject: null, options: null }, geometryAro: { accept: null, reject: null, options: null },
      legacyCombinedAro: { accept: null, reject: null, options: null }, assessmentAro: { accept: null, reject: null, options: null },
      assessmentStatus: null, surfaceStatus: null, coverageStatus: null, limitationCodes: [], changedFromLegacy: [], positiveRetentions: [], unknowns: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  const out = path.resolve(args.out);
  const discoveredPaths = await findBundlePaths(root);
  const filteredPaths = (await filterByExplicitEgressLabel(discoveredPaths, args.requireEgressLabel))
    .filter((artifactPath) => !artifactPath.split(path.sep).includes("_fake-s3"));
  const paths = filteredPaths.slice(0, args.limit);
  const rows: ReplayRow[] = [];
  for (const artifactPath of paths) rows.push(await replayBundle(artifactPath));
  const projected = rows.filter((row) => row.status === "projected");
  const report = {
    reportType: "consent_control_assessment_replay",
    reportVersion: "1.0",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    sourceRoot: root,
    sourceFilter: args.requireEgressLabel ? { runtimeDiagnosticsEgressLabel: args.requireEgressLabel } : null,
    summary: {
      bundlesDiscovered: paths.length,
      projected: projected.length,
      invalidBundles: rows.filter((row) => row.status === "invalid_bundle").length,
      failed: rows.filter((row) => row.status === "failed").length,
      geometry: Object.fromEntries(["complete_positive", "complete_negative", "document_mismatch", "incomplete", "missing"].map((status) => [status, projected.filter((row) => row.geometry === status).length])),
      changedFromLegacy: projected.filter((row) => row.changedFromLegacy.length > 0).length,
      positiveRetentions: projected.filter((row) => row.positiveRetentions.length > 0).length,
      unknownFields: projected.reduce((sum, row) => sum + row.unknowns.length, 0),
      assessmentStatuses: Object.fromEntries(["complete", "limited", "not_applicable"].map((status) => [status, projected.filter((row) => row.assessmentStatus === status).length])),
      surfaceStatuses: Object.fromEntries(["observed_actionable", "observed_non_actionable", "not_observed", "unknown"].map((status) => [status, projected.filter((row) => row.surfaceStatus === status).length])),
    },
    rows,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out, summary: report.summary }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
