import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { redirectPublicationHarness } from "./redirect-publication.fixture";

test("Wesco's retained document-response shape publishes both posture scores through the canonical pipeline", async () => {
  const h = await redirectPublicationHarness();
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  try {
    const retained = JSON.parse(readFileSync("apps/web/server/scans/test-fixtures/retained-wesco-runtime-response.json", "utf8"));
    const scanId = retained.provenance.scanId;
    // Sanitized original proof shape; all unrelated evidence stays explicitly empty.
    const bundle = { ...retained, provenance: undefined, scanId,
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-10-31T20:40:20.000Z", completedAt: "2026-10-31T20:40:55.302Z",
      policySurfaceInspection: { californiaReviewPolicy: "california-privacy-review.v10" },
      policySurfaceObservations: [], consentUiObservations: [], cookieEvents: [], iframeEvents: [], screenshots: [],
      runtimeTimeline: [], modulesRun: [],
    };
    const body = JSON.stringify(bundle), manifest = JSON.stringify({ auxiliaryArtifacts: [] });
    writeFileSync(path.join(h.directory, "CanonicalEvidenceBundle.json"), body);
    writeFileSync(path.join(h.directory, "LocalV2DagLambdaManifest.json"), manifest);
    const digest = (value: string) => ({ sha256: createHash("sha256").update(value).digest("hex"), sizeBytes: Buffer.byteLength(value) });
    const processor = "local-certscore-v2-dag-parallel-v1";
    const record = { scan: { id: scanId, domainHostname: "wesco.com", status: "completed", scanType: "full", scanFromValue: "california",
      createdAt: bundle.startedAt, startedAt: bundle.startedAt, completedAt: bundle.completedAt, pagesRequested: 1, pagesScanned: 1,
      scanConfigJson: { processor, hostname: "wesco.com", normalizedUrl: bundle.normalizedUrl,
        execution: { v2DagParallel: { localOnly: true, artifactOnly: true, profile: "standard" }, localV2Dag: { outDir: h.directory } } } },
      signalEnrichmentWorkflow: { findingsReady: true, mergedSignalsReady: true },
      events: [{ id: "retained-result", eventType: "v2_lambda_result.received", createdAt: bundle.completedAt, metadataJson: {
        artifactOnly: true, productionFindingIntegration: false, processor,
        artifactPointers: { scanArtifactUri: `s3://offline-fixture/${scanId}/CanonicalEvidenceBundle.json`, manifestUri: `s3://offline-fixture/${scanId}/LocalV2DagLambdaManifest.json` },
        artifactMetadata: { scanArtifactUri: digest(body), manifestUri: digest(manifest) },
      } }], pageEvidence: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], primaryPolicyEnrichment: null,
      runtimeArtifacts: {}, signals: [], snapshot: {}, trackerVendors: [], validationFindings: [],
    };
    h.state.record = record;
    assert.equal((await h.pipeline.publishCanonicalScanReportProjection({ organizationId: null, scanId, publicationTrigger: "authorized_worker" })).status, "ready");
    const writes = h.state.writes.filter((row: { sql: string }) => row.sql.includes("insert into public.scan_snapshots"));
    assert.equal(writes.length, 1);
    const p = writes[0].params;
    const saved = h.pipeline.readPersistedScanReportProjection({ scan: record.scan, snapshot: {
      report_projection_status: "ready", report_projection_version: p[28], report_projection_computed_at: bundle.completedAt,
      report_projection_payload: JSON.parse(p[37]), report_projection_payload_sha256: p[38], report_projection_payload_size_bytes: p[39],
    } });
    assert.ok(saved);
    assert.equal(saved.runtimeArtifacts.consentControlAssessment.californiaPrivacyReview.observedScoreBasis.policyVersion, "usable_starting_page_score.v4-document-response");
    const api = h.pipeline.buildApiV2ScanResource(saved), report = h.pipeline.buildCanonicalReportExport(saved);
    assert.equal(api.scoreStatus, "final");
    assert.ok(Number.isFinite(api.postureScores.ccpaCpra.score));
    assert.ok(Number.isFinite(api.postureScores.gdprEprivacy.score));
    assert.equal(report.californiaScore.score, api.postureScores.ccpaCpra.score);
    assert.match(h.pipeline.renderCanonicalReportPdf(report).toString("latin1"), /CertScore/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    await h.close();
  }
});
