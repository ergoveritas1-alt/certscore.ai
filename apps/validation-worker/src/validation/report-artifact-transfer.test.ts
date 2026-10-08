import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";

// Exercise the real artifact-verification -> publication boundary with a
// controlled DB and endpoint, rather than invoking any production service.
test("worker transfers verified ingestion bytes once and preserves existing publication/finalization retries", async () => {
  const directory = await mkdtemp(path.resolve(__dirname, "../../../../tmp/worker-transfer-"));
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "worker.cjs");
  try {
    await writeFile(fixture, `
      const state={completed:false};module.exports={state,query:async()=>[],
      queryOne:async sql=>sql.includes('report_inputs_ready')?{report_inputs_ready:true}:{status:state.completed?'completed':'pending'},
      withNonBlockingDatabaseLock:async(key,run)=>({acquired:true,value:await run()})};
    `);
    const workerRequire = createRequire(path.resolve(__dirname, "../../package.json"));
    await build({ entryPoints: [path.join(__dirname, "local-v2-dag-lambda-results.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "worker-transfer", setup(builder) {
        builder.onResolve({ filter: /^@website-signal-risk-scanner\/db$/ }, () => ({ path: fixture, external: true }));
        builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({
          path: workerRequire.resolve(args.path), external: true,
        }));
      } }] });
    const require = createRequire(output);
    const { state } = require(fixture);
    const { verifyProductionArtifactChain, ensureCompletedScanScoresPersisted } = require(output);
    const scanId = "12345678-1234-1234-1234-123456789012";
    const bundle = Buffer.from(JSON.stringify({ scanId, schemaVersion: "certscore.v2.canonical-evidence-bundle.v1" }));
    const manifest = Buffer.from(JSON.stringify({ scanId, processor: "local-certscore-v2-dag-parallel-v1", targetEnvironment: "production" }));
    const metadata = (body: Buffer) => ({ sha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength });
    const message = { scanId, status: "completed", targetEnvironment: "production",
      artifactPointers: { manifestUri: "s3://artifacts/manifest", scanArtifactUri: "s3://artifacts/bundle" },
      artifactMetadata: { manifestUri: metadata(manifest), scanArtifactUri: metadata(bundle) } };
    await verifyProductionArtifactChain(message, { send: async (command: { input: { Key: string } }) => ({
      Body: command.input.Key === "bundle" ? bundle : manifest,
    }) });
    const requests: Array<{ mode: string; artifactTransfer?: unknown; token: string }> = [];
    const result = await ensureCompletedScanScoresPersisted({ scanId, targetEnvironment: "production",
      fetchImpl: async (_url: unknown, options: { body: string }) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (requests.length === 1) return Response.json({ code: "materialization_not_ready", retryable: true }, { status: 503 });
        if (body.mode === "finalize") { state.completed = true; return Response.json({ complete: true }); }
        return Response.json({ reportReady: true });
      },
    });
    assert.deepEqual(result, { alreadyPersisted: false, terminalFailure: false });
    assert.deepEqual(requests.map(row => row.mode), ["publish_report", "publish_report", "finalize"]);
    assert.ok(requests[0]?.artifactTransfer);
    assert.equal(requests[1]?.artifactTransfer, undefined);
    assert.equal(requests[2]?.artifactTransfer, undefined);
    assert.equal(requests[0]?.token, requests[1]?.token, "existing authenticated retry remains unchanged");
    state.completed = false;
    const recovered: Array<Record<string, unknown>> = [];
    await ensureCompletedScanScoresPersisted({ scanId, targetEnvironment: "production",
      fetchImpl: async (_url: unknown, options: { body: string }) => {
        const body = JSON.parse(options.body); recovered.push(body);
        if (body.mode === "finalize") state.completed = true;
        return Response.json({ reportReady: true, complete: true });
      },
    });
    assert.ok(recovered.every(row => row.artifactTransfer === undefined), "recovery must not require in-memory bytes");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
