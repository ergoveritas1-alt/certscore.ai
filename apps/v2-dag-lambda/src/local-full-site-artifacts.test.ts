import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { FULL_SITE_ARTIFACT_LIMITS } from "@website-signal-risk-scanner/shared";
import { createLocalInventoryArtifacts } from "./local-full-site-artifacts";

test("local bridge retains a capture above the old 2 MB limit without changing evidence bytes", async () => {
  const sink = createLocalInventoryArtifacts("scan/page/attempt");
  const evidence = JSON.stringify({ retained: "é".repeat(1100000) });
  const sha256 = (body: string) => createHash("sha256").update(body).digest("hex");
  const inventory = JSON.stringify({ sourceHash: sha256(evidence), status: "partial" });
  await Promise.all([
    sink.send({ input: { Key: "scan/page/attempt/evidence.json", Body: evidence } }),
    sink.send({ input: { Key: "scan/page/attempt/inventory.json", Body: inventory } }),
  ]);
  const transported = JSON.parse(JSON.stringify(sink.artifacts)) as typeof sink.artifacts;
  assert.equal(transported.length, 2);
  const retained = transported.find(a => a.key.endsWith("/evidence.json"))!;
  assert.ok(Buffer.byteLength(retained.body) > 2 * 1024 * 1024);
  assert.equal(retained.body, evidence);
  assert.equal(JSON.parse(inventory).sourceHash, sha256(retained.body));
});

test("local artifact bounds remain per-file, byte-based, and attempt-bound", async () => {
  const sink = createLocalInventoryArtifacts("scan/page/attempt");
  const key = "scan/page/attempt/inventory.json";
  await assert.rejects(sink.send({ input: { Key: key, Body: "é".repeat(FULL_SITE_ARTIFACT_LIMITS.inventory / 2 + 1) } }), /canonical bounds/);
  await assert.rejects(sink.send({ input: { Key: "scan/other/attempt/evidence.json", Body: "{}" } }), /Unexpected/);
  await assert.rejects(sink.send({ input: { Key: key, Body: {} } }), /canonical bounds/);
  await sink.send({ input: { Key: key, Body: "{}" } });
  await assert.rejects(sink.send({ input: { Key: key, Body: "{}" } }), /duplicate/);
  assert.equal(sink.artifacts.length, 1);
});
