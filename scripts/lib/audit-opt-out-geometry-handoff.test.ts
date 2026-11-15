import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Page } from "playwright";
import { consentControlAssessmentSchema, consentUiObservationSchema } from "@certscore/contracts";
import { projectPublicFirstLayerConsentEvidence } from "../../apps/web/lib/scans/public-first-layer-consent-evidence";
import type { ScanDetailResponse } from "../../apps/web/server/scans/get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "../../apps/web/server/scans/local-v2-dag-report";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "../../apps/web/server/scans/local-v2-dag-scan-config";
import {
  buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION,
} from "../../apps/web/server/scans/scan-report-projection-contract";
import { buildConsentCaptureDiagnostic } from "../../packages/certscore-scan-core/src/consent-capture-diagnostic";
import { captureConsentControlGeometry } from "../../packages/certscore-scan-core/src/consent-control-geometry";
import { extractExportRow } from "./audit-progress-export";
import { applyRetainedOptOutExtracts, OPT_OUT_ASSESSMENT_JOIN_SQL, OPT_OUT_EXTRACT_SQL } from "./audit-progress-opt-out";
import { reviewRetainedConsentControls } from "./retained-consent-control-review";

const fileName = "ConsentControlGeometryEvidence.json";
const url = "https://fixture.test/";
const documentIdentity = { source: "cdp_loader_id", token: "fixture-loader" } as const;
const fileMetadata = (bytes: string) => ({
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sizeBytes: Buffer.byteLength(bytes),
});

async function geometryFixture() {
  const viewport = { width: 800, height: 600 };
  const main = {
    url: () => url,
    evaluate: async () => ({
      pageUrl: url, viewport, documentReadyState: "complete", inventoryLimited: false,
      scripts: [], cookieNames: [], globals: [], domSelectors: [], textSnippets: [], containers: [],
      candidates: [{
        frameUrl: url, label: "Proceed", tagName: "button", layer: "first_layer",
        selectorHint: "#choice", contextText: "Cookie consent", enabled: true, semanticallyInteractive: true,
        computedStyle: { display: "block", visibility: "visible", opacity: "1" },
        boundingBox: { x: 1, y: 1, width: 100, height: 40 }, viewport,
        intersectsViewport: true, clippedByScrollableAncestor: false,
        occlusion: { center: true, checkedPoints: 1, hitSelectorHints: [] },
      }],
    }),
  };
  const child = { url: () => url, evaluate: async () => { throw Error("Fixture frame was inaccessible"); } };
  const page = {
    url: () => url, mainFrame: () => main, frames: () => [main, child],
    context: () => ({ cookies: async () => [] }), on() {}, off() {},
  } as unknown as Page;
  return captureConsentControlGeometry(page, { documentIdentity, timeoutMs: 100 });
}

async function extractInLocalPostgres(directory: string, payloads: unknown[]) {
  // Use the same SELECT and lateral join as the daily query against fixture
  // bytes. Single-user mode needs no socket, database service or credentials.
  const bin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  const data = path.join(directory, "pg-data");
  const resultPath = path.join(directory, "extract.hex");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
  execFileSync(path.join(bin, "initdb"), ["--no-locale", "--auth=trust", "-D", data], { env, timeout: 15_000 });
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const rows = payloads.map((payload, index) => `(${index},${literal(JSON.stringify(payload))}::jsonb)`);
  const sql = `COPY (SELECT encode(convert_to((${OPT_OUT_EXTRACT_SQL})::text,'UTF8'),'hex')
    FROM (VALUES ${rows.join(",")}) p(n,report_projection_payload)
    ${OPT_OUT_ASSESSMENT_JOIN_SQL} ORDER BY p.n) TO ${literal(resultPath)};`;
  execFileSync(path.join(bin, "postgres"), ["--single", "-D", data, "postgres"], {
    input: sql.replaceAll("\n", " ") + "\n", env, timeout: 15_000,
  });
  return (await readFile(resultPath, "utf8")).trim().split("\n").map(line => JSON.parse(Buffer.from(line, "hex").toString("utf8")));
}

