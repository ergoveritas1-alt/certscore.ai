import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer";
import { parseCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
import { gpcCookieReadOversizedFixture, gpcCookieReadWideDictionaryFixture } from "./test-fixtures/gpc-cookie-read.cases";

test("canonical writer stores lossless oversized JSON while legacy small JSON and sidecars keep their format", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "canonical-writer-"));
  try {
    const writer = await createArtifactWriter(dir);
    const file=writer.artifactPath("CanonicalEvidenceBundle.json");
    for (const fixture of [gpcCookieReadOversizedFixture,gpcCookieReadWideDictionaryFixture]) {
    const large=fixture().bundle;
    const original = JSON.stringify(large);
    await writer.writeJsonArtifact("CanonicalEvidenceBundle.json", large);
    const stored = await readFile(file);
    assert.ok(stored.length < 400 * 1024);
    assert.equal(JSON.stringify(parseCanonicalEvidenceArtifact(stored)), original);
    assert.equal(JSON.stringify(large), original);
    }
    const small = { schemaVersion: "certscore.v2.alpha.1", scanId: "legacy-small" };
    await writer.writeJsonArtifact("CanonicalEvidenceBundle.json", small);
    assert.equal(await readFile(file, "utf8"), `${JSON.stringify(small, null, 2)}\n`);
    const sidecar = await writer.writeJsonArtifact("UnchangedSidecar.json", { evidence: "x".repeat(500_000) });
    assert.equal(await readFile(sidecar, "utf8"), `${JSON.stringify({ evidence: "x".repeat(500_000) }, null, 2)}\n`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
