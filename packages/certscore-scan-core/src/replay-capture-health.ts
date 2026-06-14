import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ReplayCaptureHealthSummaryInput {
  completed?: number;
  failed?: number;
  results?: Array<{
    status?: string;
    url?: string;
  }>;
  totalUrls?: number;
}

export interface ReplayCaptureHealthReport {
  reportVersion: "consent_flow_replay_capture_health.v1";
  runId: string;
  timestamp: string;
  outDir: string;
  urlsAttempted: number;
  sitesAttempted: number;
  sitesCompleted: number;
  sitesFailed: number;
  sitesWithAtLeastOneReplayBundle: number;
  totals: {
    replayManifests: number;
    harFiles: number;
    traceFiles: number;
    storageStateFiles: number;
    controlSnapshotFiles: number;
    mainFrameDomTextSnapshots: number;
    frameDomTextSnapshots: number;
    screenshotFiles: number;
    originalConsentEvidenceFiles: number;
    proofResultJsonFiles: number;
    scanCorePhaseFiles: number;
    scanLabStepDiagnosticsFiles: number;
    actionCandidateCollectionsObserved: number;
    corpusSizeBytes?: number;
  };
  largestHarFiles: Array<{ path: string; sizeBytes: number }>;
  largestTraceFiles: Array<{ path: string; sizeBytes: number }>;
  artifactCaptureWarningsByType: Record<string, number>;
  missingArtifactCountsByType: Record<string, number>;
  scenarioCounts: {
    baselinePreConsent: number;
    reject: number;
    accept: number;
    gpcEnabled: number;
    privacyOptOut: number;
    formCollectionProbe: number;
    accessibilityProbe: number;
    settingsPreferences: number;
    unknown: number;
  };
  artifactStatusByType: Record<string, "present" | "missing" | "unavailable" | "capture_failed">;
}

interface ReplayManifestLike {
  artifactPaths?: Record<string, string | undefined>;
  scenario?: string;
}

interface FileEntry {
  path: string;
  relativePath: string;
  sizeBytes: number;
}

