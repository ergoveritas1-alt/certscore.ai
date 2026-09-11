import { createHash } from "node:crypto";
import { gpcRuntimeFixture } from "./gpc-runtime";
import { canonicalEvidenceBundleSchema, gpcObservationSessionSchema } from "../index";
export function gpcProductionRuntimeFixture() {
  const bundle = gpcRuntimeFixture({ enabled: true, vendors: [{ name: "Fixture Ads" }] });
  const hash = (v: string) => createHash("sha256").update(v).digest("hex");
  const captureId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const documentToken = "fixture-loader";
  const documentUrlSha256 = hash(bundle.url);
  const session = gpcObservationSessionSchema.parse({ contractVersion: "certscore.gpc-observation-session.v2",
    scanId: bundle.scanId, captureId, observationScope: "main_document_and_retained_http_requests", captureStartedAtMs: 0, captureEndedAtMs: 1000,
    terminal: "completed", mainDocument: { documentToken, documentUrlSha256, requestUrlSha256: documentUrlSha256,
      requestId: "gpc_observation_document", requestAtMs: 0, committedAtMs: 1, secGpc: "1" },
    semanticObservation: { contractVersion: "certscore.gpc-opt-out-observation.prototype.v1", adapterVersion: "gpc_usca_usnat_and_live_status.v4",
      scanId: bundle.scanId, documentUrlSha256, captureBinding: { captureId, documentToken, documentIdentitySource: "cdp_loader_id" },
      documentStartedAtMs: 0, capturedAtMs: 900, navigatorGpc: true, gppStatus: "unavailable", usca: null, usnat: null,
      stateSha256: null, acknowledgment: [], acknowledgmentCaptureComplete: true, limitationKeys: [] },
    requests: bundle.networkEvents.map(r => ({ eventId: r.eventId, timestampMs: r.timestampMs, urlSha256: hash(r.requestUrl), secGpc: "1" })),
    requestsObserved: bundle.networkEvents.length, requestsDropped: 0, listener: { callbacks: 0, dropped: 0, registered: false }, limitationKeys: [],
  });
  return canonicalEvidenceBundleSchema.parse({ ...bundle, completedAt: "2026-09-05T12:00:02.000Z", gpcObservationSession: session,
    scanEvidenceLaneAssessment: { status: "available", version: "scan-evidence-lane-assessment-v1", outcome: "usable",
      lanes: { homepageRuntime: "usable", consent: "not_testable", cookiesTrackers: "usable", policyGdpr: "not_testable", transport: "usable" },
      usablePolicySurfaceUrls: [], limitationKeys: [], evidenceRefs: [] },
    gpcPrototypeSessionBinding: { contractVersion: "certscore.gpc-prototype-session-binding.v1", captureId,
      documentToken, documentUrlSha256, sessionSha256: hash(JSON.stringify(session)) } });
}
