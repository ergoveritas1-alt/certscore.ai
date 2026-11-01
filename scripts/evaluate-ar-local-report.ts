/** Local sharded scanner -> canonical publication -> HTTP report evaluation.
 * Real scanner/publisher code; repository-provided filesystem AWS and DB I/O doubles.
 * This does not measure production AWS queues, database locks or browser rendering.
 */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {redirectPublicationHarness} from "../apps/web/server/scans/redirect-publication.fixture";
import {postAcceptLambdaDispatchConfigSchema, postRefusalLambdaDispatchConfigSchema} from "@certscore/contracts";

const arg = (key: string) => process.argv[process.argv.indexOf(key) + 1];

async function main() {
  const root = process.cwd(), baseline = path.resolve(arg("--baseline")), out = path.resolve(arg("--out"));
  await mkdir(out, {recursive: true});
  const repetitions = process.argv.includes("--repetitions") ? Number(arg("--repetitions")) : 3;
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 3);
  const publicTarget = process.argv.includes("--owned-target") ? arg("--owned-target") : undefined;
  if (publicTarget) assert.ok(["https://ergoveritas.com/testar1.html", "https://ergoveritas.com/testar2.html"].includes(publicTarget), "only existing owned canaries are supported");
  // Wire versions are validated by the dispatch contracts; registry recipe-set
  // generation versions are a different namespace and cannot be substituted.
  const config = (action: "accept" | "reject") => (action === "accept" ? postAcceptLambdaDispatchConfigSchema : postRefusalLambdaDispatchConfigSchema).parse({enabled: true, rolloutMode: "owned_canary", dispatchDelayMs: 0,
        actionSearchTimeoutMs: action === "accept" ? 14000 : 1500, confirmationTimeoutMs: action === "accept" ? 2000 : 1500,
        observationWindowMs: action === "accept" ? 3000 : 8000,
        resolver: publicTarget ? {kind: "canonical_cmp_registry", recipeSetId: action === "accept" ? "canonical-consent-control-accept-v6" : "canonical-consent-control-reject-v23"}
          : {kind: "named_cmp", cmpCanonicalName: "OneTrust", confirmation: {kind: "local_storage_equals", key: "consent", expectedValue: action === "accept" ? "granted" : "denied"}},
        interactionAuthorization: publicTarget ? {kind: "owned_canary", authorizationId: "ergoveritas_owned_post_refusal_canary.v1"}
          : {kind: "loopback", authorizationId: "loopback_local_lab"}});
  const validatedConfigs = {accept: config("accept"), reject: config("reject")};
  if (process.argv.includes("--validate-only")) {
    await writeFile(path.join(out, "validated-dispatch-configs.json"), JSON.stringify(validatedConfigs, null, 2));
    process.stdout.write("Both dispatch wire configurations validated offline; no browser or public request started.\n");
    return;
  }
  const pin = async (directory: string) => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard",
      "packages/certscore-scan-core/src", "packages/certscore-contracts/src", "packages/shared/src", "packages/certscore-vendor-resolver/src", "packages/web-bot-auth/src",
      "apps/v2-dag-lambda/src", "apps/web/server/scans", "pnpm-lock.yaml", "scripts/evaluate-ar-local-report.ts"], {cwd: directory, encoding: "utf8"}).trim().split("\n");
    return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async file => [file, createHash("sha256").update(await readFile(path.join(directory, file))).digest("hex")])));
  };
  const sourcePins = {baseline: await pin(baseline), candidate: await pin(root)};
  await writeFile(path.join(out, "source-pins.json"), JSON.stringify(sourcePins, null, 2));
  const clicks = new Map<string, number>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost:3000");
    if (url.pathname.startsWith("/clicked/")) {clicks.set(url.pathname, (clicks.get(url.pathname) ?? 0) + 1);res.end("ok");return;}
    if (url.pathname.startsWith("/report/")) {
      try {res.setHeader("content-type", "application/json");res.end(await readFile(path.join(out, `${url.pathname.split("/").pop()}.report.json`)));}
      catch {res.statusCode = 404;res.end("not ready");}return;
    }
    if (url.pathname === "/privacy") {res.setHeader("content-type", "text/html");res.end("<h1>Fixture privacy policy</h1><p>Optional local fixture consent is stored only on this machine.</p>");return;}
    if (!url.pathname.startsWith("/site/")) {res.statusCode = 404;res.end("missing fixture");return;}
    const id = url.pathname.split("/").pop();
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><html lang="en"><head><title>CertScore.ai A/R fixture</title></head><body><main><h1>Local A/R validation</h1>
      <p>This controlled page has optional analytics consent choices.</p><a href="/privacy">Privacy policy</a></main>
      <section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent"><p>Choose optional analytics cookies.</p>
      <button type="button" id="onetrust-accept-btn-handler">Accept all</button><button type="button" id="onetrust-reject-all-handler">Reject all</button></section>
      <script>for(const [action,value] of [['accept','granted'],['reject','denied']]){
        document.querySelector('#onetrust-'+(action==='accept'?'accept-btn-handler':'reject-all-handler')).onclick=()=>{
          localStorage.setItem('consent',value);fetch('/clicked/${id}/'+action);
        };
      }</script></body></html>`);
  });
  await new Promise<void>((resolve, reject) => {server.once("error", reject);server.listen(3000, "localhost", resolve);});
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const h = await redirectPublicationHarness();
  const rows: any[] = [];
  try {
    for (let repeat = 0; repeat < repetitions; repeat++) for (const arm of repeat % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const cwd = arm === "baseline" ? baseline : root, id = `ar-report-${arm}-${repeat}`, target = publicTarget ?? `http://localhost:3000/site/${id}`;
      const runStartedAtMs = Date.now();
      const artifacts = path.join(out, `${id}-artifacts`), summaryPath = path.join(out, `${id}.scanner.json`);
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", path.join(cwd, "scripts/run-local-v2-dag-lambda-parity.ts"),
          "--target-url", target, "--profile", "standard", "--no-debug-overrides", "--artifact-dir", artifacts, "--out", summaryPath,
          "--scan-id", id, "--post-accept-config", JSON.stringify(config("accept")), "--post-refusal-config", JSON.stringify(config("reject"))],
          {cwd, env: {...process.env, TSX_TSCONFIG_PATH: path.join(cwd, "tsconfig.base.json"), CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED: arm === "candidate" ? "1" : "0"}, stdio: "inherit"});
        child.once("error", reject);child.once("exit", resolve);
      });
      const row: any = {arm, repeat, id, scannerExitCode: code, sourceRoot: cwd, runtime: "local-sharded-handler", awsIo: "filesystem-doubles", databaseIo: "repository-publication-double"};
      try {
        assert.equal(code, 0);
        const summary = JSON.parse(await readFile(summaryPath, "utf8"));
        assert.equal(summary.resultStatus, "completed");
        const bundle = JSON.parse(await readFile(path.join(summary.artifactRoot, "CanonicalEvidenceBundle.json"), "utf8"));
        const message = summary.sqsMessages.find((m: any) => m.artifactPointers?.scanArtifactUri);
        assert.ok(message?.artifactMetadata, "real scanner result must supply verified artifact metadata");
        h.state.objects.clear();h.state.writes.length = 0;
        const loadObjects = async (directory: string, key = "") => {
          for (const entry of await readdir(directory, {withFileTypes: true})) {
            if (entry.name.endsWith(".metadata.json")) continue;
            const next = path.join(directory, entry.name), nextKey = key ? `${key}/${entry.name}` : entry.name;
            if (entry.isDirectory()) await loadObjects(next, nextKey);
            else h.state.objects.set(nextKey, await readFile(next));
          }
        };
        for (const bucket of await readdir(summary.fakeS3Root)) await loadObjects(path.join(summary.fakeS3Root, bucket));
        const processor = "local-certscore-v2-dag-parallel-v1";
        const hostname = new URL(target).hostname;
        const record = {scan: {id, domainHostname: hostname, status: "completed", scanType: "full", scanFromValue: "california",
          createdAt: bundle.startedAt, startedAt: bundle.startedAt, completedAt: bundle.completedAt, pagesRequested: 1, pagesScanned: 1,
          scanConfigJson: {processor, hostname, normalizedUrl: target, execution: {v2DagParallel: {localOnly: true, artifactOnly: true, profile: "standard"}, localV2Dag: {outDir: summary.artifactRoot}}}},
          signalEnrichmentWorkflow: {findingsReady: true, mergedSignalsReady: true},
          events: [{id: `${id}-result`, eventType: "v2_lambda_result.received", createdAt: bundle.completedAt, metadataJson: {...message, processor}}],
          pageEvidence: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], primaryPolicyEnrichment: null,
          runtimeArtifacts: {}, signals: [], snapshot: {}, trackerVendors: [], validationFindings: []};
        h.state.record = record;
        const publicationStarted = Date.now();
        const result = await h.pipeline.publishCanonicalScanReportProjection({organizationId: null, scanId: id, publicationTrigger: "authorized_worker"});
        assert.equal(result.status, "ready");
        const p = h.state.writes.findLast((write: any) => write.sql.includes("insert into public.scan_snapshots")).params;
        const saved = h.pipeline.readPersistedScanReportProjection({scan: record.scan, snapshot: {report_projection_status: "ready", report_projection_version: p[28],
          report_projection_computed_at: bundle.completedAt, report_projection_payload: JSON.parse(p[37]), report_projection_payload_sha256: p[38], report_projection_payload_size_bytes: p[39]}});
        assert.ok(saved);
        const api = h.pipeline.buildApiV2ScanResource(saved), report = h.pipeline.buildCanonicalReportExport(saved);
        assert.ok(api.postAcceptObservation && api.postRefusalObservation, "both action paths must survive canonical report projection");
        await writeFile(path.join(out, `${id}.report.json`), JSON.stringify({api, report}, null, 2));
        assert.equal((await fetch(`http://localhost:3000/report/${id}`)).status, 200);
        Object.assign(row, {targetKind: publicTarget ? "existing-owned-canary" : "loopback-fixture", scannerMs: summary.elapsedMs, publicationAndHttpMs: Date.now() - publicationStarted,
          fullLocalReportWallMs: Date.now() - runStartedAtMs, localReportReadyMs: summary.elapsedMs + Date.now() - publicationStarted,
          result: "ready", postAccept: summary.postAccept, postRefusal: summary.postRefusal,
          ...(publicTarget ? {actualClickCounters: "unavailable-on-public-target"} : {
            intendedAcceptClicks: clicks.get(`/clicked/${id}/accept`) ?? 0, intendedRejectClicks: clicks.get(`/clicked/${id}/reject`) ?? 0})});
      } catch (error) {row.result = "failed";row.error = String(error);}
      rows.push(row);await writeFile(path.join(out, "report-runs.json"), JSON.stringify(rows, null, 2));process.stdout.write(`${JSON.stringify(row)}\n`);
      assert.deepEqual({baseline: await pin(baseline), candidate: await pin(root)}, sourcePins, "source drift during scan/report evaluation");
      if (row.result === "failed") throw new Error("Stop after a failed scan/report; retain the attempt without automatic retry.");
    }
    await writeFile(path.join(out, "source-pins-verified.json"), JSON.stringify({verified: true, rows: rows.length, publisherSourceRoot: root, productionDatabaseAndQueueMeasured: false}, null, 2));
  } finally {
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    await h.close();await new Promise<void>(resolve => server.close(()=>resolve()));
  }
}
void main().catch(error => {console.error(error);process.exitCode = 1;});
