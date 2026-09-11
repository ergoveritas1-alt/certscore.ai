import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromiumProxyOptions } from "../packages/certscore-scan-core/src/playwright-runtime";
import { runScan } from "../packages/certscore-scan-core/src/index";
import { canonicalEvidenceBundleSchema, retainedGpcObservationSessionSchema, type GpcObservationSession } from "@certscore/contracts";
import { assessGpcObservationCompletion } from "../packages/certscore-scan-core/src/gpc-observation-completion";
import { evaluateGpcObservationCompletionGate, type GpcObservationCompletionRow } from "./lib/gpc-observation-completion-gate";
import { publicTestContactHoldForUrl } from "../packages/certscore-scan-core/src/public-test-contact-holds";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function localGpcSource(bytes: Uint8Array, uri: string) { return { bytes, pointer: { uri, sha256: digest(bytes), sizeBytes: bytes.length } }; }

/** Retain access evidence before optional session handling, including no-go and
 * unknown outcomes. Validate actual disk bytes rather than an in-memory result. */
export async function retainLocalGpcCanonicalSource(outDir: string, scanId: string) {
  const bytes = await readFile(path.join(outDir, "CanonicalEvidenceBundle.json"));
  const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(bytes.toString()));
  if (bundle.scanId !== scanId) throw Error("Canonical artifact scan identity mismatch");
  const source = localGpcSource(bytes, path.join(outDir, "CanonicalEvidenceBundle.json"));
  await writeFile(path.join(outDir, "CanonicalEvidenceBundle.pointer.json"), JSON.stringify(source.pointer, null, 2), { flag: "wx" });
  return { bundle, source };
}

/** Local artifact-only runner. Selection and verified egress are mandatory for
 * public targets; no retry or target replacement after seeing an outcome. */
