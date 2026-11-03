import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { LocalDiskS3Client, assertLocalParityCompleted, assertLocalParityPrerequisites, parseArgs } from "./run-local-v2-dag-lambda-parity";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { buildLocalV2DagSimulatedLambdaArgs } from "../apps/web/server/scans/local-v2-dag-lambda-simulated-dispatch";

test("local SDK response bodies retain exact original binary bytes through streams and transforms", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-local-sdk-"));
  try {
    const client = new LocalDiskS3Client(directory), bytes = Buffer.from([0, 255, 13, 10, 128, 65]);
    await client.send(new PutObjectCommand({ Bucket: "fixture", Key: "original.bin", Body: bytes }));
    const response = await client.send(new GetObjectCommand({ Bucket: "fixture", Key: "original.bin" }));
    assert.equal(response.ContentLength, bytes.length);
    assert.deepEqual(Buffer.from(await response.Body!.transformToByteArray()), bytes);
    assert.equal(await response.Body!.transformToString("base64"), bytes.toString("base64"));
    const chunks = []; for await (const chunk of response.Body as NodeJS.ReadableStream) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), bytes);
    const diskClient = new LocalDiskS3Client(directory);
    assert.deepEqual(Buffer.from(await (await diskClient.send(new GetObjectCommand({ Bucket: "fixture", Key: "original.bin" }))).Body!.transformToByteArray()), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("local scan carries the exact sale/sharing observer authorization through CLI parsing",()=>{
  const saleSharingOptOut={policyVersion:"bounded_sale_sharing_opt_out.v1" as const,enabled:true as const,scanId:"scan-opt-out",exactTargetUrl:"https://example.test/"};
  const args=buildLocalV2DagSimulatedLambdaArgs({artifactDir:"artifacts/local-v2-dag-lambda-simulated",outPath:"artifacts/local-v2-dag-lambda-simulated/summary.json",
    payload:{awsRegion:"us-west-1",profile:"standard",scanId:"scan-opt-out",targetUrl:"https://example.test/",saleSharingOptOut}});
  const cli=args.slice(args.indexOf("--")+1);
  assert.deepEqual(parseArgs(cli).saleSharingOptOut,saleSharingOptOut);
  for(const [flag,value] of [["--scan-id","other-scan"],["--target-url","https://another.test/"]] as const){
    const changed=[...cli];changed[changed.indexOf(flag)+1]=value;
    assert.throws(()=>parseArgs(changed),/must match the local scan ID and exact target/);
  }
  assert.equal(parseArgs([]).saleSharingOptOut,null);
});

test("simulated Lambda round-trips runtime graph configuration through CLI parsing", () => {
  for (const mode of ["capture_only", "project"] as const) {
    const runtimeGraph = {
      contractVersion: "certscore.runtime-graph-dispatch.v1" as const,
      scanId: "scan-graph",
      mode,
      profile: "bounded_passive_v1" as const,
    };
    const args = buildLocalV2DagSimulatedLambdaArgs({
      artifactDir: "artifacts/local-v2-dag-lambda-simulated",
      outPath: "artifacts/local-v2-dag-lambda-simulated/summary.json",
      payload: {
        awsRegion: "eu-central-1", profile: "standard", scanId: "scan-graph",
        targetUrl: "https://example.test/", runtimeGraph,
      },
    });
    const cliArgs = args.slice(args.indexOf("--") + 1);
    assert.deepEqual(parseArgs(cliArgs).runtimeGraph, runtimeGraph);
    const mismatched = [...cliArgs];
    mismatched[mismatched.indexOf("--scan-id") + 1] = "another-scan";
    assert.throws(() => parseArgs(mismatched), /must match the local scan ID/);
  }
});

test("local graph capture stays disabled when absent and rejects malformed configuration", () => {
  const args = buildLocalV2DagSimulatedLambdaArgs({
    artifactDir: "artifacts/local-v2-dag-lambda-simulated",
    outPath: "artifacts/local-v2-dag-lambda-simulated/summary.json",
    payload: {
      awsRegion: "eu-central-1", profile: "standard", scanId: "scan-graph",
      targetUrl: "https://example.test/",
    },
  });
  assert.equal(args.includes("--runtime-graph-config"), false);
  assert.equal(parseArgs(args.slice(args.indexOf("--") + 1)).runtimeGraph, null);
  for (const value of ["null", "{", "{}", JSON.stringify({
    contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: "scan-graph",
    mode: "project", profile: "bounded_passive_v1", browserLanes: 8,
  })]) {
    assert.throws(() => parseArgs(["--scan-id", "scan-graph", "--runtime-graph-config", value]));
  }
});

test("parity coordinator payload forwards the parsed graph without selecting a new rollout", async () => {
  const source = await readFile(new URL("./run-local-v2-dag-lambda-parity.ts", import.meta.url), "utf8");
  assert.match(source, /\.\.\.\(args\.runtimeGraph \? \{ runtimeGraph: args\.runtimeGraph \} : \{\}\)/);
  assert.doesNotMatch(source, /selectRuntimeGraphDispatch/);
});


test("local crawl options survive simulated dispatch without enabling discovery for a homepage-only run", () => {
  for (const discovery of [undefined, false, true]) {
    const args = buildLocalV2DagSimulatedLambdaArgs({
      artifactDir: "artifacts/test", outPath: "artifacts/test/summary.json",
      payload: { awsRegion: "eu-west-1", profile: "standard", scanId: "crawl-test",
        targetUrl: "https://example.test/", resourceInventoryCrawl: true,
        resourceInventoryDiscovery: discovery },
    });
    const parsed = parseArgs(args.slice(args.indexOf("--") + 1));
    assert.equal(parsed.resourceInventoryCrawl, true);
    assert.equal(parsed.resourceInventoryDiscovery, discovery === true);
  }
  const defaults = parseArgs([]);
  assert.equal(defaults.resourceInventoryCrawl, false);
  assert.equal(defaults.resourceInventoryDiscovery, false);
});


test("local sharded scans reject missing policy prerequisites before starting work", () => {
  for (const profile of ["tiny", "standard", "full"]) {
    assert.equal(parseArgs(["--profile", profile]).profile, profile);
    for (const key of [undefined, "", "   "]) {
      assert.throws(() => assertLocalParityPrerequisites({ OPENAI_API_KEY: key }), /No workers were started/);
    }
  }
  assert.doesNotThrow(() => assertLocalParityPrerequisites({ OPENAI_API_KEY: "fixture-only-never-sent" }));
});

test("local scan completion rejects failed, skipped and unknown terminal outcomes", () => {
  assert.doesNotThrow(() => assertLocalParityCompleted("completed"));
  for (const status of ["failed", "skipped", "unknown", ""]) {
    assert.throws(() => assertLocalParityCompleted(status), /did not complete/);
  }
});


test("CLI rejects a missing key before creating artifacts or starting a target visit", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "certscore-parity-prerequisite-"));
  try {
    const artifacts = path.join(temporary, "artifacts");
    const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: path.resolve("tsconfig.base.json") };
    delete env.OPENAI_API_KEY;
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/run-local-v2-dag-lambda-parity.ts",
      "--target-url", "https://never-contact.invalid/", "--artifact-dir", artifacts,
      "--message-stream", path.join(temporary, "messages.ndjson"), "--out", path.join(temporary, "summary.json")],
      { env, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /No workers were started/);
    assert.doesNotMatch(result.stdout, /local_lambda_parity_started/);
    for (const file of [artifacts, path.join(temporary, "messages.ndjson"), path.join(temporary, "summary.json")]) {
      await assert.rejects(access(file), { code: "ENOENT" });
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
