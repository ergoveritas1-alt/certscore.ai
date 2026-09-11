import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runScan } from "../packages/certscore-scan-core/src/index";
import { retainLocalGpcCanonicalSource } from "./run-gpc-observation-local";
import { evaluateGpcObservationCompletionGate, type GpcObservationCompletionRow } from "./lib/gpc-observation-completion-gate";

test("no-session blocked browser outcome retains original canonical proof and cannot be rewritten by a later audit", async () => {
  const server = createServer((_req, res) => { res.writeHead(403, {"Content-Type": "text/html"}); res.end('<html><title>Access denied</title><body>Access denied. You do not have permission to access this website.</body></html>'); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const outDir = await mkdtemp(path.join(tmpdir(), "gpc-blocked-retention-"));
  try {
    const address = server.address() as {port: number};
    await runScan({scanId: "blocked-retention", url: `http://127.0.0.1:${address.port}/`, outDir,
      evidenceLane: "gpc_observation", profile: "standard", preConsentScreenshotMode: "never"});
    await assert.rejects(retainLocalGpcCanonicalSource(outDir, "wrong-scan"), /identity mismatch/);
    const {bundle, source} = await retainLocalGpcCanonicalSource(outDir, "blocked-retention");
    assert.equal(bundle.scanNoGoAssessment?.decision, "no_go");
    const pointerBytes = await readFile(path.join(outDir, "CanonicalEvidenceBundle.pointer.json"));
    const pointer = JSON.parse(pointerBytes.toString());
    assert.equal(pointer.sha256, createHash("sha256").update(source.bytes).digest("hex"));
    assert.equal(pointer.sizeBytes, source.bytes.length);
    const row: GpcObservationCompletionRow = {scanId: bundle.scanId, observationScope: "main_document_and_retained_http_requests",
      manifestEligible: true, representativeAccess: "non_representative", cohortSourceVerified: true, canary: false,
      retainedArtifactVerified: true, mainDocumentBindingVerified: false,
      delivery: {httpHeaderRetained: false, mainNavigatorReadbackRetained: false, fullContextVerified: false},
      semanticProbe: {terminalStatus: "incomplete", started: false, ended: false},
      requestCapture: {started: false, ended: false, noDrops: false}, observedFactsDirect: false};
    const gate = evaluateGpcObservationCompletionGate([row]);
    assert.equal(gate.excludedNonRepresentativeCount, 1); assert.equal(gate.allAttemptCompletedCount, 0);
    assert.equal(evaluateGpcObservationCompletionGate([{...row,retainedArtifactVerified:false}]).representativeDenominator, 1);
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), Buffer.concat([Buffer.from(source.bytes), Buffer.from("\n")]));
    await assert.rejects(retainLocalGpcCanonicalSource(outDir, "blocked-retention"), /EEXIST/);
    assert.deepEqual(await readFile(path.join(outDir, "CanonicalEvidenceBundle.pointer.json")), pointerBytes);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(outDir, {recursive:true,force:true}); }
});
