import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runScan } from "./index";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { assessGpcObservationCompletion } from "./gpc-observation-completion";
import { retainedGpcObservationSessionSchema, type GpcObservationSession } from "@certscore/contracts";
const source = (bytes: Uint8Array) => ({ bytes, pointer: { uri: "local-fixture.json", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } });

test("fresh browser → retained bytes → completion includes empty, late GPP and SPA observations, without legal conclusions", async t => {
  for (const scenario of ["absent", "late_usnat", "spa", "long_request", "unready", "flat_usnat", "flat_usca", "ack_truncated", "csp"]) await t.test(scenario, async () => {
    let blockedReceipts = 0;
    const server = createServer((req, res) => {
      if (req.url === "/blocked") blockedReceipts++;
      if (scenario === "csp") res.setHeader("Content-Security-Policy", "script-src 'unsafe-inline'");
      if (req.url === "/hanging") return;
      if (req.url === "/resource") { res.end("observed"); return; }
      res.setHeader("Content-Type", "text/html");
      const api = `let cb; let ready = false;
        const state = () => ({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:ready?'ready':'not ready',applicableSections:[7],sectionList:[7],
          parsedSections:{usnat:[{Version:2,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:1,SharingOptOut:1},{SubsectionType:1,Gpc:true}]}});
        window.__gpp=(command,fn) => { if(command==='ping')fn(state(),true); else if(command==='addEventListener'){cb=fn;fn({eventName:'listenerRegistered',listenerId:1,data:true,pingData:state()},true);} else if(command!=='removeEventListener')throw Error('Unexpected command'); };
        setTimeout(()=>{ready=${scenario !== "unready"};cb?.({eventName:'signalStatus',listenerId:1,data:ready?'ready':'not ready',pingData:state()},true);fetch('/resource');},100);`;
      res.end(`<!doctype html><html><head><title>Public product information</title></head><body><h1>Product information</h1><p>${"Public information about products and services. ".repeat(30)}</p><script>
        ${["late_usnat", "unready"].includes(scenario) ? api : ""}
        ${["flat_usnat", "flat_usca"].includes(scenario) ? "window.__gpp=(command,fn)=>{if(command==='ping')fn({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[7],sectionList:[7],parsedSections:{usnat:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:1,SharingOptOut:2,Gpc:true,GpcSegmentType:1}}},true)};".replaceAll("[7]", scenario === "flat_usca" ? "[8]" : "[7]").replace("usnat:", scenario === "flat_usca" ? "usca:" : "usnat:") : ""}
        ${scenario === "csp" ? "setTimeout(() => { const s = document.createElement('script'); s.src='/blocked'; document.body.append(s); }, 50);" : ""}
        ${scenario === "spa" ? "history.replaceState(null,'','/current?route=public');" : ""}
        ${scenario === "long_request" ? "fetch('/hanging');" : ""}
      </script>${scenario === "ack_truncated" ? '<div id="onetrust-banner-sdk">' + '<div role="status">Public unrelated status</div>'.repeat(40) + '</div>' : ""}</body></html>`);
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const outDir = await mkdtemp(path.join(tmpdir(), "gpc-completion-"));
    try {
      const address = server.address() as { port: number };
      let session: GpcObservationSession | undefined;
      const bundle = await runScan({ scanId: `completion-${scenario}`, url: `http://127.0.0.1:${address.port}/`, outDir,
        retainGpcObservation: true, evidenceLane: "gpc_observation", profile: "standard", preConsentScreenshotMode: "never",
        onGpcObservationSession: value => { session = value; } });
      assert.ok(session, "sidecar finalized before browser teardown");
      const b = source(await readFile(path.join(outDir, "CanonicalEvidenceBundle.json")));
      const packet = retainedGpcObservationSessionSchema.parse({ contractVersion: "certscore.retained-gpc-observation-session.v1", gpcArtifactSha256: b.pointer.sha256, session });
      const raw = Buffer.from(JSON.stringify(packet));
      const result = assessGpcObservationCompletion({ scanId: bundle.scanId, bundle: b, session: source(raw) });
      assert.equal(result.completed, scenario !== "unready", JSON.stringify(result));
      const production = buildGpcProductionObservation({ scanId: bundle.scanId, source: b });
      assert.equal(production.status, scenario === "unready" ? "limited" : "complete", JSON.stringify(production));
      assert.equal(production.registration.causedByGpc, "not_established");
      assert.equal(production.scoreEffect, "none");
      assert.equal(production.sourceSha256, b.pointer.sha256);
      if (scenario === "csp") {
        assert.equal(blockedReceipts, 0, "blocked request never reaches the local server");
        assert.ok(session.requests.some(r => r.preTransmissionBlock?.reason === "csp"), JSON.stringify(session));
        assert.equal(production.requests.blockedBeforeTransmissionCount, 1);
        assert.equal(session.requests.find(r => r.preTransmissionBlock)?.secGpc, null);
      }
      for (const defect of ["checksum", "session_hash", "loader", "missing_producer_binding", "missing_access", "blocked_access", "old_version_block"]) {
        const altered = JSON.parse(Buffer.from(b.bytes).toString());
        if (defect === "missing_access") delete altered.scanEvidenceLaneAssessment;
        if (defect === "blocked_access") altered.scanEvidenceLaneAssessment.outcome = "no_go";
        if (defect === "session_hash") altered.gpcPrototypeSessionBinding.sessionSha256 = "0".repeat(64);
        if (defect === "loader") altered.gpcObservationSession.mainDocument.documentToken = "other";
        if (defect === "missing_producer_binding") {
          altered.gpcSignalObservation.prototypeSessionSha256 = altered.gpcPrototypeSessionBinding.sessionSha256;
          altered.gpcSignalObservation.prototypeCaptureBinding = altered.gpcObservationSession.semanticObservation.captureBinding;
          delete altered.gpcPrototypeSessionBinding;
        }
        if (defect === "old_version_block" && scenario === "csp") altered.gpcObservationSession.contractVersion = "certscore.gpc-observation-session.v1";
        const rawSource = source(Buffer.from(JSON.stringify(altered)));
        if (defect === "checksum") rawSource.pointer.sha256 = "0".repeat(64);
        if (defect !== "old_version_block" || scenario === "csp") assert.notEqual(buildGpcProductionObservation({ scanId: bundle.scanId, source: rawSource }).status, "complete");
      }
      assert.equal(result.productionProjectable, false); assert.equal(result.causedByGpc, "not_established");
      if (scenario === "late_usnat") { assert.equal(result.terminalStateKnown, true); assert.ok(session.listener.callbacks >= 2); assert.ok(session.semanticObservation?.stateTransitions?.some(row => row.status === "observed")); }
      if (scenario === "flat_usca") { assert.equal(result.terminalStateKnown, true); assert.equal(session.semanticObservation?.gppDiagnostics?.reason, "ready_usca_flat_object"); }
      if (scenario === "flat_usnat") { assert.equal(result.terminalStateKnown, true); assert.equal(session.semanticObservation?.gppDiagnostics?.reason, "ready_usnat_flat_object"); }
      if (scenario === "ack_truncated") { assert.equal(result.acknowledgmentCaptureComplete, false); assert.equal(result.acknowledgmentObserved, false); }
      if (scenario === "spa") assert.notEqual(session.mainDocument?.requestUrlSha256, session.mainDocument?.documentUrlSha256);
      if (scenario === "absent") assert.equal(result.terminalStateKnown, false);
      for (const defect of ["checksum", "wrong_bundle", "wrong_loader", "drops", "interval", "navigator", "aborted", "history_hash", "history_time", "limitations", "invented_request", "altered_url", "altered_time", "altered_header"]) {
        const changed = structuredClone(packet);
        if (defect === "limitations") changed.session.limitationKeys.push("document_capture_overflow");
        if (defect === "invented_request") changed.session.requests[0]!.eventId = "invented";
        if (defect === "altered_url") changed.session.requests[0]!.urlSha256 = "0".repeat(64);
        if (defect === "altered_time") changed.session.requests[0]!.timestampMs++;
        if (defect === "altered_header") changed.session.requests[0]!.secGpc = "0";
        if (defect === "wrong_bundle") changed.gpcArtifactSha256 = "0".repeat(64);
        if (defect === "wrong_loader") changed.session.mainDocument!.documentToken = "different";
        if (defect === "drops") changed.session.requestsDropped++;
        if (defect === "interval") changed.session.captureEndedAtMs = changed.session.captureStartedAtMs;
        if (defect === "navigator") changed.session.semanticObservation!.navigatorGpc = false;
        if (defect === "history_hash") changed.session.semanticObservation!.stateTransitions = [{ observedAtMs: 0, status: "observed", state: { apiVersion: "1.1", sectionId: 8, sectionVersion: 1, cmpStatus: "loaded", signalStatus: "ready", saleNotice: 1, sharingNotice: 1, saleOptOut: 1, sharingOptOut: 1, gpc: true }, stateSha256: "0".repeat(64) }];
        if (defect === "history_time") changed.session.semanticObservation!.stateTransitions = [{ observedAtMs: changed.session.captureEndedAtMs + 1000, status: "not_ready", state: null, stateSha256: null }];
        if (defect === "aborted") changed.session.terminal = "aborted";
        const tampered = source(Buffer.from(JSON.stringify(changed)));
        if (defect === "checksum") tampered.pointer.sha256 = "0".repeat(64);
        assert.equal(assessGpcObservationCompletion({ scanId: bundle.scanId, bundle: b, session: tampered }).completed, false, defect);
      }
      // Main-document completion retains its own producer binding when an
      // unrelated frame prevents the legacy full-context snapshot from returning.
      const noFullFrame = JSON.parse(Buffer.from(b.bytes).toString());
      delete noFullFrame.gpcSignalObservation;
      const separateBundle = source(Buffer.from(JSON.stringify(noFullFrame)));
      const separatePacket = { ...packet, gpcArtifactSha256: separateBundle.pointer.sha256 };
      const separate = assessGpcObservationCompletion({ scanId: bundle.scanId, bundle: separateBundle, session: source(Buffer.from(JSON.stringify(separatePacket))) });
      assert.equal(separate.completed, scenario !== "unready");
      assert.equal(separate.delivery.fullContextVerified, false);
      assert.equal(separate.requestCapture.fromMs, session.captureStartedAtMs);
      noFullFrame.gpcPrototypeSessionBinding.captureId = "00000000-0000-4000-8000-000000000000";
      const wrongBinding = source(Buffer.from(JSON.stringify(noFullFrame)));
      assert.equal(assessGpcObservationCompletion({ scanId: bundle.scanId, bundle: wrongBinding, session: source(Buffer.from(JSON.stringify({ ...packet, gpcArtifactSha256: wrongBinding.pointer.sha256 }))) }).completed, false);
      assert.ok(bundle.gpcObservationSession, "production retains the producer-bound session inside its existing artifact");
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(outDir, { recursive: true, force: true }); }
  });
});