export async function writeReplayCaptureHealthReport(input: {
  outDir: string;
  summary?: ReplayCaptureHealthSummaryInput;
  timestamp?: Date;
}): Promise<ReplayCaptureHealthReport> {
  const report = await buildReplayCaptureHealthReport(input);
  await mkdir(input.outDir, { recursive: true });
  await writeFile(
    path.join(input.outDir, "ReplayCaptureHealthReport.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(input.outDir, "ReplayCaptureHealthReport.md"),
    renderReplayCaptureHealthMarkdown(report),
    "utf8",
  );
  return report;
}

export async function buildReplayCaptureHealthReport(input: {
  outDir: string;
  summary?: ReplayCaptureHealthSummaryInput;
  timestamp?: Date;
}): Promise<ReplayCaptureHealthReport> {
  const outDir = path.resolve(input.outDir);
  const files = await listFilesBounded(outDir);
  const manifestFiles = files.filter((file) => /^replay_.+\.manifest\.json$/i.test(path.basename(file.path)));
  const warnings: Record<string, number> = {};
  const missing: Record<string, number> = {};
  const scenarioCounts = {
    baselinePreConsent: 0,
    reject: 0,
    accept: 0,
    gpcEnabled: 0,
    privacyOptOut: 0,
    formCollectionProbe: 0,
    accessibilityProbe: 0,
    settingsPreferences: 0,
    unknown: 0,
  };
  let frameDomTextSnapshots = 0;
  let mainFrameDomTextSnapshots = 0;
  let actionCandidateCollectionsObserved = 0;
  const sitesWithReplay = new Set<string>();
  const referencedHarPaths = new Set<string>();
  const referencedTracePaths = new Set<string>();
  const referencedStorageStatePaths = new Set<string>();
  const referencedOriginalEvidencePaths = new Set<string>();
  const referencedFrameSnapshotPaths = new Set<string>();
  const referencedControlSnapshotPaths = new Set<string>();

  for (const manifestFile of manifestFiles) {
    const manifest = await readJsonSafely<ReplayManifestLike>(manifestFile.path);
    if (!manifest) {
      increment(warnings, "manifest_parse_failed");
      scenarioCounts.unknown += 1;
      continue;
    }
    sitesWithReplay.add(siteKeyFromManifest(manifestFile.path, manifest));
    incrementScenarioCount(scenarioCounts, manifest.scenario);
    const artifactPaths = manifest.artifactPaths ?? {};
    collectReferencedPath(referencedHarPaths, manifestFile.path, artifactPaths.har);
    collectReferencedPath(referencedTracePaths, manifestFile.path, artifactPaths.trace);
    collectReferencedPath(referencedStorageStatePaths, manifestFile.path, artifactPaths.storageState);
    collectReferencedPath(referencedOriginalEvidencePaths, manifestFile.path, artifactPaths.originalConsentEvidence);
    collectReferencedPath(referencedFrameSnapshotPaths, manifestFile.path, artifactPaths.frameSnapshots);
    collectReferencedPath(referencedControlSnapshotPaths, manifestFile.path, artifactPaths.controls);
    for (const key of ["har", "trace", "storageState", "frameSnapshots", "originalConsentEvidence", "controls"] as const) {
      const artifactPath = resolveArtifactPath(manifestFile.path, artifactPaths[key]);
      if (!artifactPath) {
        increment(missing, `${key}:unavailable`);
      } else if (!existsSync(artifactPath)) {
        increment(missing, `${key}:missing`);
      }
    }

    const frameSnapshotPath = resolveArtifactPath(manifestFile.path, artifactPaths.frameSnapshots);
    const framesJson = frameSnapshotPath ? await readJsonSafely<{ frameSnapshots?: Array<Record<string, unknown>> }>(frameSnapshotPath) : undefined;
    if (frameSnapshotPath && !framesJson) {
      increment(warnings, "frameSnapshots:capture_failed");
    }
    for (const frame of framesJson?.frameSnapshots ?? []) {
      const html = typeof frame.htmlExcerpt === "string" ? frame.htmlExcerpt : "";
      const text = typeof frame.textExcerpt === "string" ? frame.textExcerpt : "";
      if (html.length > 0 || text.length > 0) {
        frameDomTextSnapshots += 1;
        if (frame.frameKind === "main_frame" || frame.frameIndex === 0) {
          mainFrameDomTextSnapshots += 1;
        }
      }
    }

    const originalEvidencePath = resolveArtifactPath(manifestFile.path, artifactPaths.originalConsentEvidence);
    const originalEvidence = originalEvidencePath ? await readJsonSafely<{ actionCandidates?: unknown[] }>(originalEvidencePath) : undefined;
    if (originalEvidencePath && !originalEvidence) {
      increment(warnings, "originalConsentEvidence:capture_failed");
    }
    if ((originalEvidence?.actionCandidates?.length ?? 0) > 0) {
      actionCandidateCollectionsObserved += 1;
    }
  }

  const summary = input.summary;
  const results = summary?.results ?? [];
  const urlsAttempted = summary?.totalUrls ?? results.filter((result) => result.status !== "skipped").length;
  const sitesCompleted = summary?.completed ?? results.filter((result) => result.status === "completed").length;
  const sitesFailed = summary?.failed ?? results.filter((result) => result.status === "failed").length;
  const sitesAttempted = results.length > 0 ? results.filter((result) => result.status !== "skipped").length : Math.max(urlsAttempted, sitesCompleted + sitesFailed);
  const harFiles = files.filter((file) => /^replay_.+\.har(?:\.zip)?$/i.test(path.basename(file.path)));
  const traceFiles = files.filter((file) => /^replay_.+\.trace\.zip$/i.test(path.basename(file.path)));
  const storageStateFiles = files.filter((file) => /^replay_.+\.storage-state\.json$/i.test(path.basename(file.path)));
  const controlSnapshotFiles = files.filter((file) => /^replay_.+\.controls\.json$/i.test(path.basename(file.path)));
  const originalEvidenceFiles = files.filter((file) => /^replay_.+\.original-consent-evidence\.json$/i.test(path.basename(file.path)));
  const screenshotFiles = files.filter((file) => /\.(?:png|jpe?g|webp)$/i.test(file.path));
  const proofResultJsonFiles = files.filter((file) =>
    /(?:ReviewResult|CanonicalEvidenceBundle|V2ReportProjectionDraft|Wc01V2EvidencePreviewPacket)\.json$/i.test(path.basename(file.path)),
  );
  const scanCorePhaseFiles = files.filter((file) => /V2ScanCorePhases\.json$/i.test(path.basename(file.path)));
  const scanLabStepDiagnosticsFiles = files.filter((file) => /V2ScanLabStepDiagnostics\.json$/i.test(path.basename(file.path)));
  const harArtifactFiles = await existingFileEntries([...new Set([...harFiles.map((file) => file.path), ...referencedHarPaths])], outDir);
  const traceArtifactFiles = await existingFileEntries([...new Set([...traceFiles.map((file) => file.path), ...referencedTracePaths])], outDir);
  const storageArtifactFiles = await existingFileEntries([...new Set([...storageStateFiles.map((file) => file.path), ...referencedStorageStatePaths])], outDir);
  const controlSnapshotArtifactFiles = await existingFileEntries([...new Set([...controlSnapshotFiles.map((file) => file.path), ...referencedControlSnapshotPaths])], outDir);
  const originalEvidenceArtifactFiles = await existingFileEntries([...new Set([...originalEvidenceFiles.map((file) => file.path), ...referencedOriginalEvidencePaths])], outDir);
  const referencedArtifactFiles = await existingFileEntries([
    ...new Set([
      ...files.map((file) => file.path),
      ...referencedHarPaths,
      ...referencedTracePaths,
      ...referencedStorageStatePaths,
      ...referencedOriginalEvidencePaths,
      ...referencedFrameSnapshotPaths,
      ...referencedControlSnapshotPaths,
    ]),
  ], outDir);
  const corpusSizeBytes = referencedArtifactFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  return {
    reportVersion: "consent_flow_replay_capture_health.v1",
    runId: path.basename(outDir),
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    outDir,
    urlsAttempted,
    sitesAttempted,
    sitesCompleted,
    sitesFailed,
    sitesWithAtLeastOneReplayBundle: sitesWithReplay.size,
    totals: {
      replayManifests: manifestFiles.length,
      harFiles: harArtifactFiles.length,
      traceFiles: traceArtifactFiles.length,
      storageStateFiles: storageArtifactFiles.length,
      controlSnapshotFiles: controlSnapshotArtifactFiles.length,
      mainFrameDomTextSnapshots,
      frameDomTextSnapshots,
      screenshotFiles: screenshotFiles.length,
      originalConsentEvidenceFiles: originalEvidenceArtifactFiles.length,
      proofResultJsonFiles: proofResultJsonFiles.length,
      scanCorePhaseFiles: scanCorePhaseFiles.length,
      scanLabStepDiagnosticsFiles: scanLabStepDiagnosticsFiles.length,
      actionCandidateCollectionsObserved,
      corpusSizeBytes,
    },
    largestHarFiles: topLargest(harArtifactFiles),
    largestTraceFiles: topLargest(traceArtifactFiles),
    artifactCaptureWarningsByType: sortRecord(warnings),
    missingArtifactCountsByType: sortRecord(missing),
    scenarioCounts,
    artifactStatusByType: {
      har: artifactStatus(manifestFiles.length, harArtifactFiles.length, missing, "har"),
      trace: artifactStatus(manifestFiles.length, traceArtifactFiles.length, missing, "trace"),
      storageState: artifactStatus(manifestFiles.length, storageArtifactFiles.length, missing, "storageState"),
      controls: artifactStatus(manifestFiles.length, controlSnapshotArtifactFiles.length, missing, "controls"),
      frameSnapshots: artifactStatus(manifestFiles.length, frameDomTextSnapshots, missing, "frameSnapshots"),
      originalConsentEvidence: artifactStatus(manifestFiles.length, originalEvidenceArtifactFiles.length, missing, "originalConsentEvidence"),
      screenshots: screenshotFiles.length > 0 ? "present" : "unavailable",
      proofResultJson: proofResultJsonFiles.length > 0 ? "present" : "unavailable",
    },
  };
}

export function renderReplayCaptureHealthMarkdown(report: ReplayCaptureHealthReport): string {
  const lines = [
    "# Replay Capture Health Report",
    "",
    "Internal diagnostic only. Capture/replay infrastructure health; not production scoring or report output.",
    "",
    `- Run ID: ${report.runId}`,
    `- Timestamp: ${report.timestamp}`,
    `- Output dir: ${report.outDir}`,
    `- URLs attempted: ${report.urlsAttempted}`,
    `- Sites attempted: ${report.sitesAttempted}`,
    `- Sites completed: ${report.sitesCompleted}`,
    `- Sites failed: ${report.sitesFailed}`,
    `- Sites with replay bundle: ${report.sitesWithAtLeastOneReplayBundle}`,
    `- Replay manifests: ${report.totals.replayManifests}`,
    `- HAR files: ${report.totals.harFiles}`,
    `- Trace files: ${report.totals.traceFiles}`,
    `- Storage-state files: ${report.totals.storageStateFiles}`,
    `- Control snapshot files: ${report.totals.controlSnapshotFiles}`,
    `- Frame DOM/text snapshots: ${report.totals.frameDomTextSnapshots}`,
    `- Main-frame DOM/text snapshots: ${report.totals.mainFrameDomTextSnapshots}`,
    `- Original consent evidence files: ${report.totals.originalConsentEvidenceFiles}`,
    `- Scan-core phase files: ${report.totals.scanCorePhaseFiles}`,
    `- Scan-lab step diagnostics files: ${report.totals.scanLabStepDiagnosticsFiles}`,
    `- Action candidate collections observed: ${report.totals.actionCandidateCollectionsObserved}`,
    `- Corpus size: ${formatBytes(report.totals.corpusSizeBytes ?? 0)}`,
    "",
    "## Artifact Status",
    "",
    ...Object.entries(report.artifactStatusByType).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Missing Artifacts",
    "",
    ...recordLines(report.missingArtifactCountsByType),
    "",
    "## Capture Warnings",
    "",
    ...recordLines(report.artifactCaptureWarningsByType),
    "",
    "## Scenario Counts",
    "",
    `- baseline/pre-consent: ${report.scenarioCounts.baselinePreConsent}`,
    `- reject: ${report.scenarioCounts.reject}`,
    `- accept: ${report.scenarioCounts.accept}`,
    `- GPC enabled: ${report.scenarioCounts.gpcEnabled}`,
    `- privacy opt-out: ${report.scenarioCounts.privacyOptOut}`,
    `- form collection probe: ${report.scenarioCounts.formCollectionProbe}`,
    `- accessibility probe: ${report.scenarioCounts.accessibilityProbe}`,
    `- settings/preferences: ${report.scenarioCounts.settingsPreferences}`,
    `- unknown: ${report.scenarioCounts.unknown}`,
    "",
    "## Largest HAR Files",
    "",
    ...sizeRows(report.largestHarFiles),
    "",
    "## Largest Trace Files",
    "",
    ...sizeRows(report.largestTraceFiles),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function listFilesBounded(root: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  await walk(root, entries);
  return entries;
}

async function walk(dir: string, entries: FileEntry[]): Promise<void> {
  const children = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const child of children) {
    const childPath = path.join(dir, child.name);
    if (child.isDirectory()) {
      await walk(childPath, entries);
      continue;
    }
    if (!child.isFile()) {
      continue;
    }
    const info = await stat(childPath).catch(() => undefined);
    if (!info) {
      continue;
    }
    entries.push({
      path: childPath,
      relativePath: path.relative(dir, childPath),
      sizeBytes: info.size,
    });
  }
}

async function readJsonSafely<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function resolveArtifactPath(manifestPath: string, artifactPath: string | undefined): string | undefined {
  if (!artifactPath) {
    return undefined;
  }
  return path.isAbsolute(artifactPath) ? artifactPath : path.resolve(path.dirname(manifestPath), artifactPath);
}

function collectReferencedPath(paths: Set<string>, manifestPath: string, artifactPath: string | undefined): void {
  const resolved = resolveArtifactPath(manifestPath, artifactPath);
  if (resolved) {
    paths.add(resolved);
  }
}

async function existingFileEntries(paths: string[], root: string): Promise<FileEntry[]> {
  const entries = [];
  for (const filePath of paths) {
    const info = await stat(filePath).catch(() => undefined);
    if (!info?.isFile()) {
      continue;
    }
    entries.push({
      path: filePath,
      relativePath: path.relative(root, filePath),
      sizeBytes: info.size,
    });
  }
  return entries;
}

function siteKeyFromManifest(manifestPath: string, manifest: ReplayManifestLike): string {
  const paths = manifest.artifactPaths ?? {};
  const source = paths.har ?? paths.frameSnapshots ?? manifestPath;
  return path.dirname(resolveArtifactPath(manifestPath, source) ?? manifestPath);
}

function incrementScenarioCount(counts: ReplayCaptureHealthReport["scenarioCounts"], scenario: string | undefined): void {
  if (scenario === "baseline_pre_consent") {
    counts.baselinePreConsent += 1;
  } else if (scenario === "reject_all_flow") {
    counts.reject += 1;
  } else if (scenario === "accept_all_flow") {
    counts.accept += 1;
  } else if (scenario === "gpc_enabled") {
    counts.gpcEnabled += 1;
  } else if (scenario === "privacy_opt_out_flow") {
    counts.privacyOptOut += 1;
  } else if (scenario === "form_collection_probe") {
    counts.formCollectionProbe += 1;
  } else if (scenario === "accessibility_probe") {
    counts.accessibilityProbe += 1;
  } else if (scenario === "preference_center") {
    counts.settingsPreferences += 1;
  } else {
    counts.unknown += 1;
  }
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function artifactStatus(
  manifestCount: number,
  presentCount: number,
  missing: Record<string, number>,
  key: string,
): "present" | "missing" | "unavailable" | "capture_failed" {
  if (manifestCount === 0) {
    return "unavailable";
  }
  if ((missing[`${key}:missing`] ?? 0) > 0) {
    return presentCount > 0 ? "capture_failed" : "missing";
  }
  if ((missing[`${key}:unavailable`] ?? 0) > 0 && presentCount === 0) {
    return "unavailable";
  }
  return presentCount > 0 ? "present" : "missing";
}

function topLargest(files: FileEntry[]) {
  return files
    .slice()
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, 10)
    .map((file) => ({ path: file.path, sizeBytes: file.sizeBytes }));
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function recordLines(record: Record<string, number>): string[] {
  const entries = Object.entries(record);
  return entries.length > 0 ? entries.map(([key, value]) => `- ${key}: ${value}`) : ["- none"];
}

function sizeRows(files: Array<{ path: string; sizeBytes: number }>): string[] {
  if (files.length === 0) {
    return ["- none"];
  }
  return files.map((file) => `- ${formatBytes(file.sizeBytes)} ${file.path}`);
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
