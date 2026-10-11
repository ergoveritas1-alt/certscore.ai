import assert from "node:assert/strict";
import test from "node:test";
import { consentVisualFixture } from "../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison";
import { measureConsentControlVisualComparison } from "../../../../packages/certscore-scan-core/src/consent-control-visual-comparison";
import { withVerifiedConsentVisualSource } from "./consent-visual-provenance";

test("visual measurement requires the exact image and geometry hashes in the verified manifest", async () => {
  const fixture = await consentVisualFixture();
  const visual = (await measureConsentControlVisualComparison(fixture))!;
  const geometry = { ...fixture.geometry, visualComparison: visual };
  const sha = "a".repeat(64);
  const manifest = { auxiliaryArtifacts: [
    { fileName: "ConsentControlGeometryEvidence.json", uri: "s3://test/geometry", sha256: sha, sizeBytes: 5000 },
    { fileName: "proof.png", uri: "s3://test/proof", sha256: visual.screenshotSha256, sizeBytes: fixture.screenshotBytes.length },
  ] };
  assert.equal(withVerifiedConsentVisualSource(geometry, manifest, sha), geometry);
  for (const mutation of [null, { auxiliaryArtifacts: [] },
    { auxiliaryArtifacts: [manifest.auxiliaryArtifacts[0]!, { ...manifest.auxiliaryArtifacts[1]!, sha256: "b".repeat(64) }] },
    { auxiliaryArtifacts: [manifest.auxiliaryArtifacts[0]!, { ...manifest.auxiliaryArtifacts[1]!, sizeBytes: 0 }] },
    { auxiliaryArtifacts: [...manifest.auxiliaryArtifacts, manifest.auxiliaryArtifacts[1]!] }]) {
    const result = withVerifiedConsentVisualSource(geometry, mutation, sha)!;
    assert.equal(result.visualComparison, undefined);
    assert.deepEqual(result.candidates, geometry.candidates, "unverified visuals must not erase control observations");
  }
  assert.equal(withVerifiedConsentVisualSource(geometry, manifest, "b".repeat(64))!.visualComparison, undefined);
  assert.ok(geometry.visualComparison, "verification must not mutate original geometry");
});