test("bound opt-out geometry survives report persistence and the daily audit extract as private diagnostic evidence", async t => {
  const databaseDir = await mkdtemp(path.join(tmpdir(), "opt-out-audit-sql-"));
  t.after(() => rm(databaseDir, { recursive: true, force: true }));
  const artifactRoot = path.join(process.cwd(), "artifacts/local-v2-dag-scans");
  await mkdir(artifactRoot, { recursive: true });
  const outDir = await mkdtemp(path.join(artifactRoot, "opt-out-audit-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  t.after(() => {
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  });
  const { S3Client } = await import("@aws-sdk/client-s3");
  t.mock.method(S3Client.prototype, "send", () => { throw Error("Offline fixture tried to access S3"); });

  const geometry = await geometryFixture();
  const diagnostic = geometry.firstLayerOptOutGeometry;
  assert.ok(diagnostic);
  assert.deepEqual(diagnostic.frameOutcomes, ["captured", "failed"]);
  assert.equal(diagnostic.unresolvedOptOutCount, 1);
  const geometryObservedAtMs = 500;
  const scanStartedAtMs = Date.parse(geometry.capturedAt) - geometryObservedAtMs;
  const createdAt = new Date(scanStartedAtMs).toISOString();
  const completedAt = new Date(scanStartedAtMs + 1_000).toISOString();
  const observation = consentUiObservationSchema.parse({
    observationId: "inventory", observedAtMs: 700, documentIdentity, documentUrl: url,
    likelyPresent: true, confidence: 0.95, basis: [], layerInspected: "first_layer",
    captureStatus: "observed", controls: [], evidenceRefs: [],
    captureDiagnostics: { completedChannels: ["dom_inventory"], failedChannels: [], timedOutChannels: [] },
  });
  observation.captureDiagnostic = buildConsentCaptureDiagnostic({ observation, geometry, scanStartedAtMs });
  assert.equal(observation.captureDiagnostic.geometryObservedAtMs, geometryObservedAtMs);
  const scenarios = ["bound", "legacy", "wrong loader", "wrong checkpoint", "wrong hash"] as const;
  const snapshots = [];
  for (const [index, scenario] of scenarios.entries()) {
    const scanId = `11111111-1111-4111-8111-11111111111${index}`;
    const geometryBytes = JSON.stringify({
      ...geometry,
      ...(scenario === "legacy" ? { firstLayerOptOutGeometry: undefined } : {}),
      ...(scenario === "wrong loader" ? { documentIdentity: { ...documentIdentity, token: "different-loader" } } : {}),
      ...(scenario === "wrong checkpoint" ? { observedAtMs: geometryObservedAtMs + 1 } : {}),
    });
    const metadata = fileMetadata(geometryBytes);
    const bundle = JSON.stringify({
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1", scanId, url, normalizedUrl: url,
      startedAt: createdAt, completedAt, modulesRun: [], networkEvents: [], cookieEvents: [], storageEvents: [],
      iframeEvents: [], scriptEvents: [], formEvents: [], policySurfaceObservations: [], cmpRuntimeObservations: [],
      transportSecurityObservations: [], derivedRuntimeSignals: {}, screenshots: [], consentUiObservations: [observation],
      domSnapshots: [{ artifactId: "dom", path: "dom.json", capturedAtMs: 700, url, documentIdentity,
        consentStateAtTime: "pre_consent", pagePhase: "settled", textExcerpt: "Choose cookies." }],
    });
    const manifest = JSON.stringify({ scanId, processor: LOCAL_V2_DAG_SCAN_PROCESSOR, targetEnvironment: "local",
      auxiliaryArtifacts: [{ fileName, ...metadata, sha256: scenario === "wrong hash" ? "f".repeat(64) : metadata.sha256 }] });
    await Promise.all([
      writeFile(path.join(outDir, fileName), geometryBytes),
      writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), bundle),
      writeFile(path.join(outDir, "LocalV2DagLambdaManifest.json"), manifest),
    ]);
    const record = {
      scan: { id: scanId, status: "completed", completedAt, createdAt, startedAt: createdAt, domainHostname: "fixture.test",
        pagesRequested: 1, pagesScanned: 1, scanConfigJson: {
          hostname: "fixture.test", normalizedUrl: url, processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: { localV2Dag: { outDir }, v2DagParallel: { artifactOnly: true, localOnly: true } },
        } },
      events: [{ id: scanId, eventType: "v2_lambda_result.received", createdAt: completedAt,
        metadataJson: {
          artifactOnly: true, productionFindingIntegration: false, processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          artifactAccess: { productionReadMode: "verified_s3" },
          artifactMetadata: { manifestUri: fileMetadata(manifest), scanArtifactUri: fileMetadata(bundle) },
          artifactPointers: { manifestUri: "s3://offline-fixture/manifest", scanArtifactUri: "s3://offline-fixture/bundle" },
        } }],
      snapshot: {}, runtimeArtifacts: {}, pageEvidence: [], validationFindings: [], preconsentViolations: [],
      policyEnrichment: [], policyReviewQueue: [], trackerVendors: [], signals: [],
    } as unknown as ScanDetailResponse;
    const detail = await materializeLocalV2DagScanDetail(record, { requireBundle: true });
    const persisted = buildPersistedScanReportProjection(detail);
    const sourceHash = fileMetadata(bundle).sha256;
    const reloaded = readPersistedScanReportProjection({ scan: record.scan, snapshot: {
      report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
      report_projection_computed_at: completedAt, report_projection_source_hash: sourceHash,
      report_projection_payload: JSON.parse(persisted.serialized), report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes,
    } });
    assert.ok(reloaded, scenario);
    const assessment = consentControlAssessmentSchema.parse(reloaded.runtimeArtifacts?.consentControlAssessment);
    assert.equal(assessment.controls.privacyOptOut.state, "unknown", scenario);
    assert.deepEqual(assessment.coverage.firstLayerOptOutGeometry,
      scenario === "bound" ? { sourceSha256: metadata.sha256, data: diagnostic } : undefined, scenario);
    const publicEvidence = projectPublicFirstLayerConsentEvidence(assessment, scanId);
    assert.ok(publicEvidence, scenario);
    assert.equal(publicEvidence.privacyOptOutControlObserved, null);
    assert.doesNotMatch(JSON.stringify(publicEvidence), /firstLayerOptOutGeometry|frameOutcomes/);
    snapshots.push({ scenario, persisted, sourceHash, assessment, publicEvidence });
  }
  const { assessmentSourceHash: _boundSource, ...boundPublic } = snapshots[0]!.publicEvidence;
  const { assessmentSourceHash: _legacySource, ...legacyPublic } = snapshots[1]!.publicEvidence;
  assert.deepEqual(boundPublic, legacyPublic);

  const extracts = await extractInLocalPostgres(databaseDir, snapshots.map(({ persisted }) => persisted.payload));
  assert.equal(extracts.length, scenarios.length);
  for (const [index, snapshot] of snapshots.entries()) {
    const { assessment, publicEvidence, persisted, sourceHash, scenario } = snapshot;
    const scanId = assessment.scan.scanId!;
    const extract = extracts[index];
    assert.deepEqual(extract.coverage.firstLayerOptOutGeometry, assessment.coverage.firstLayerOptOutGeometry);
    const publicExport = {
      scanId, domain: "fixture.test", scanStatus: "completed", timestamps: { createdAt },
      meta: { projectionVersion: "pulse-public-v11", reportProjectionVersion: SCAN_REPORT_PROJECTION_VERSION,
        reportProjectionSourceHash: sourceHash },
      consentSurfaceEvidence: { firstLayerConsentChoices: publicEvidence },
      customerConsentEvidence: { status: "unavailable", controls: [], binding: {
        scanId, reportSourceHash: sourceHash, reportVersion: SCAN_REPORT_PROJECTION_VERSION,
      } },
    };
    const exportBytes = JSON.stringify(publicExport);
    const exportFile = path.join(outDir, "export.json");
    await writeFile(exportFile, exportBytes);
    const row = extractExportRow(publicExport, { file: exportFile, sha256: fileMetadata(exportBytes).sha256,
      role: "hash_verified_bot_archive_export" });
    const inventoryBytes = JSON.stringify({ version: "certscore.mac-mini-direct-id-inventory.v1", readOnly: true, rows: [{
      scanId, isMacMini: true, isCanary: false, originalRequestId: "fixture-creator", created_at: createdAt,
      status: "completed", projection_status: "ready", projection_version: SCAN_REPORT_PROJECTION_VERSION,
      projection_source_hash: sourceHash, projection_payload_sha256: persisted.sha256, control_assessment: extract,
    }] });
    const inventoryFile = path.join(outDir, "delta-inventory.json");
    await writeFile(inventoryFile, inventoryBytes);
    const { sha256, sizeBytes } = fileMetadata(inventoryBytes);
    assert.equal(applyRetainedOptOutExtracts([row], [{ file: inventoryFile, sha256, bytes: sizeBytes }]).added, 1);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(createdAt));
    const review = reviewRetainedConsentControls({ rows: [row] }, day, { firstLayerOptOut: true });
    assert.equal(review.counts.privacyOptOut?.unknown, 1);
    assert.deepEqual(review.cases[0]?.optOutGeometry, scenario === "bound"
      ? { availability: "available", value: assessment.coverage.firstLayerOptOutGeometry }
      : { availability: "unavailable", reason: "not_retained_in_source" }, scenario);
  }
});
