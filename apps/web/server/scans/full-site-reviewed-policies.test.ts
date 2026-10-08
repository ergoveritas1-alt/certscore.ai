import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

test("report policies use the loaded projection, bounded parallel reads and exact verified provenance", async () => {
  const directory = await mkdtemp(path.resolve("tmp/report-policies-"));
  const output = path.join(directory, "loader.cjs");
  const state = { reads: 0, active: 0, peak: 0, mismatch: false };
  const globalFixture = globalThis as typeof globalThis & { policyLoaderFixture?: typeof state };
  globalFixture.policyLoaderFixture = state;
  try {
    await build({ entryPoints: [path.resolve("apps/web/server/scans/full-site-reviewed-policies.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", tsconfig: path.resolve("tsconfig.base.json"), packages: "external",
      plugins: [{ name: "policy-reader-fixture", setup(builder) {
        const fixtures: Record<string, string> = {
          "server-only": "",
          "@website-signal-risk-scanner/db": "export function query(){throw new Error('The already loaded report must not be queried again');}",
          "./local-v2-dag-report": `export async function readProjectedPolicyTextArtifact(pointer) {
            const state=globalThis.policyLoaderFixture; state.reads++;state.active++;state.peak=Math.max(state.peak,state.active);
            await new Promise(resolve=>setImmediate(resolve));state.active--;
            if(state.mismatch) return {text:'wrong text'};
            return {text:pointer.uri.split('/').pop().replace('.txt','')};
          }`,
        };
        builder.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path]!, loader: "js" }));
      } }] });
    const require = createRequire(import.meta.url);
    const { loadReviewedPoliciesFromProjection } = require(output);
    const projection = {
      contractVersion: "certscore.policy-text-evidence-projection.v1", generatedAt: "2026-10-08T12:00:00.000Z", scanId: "scan",
      sourceBundle: { schemaVersion: "v1", uri: "s3://bucket/scan/CanonicalEvidenceBundle.json", sha256: "a".repeat(64), sizeBytes: 42, verificationStatus: "verified" },
      projectionStatus: "verified_complete", limitationKeys: [],
      documents: Array.from({ length: 6 }, (_, index) => {
        const text = `policy${index}`;
        return { observationId: text, artifactId: text, artifactFileName: `${text}.txt`,
          artifactUri: `s3://bucket/scan/auxiliary/${text}.txt`, artifactSha256: "b".repeat(64), artifactSizeBytes: text.length,
          artifactVerificationStatus: "verified", requestedUrl: `https://example.test/${text}`, documentFormat: "text",
          documentFetchState: "fetched", documentEvaluationState: "usable", documentRole: "policy_document", targetRelationship: "target_controller",
          retainedTextChars: text.length, retainedTextSha256: createHash("sha256").update(text).digest("hex"), extractionStatus: "complete",
          documentTextCoverage: { status: "complete", sourceTextChars: text.length, retainedTextChars: text.length, limitationKeys: [] }, limitationKeys: [] };
      }),
    };
    const record = { scan: { id: "scan" }, runtimeArtifacts: { policy_disclosure_summary: { policyTextEvidenceProjection: projection } } };
    const documents = await loadReviewedPoliciesFromProjection(record);
    assert.deepEqual(documents.map((doc: { text: string }) => doc.text), projection.documents.map(doc => doc.observationId));
    assert.equal(state.peak, 4);
    assert.equal(state.reads, 6);
    await loadReviewedPoliciesFromProjection(record);
    assert.equal(state.reads, 6);
    assert.deepEqual(await loadReviewedPoliciesFromProjection({ ...record, scan: { id: "other-scan" } }), []);
    const changed = structuredClone(record);
    changed.runtimeArtifacts.policy_disclosure_summary.policyTextEvidenceProjection.documents[0]!.artifactUri = "s3://bucket/other-scan/policy0.txt";
    let incomplete = 0;
    const partial = await loadReviewedPoliciesFromProjection(changed, () => incomplete++);
    assert.equal(partial.length, 5);
    assert.ok(partial.every((doc: { complete: boolean }) => !doc.complete));
    assert.equal(incomplete, 1);
    const unverified = structuredClone(record);
    unverified.runtimeArtifacts.policy_disclosure_summary.policyTextEvidenceProjection.sourceBundle.verificationStatus = "unavailable";
    assert.deepEqual(await loadReviewedPoliciesFromProjection(unverified), []);
    state.mismatch = true;
    const different = structuredClone(record);
    different.runtimeArtifacts.policy_disclosure_summary.policyTextEvidenceProjection.generatedAt = "2026-10-08T12:01:00.000Z";
    assert.deepEqual(await loadReviewedPoliciesFromProjection(different), []);
    state.mismatch = false;
    assert.equal((await loadReviewedPoliciesFromProjection(different)).length, 6, "transient verification failures must be retryable");
  } finally { delete globalFixture.policyLoaderFixture; await rm(directory, { recursive: true, force: true }); }
});