export async function runLocalGpcCalibration(input: {
  selectionPath: string; egressPath: string; out: string; runKey: string;
}) {
  const selectionBytes = await readFile(input.selectionPath), egressBytes = await readFile(input.egressPath);
  const selection = JSON.parse(selectionBytes.toString()), egress = JSON.parse(egressBytes.toString());
  if (!Array.isArray(selection.selected) || !selection.selected.length || !selection.rotationKey || !selection.generatedAt) throw Error("Canonical target selection required");
  if (Date.now() - Date.parse(selection.generatedAt) > 3_600_000 || !Number.isFinite(Date.parse(selection.generatedAt))) throw Error("Stale target selection");
  if (egress.country !== "US" || egress.region !== "California" || !egress.ip || !egress.verifiedAt ||
    !egress.proxyServer || egress.proxyServer !== chromiumProxyOptions()?.server ||
    Date.now() - Date.parse(egress.verifiedAt) > 3_600_000 || !Number.isFinite(Date.parse(egress.verifiedAt))) throw Error("Fresh verified California egress matching the active proxy is required");
  const urls = selection.selected.map((t: { url: string }) => new URL(t.url));
  if (new Set(urls.map((u: URL) => u.hostname)).size !== urls.length || urls.some((u: URL) => u.protocol !== "https:" || /ergoverit/i.test(u.hostname) || publicTestContactHoldForUrl(u.href))) throw Error("Public calibration requires unique HTTPS non-canary, non-held targets");
  if (!/^[a-z0-9_-]{1,60}$/i.test(input.runKey)) throw Error("Bounded run key required");
  await mkdir(path.dirname(input.out), { recursive: true }); await mkdir(input.out);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const implementationFiles = ["scripts/run-gpc-observation-local.ts", "scripts/lib/gpc-observation-completion-gate.ts",
    "packages/certscore-scan-core/src/gpc-observation-completion.ts", "packages/certscore-scan-core/src/gpc-observation-session.ts",
    "packages/certscore-scan-core/src/gpc-request-diagnostics.ts",
    "packages/certscore-scan-core/src/gpc-semantic-monitor.ts", "packages/certscore-scan-core/src/gpc-gpp-parser.ts",
    "packages/certscore-scan-core/src/gpc-opt-out-capture.ts", "packages/certscore-scan-core/src/index.ts",
    "packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.ts", "packages/certscore-contracts/src/gpc-opt-out-prototype.ts",
    "packages/certscore-contracts/src/gpc-observation-session.ts", "packages/certscore-contracts/src/gpc-observation.ts", "packages/certscore-contracts/src/index.ts"];
  const implementationHashes = Object.fromEntries(await Promise.all(implementationFiles.map(async file => [file, digest(await readFile(path.join(root, file)))])));
  const manifest = { implementationHashes, contractVersion: "certscore.gpc-completion-calibration.v1", runKey: input.runKey,
    frozenAt: new Date().toISOString(), selectionSha256: digest(selectionBytes), egressSha256: digest(egressBytes),
    sourceRevision: process.env.GPC_CALIBRATION_SOURCE_REVISION ?? "working_tree", urls: urls.map((u: URL) => u.href),
    target: 0.95, observationScope: "main_document_and_retained_http_requests", noDeployment: true };
  await writeFile(path.join(input.out, "Manifest.json"), JSON.stringify(manifest, null, 2));
  const rows: GpcObservationCompletionRow[] = [], results: any[] = [];
  for (const [index, url] of urls.entries()) {
    const scanId = `${input.runKey}-${index + 1}`, startedAt = new Date().toISOString();
    const outDir = path.join(input.out, scanId);
    let session: GpcObservationSession | undefined;
    let assessment = assessGpcObservationCompletion({ scanId });
    let access: GpcObservationCompletionRow["representativeAccess"] = "unknown";
    let canonicalVerified = false;
    let status = "failed", error: string | undefined;
    try {
      await runScan({ scanId, url: url.href, profile: "standard", region: "us-west-1", outDir,
        evidenceLane: "gpc_observation", preConsentScreenshotMode: "never",
        onGpcObservationSession: packet => { session = packet; } });
      const { bundle, source } = await retainLocalGpcCanonicalSource(outDir, scanId);
      canonicalVerified = true;
      if (session) {
        const envelope = retainedGpcObservationSessionSchema.parse({ contractVersion: "certscore.retained-gpc-observation-session.v1", gpcArtifactSha256: source.pointer.sha256, session });
        const sidecarBytes = Buffer.from(JSON.stringify(envelope, null, 2) + "\n");
        const retained = localGpcSource(sidecarBytes, path.join(outDir, "GpcObservationSession.json"));
        await writeFile(retained.pointer.uri, sidecarBytes);
        await writeFile(path.join(outDir, "GpcObservationSession.pointer.json"), JSON.stringify(retained.pointer, null, 2));
        assessment = assessGpcObservationCompletion({ scanId, bundle: source, session: retained });
      }
      // Access is assessed by the existing canonical pipeline independently of
      // the new GPC completion result. Unknown remains in the audit denominator.
      access = bundle.scanNoGoAssessment?.decision === "no_go" || bundle.scanEvidenceLaneAssessment?.outcome === "no_go" ? "non_representative" :
        bundle.scanEvidenceLaneAssessment?.lanes.homepageRuntime === "usable" ? "representative" : "unknown";
      status = "completed";
    } catch (e) { error = e instanceof Error ? e.message.slice(0, 200) : "capture_failed"; }
    const row: GpcObservationCompletionRow = { scanId, observationScope: "main_document_and_retained_http_requests", manifestEligible: true,
      representativeAccess: access, cohortSourceVerified: true, canary: false,
      retainedArtifactVerified: canonicalVerified, mainDocumentBindingVerified: assessment.documentBound,
      delivery: assessment.delivery, semanticProbe: { ...assessment.semanticProbe, ended: assessment.semanticProbe.complete, terminalStatus: assessment.semanticProbe.terminalStatus === "invalid" ? "incomplete" : assessment.semanticProbe.terminalStatus as GpcObservationCompletionRow["semanticProbe"]["terminalStatus"] },
      requestCapture: { ...assessment.requestCapture, ended: assessment.requestCapture.complete }, observedFactsDirect: assessment.sourceVerified };
    rows.push(row);
    results.push({ scanId, url: selection.selected[index].url, status, startedAt, completedAt: new Date().toISOString(), scannerRuntimeStarted: true, representativeAccess: access,
      runtime: { noGoCandidate: access === "non_representative", noGoReasons: access === "non_representative" ? ["canonical_no_go"] : [] }, error, assessment });
    await writeFile(path.join(input.out, "Results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    await writeFile(path.join(input.out, "CompletionRows.json"), JSON.stringify(rows, null, 2));
    await writeFile(path.join(input.out, "CompletionGate.json"), JSON.stringify(evaluateGpcObservationCompletionGate(rows), null, 2));
    console.log(JSON.stringify({ scanId, domain: url.hostname, access, completed: assessment.completed, limits: assessment.limitations }));
  }
  return evaluateGpcObservationCompletionGate(rows);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!["--selection", "--egress", "--out", "--run-key"].includes(process.argv[i]!) || !process.argv[i + 1]) throw Error("Use --selection FILE --egress FILE --out NEW_DIRECTORY --run-key KEY");
    args.set(process.argv[i]!, process.argv[i + 1]!);
  }
  if (args.size !== 4) throw Error("Explicit selection, egress, output and run key required");
  void runLocalGpcCalibration({ selectionPath: args.get("--selection")!, egressPath: args.get("--egress")!, out: args.get("--out")!, runKey: args.get("--run-key")! }).catch(error => { console.error(error); process.exitCode = 1; });
}
