import assert from "node:assert/strict";
import test from "node:test";
import { assessCmsSignals, type CmsSignal } from "./cms-security";
import { CMS_CATALOGUE_V1, CMS_CATALOGUE_V2, CMS_CATALOGUE_V3 } from "./cms-security-catalog";
const signal = (value: string): CmsSignal => ({ evidenceRef: "site_integrity:dom:0", kind: "meta_generator", value, sourceUrl: "https://cms.example/", artifactRef: "runtime:dom:1" });
test("v3 recognizes complete Drupal 7 releases and applies community EOL only on its effective date", () => {
  for (const version of ["7.0", "7.98", "7.103"]) {
    const signals = [signal(`Drupal ${version}`)];
    assert.equal(assessCmsSignals(signals, "2025-01-04").matches.length, 0);
    const result = assessCmsSignals(signals, "2025-01-05");
    assert.equal(result.detections[0]?.version, version);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.observedVersion, version);
    assert.equal(result.matches[0]?.record.id, "drupal-7-community-eol");
    assert.match(result.matches[0]!.record.qualification!, /extended security support/);
    assert.equal(result.catalogueReviewedAt, "2026-10-11");
  }
});
test("Drupal 7 partial, non-release, conflicting and asset evidence stays neutral", () => {
  for (const version of ["7.x", "7.98.1", "7.098", "7.98-dev", "7.98-vendor"]) {
    const result = assessCmsSignals([signal(`Drupal ${version}`)], "2026-10-11");
    assert.equal(result.detections[0]?.version, null, version);
    assert.equal(result.matches.length, 0, version);
  }
  for (const signals of [[signal("Drupal 7.98"), signal("Drupal 7.103")], [signal("Drupal 7.98"), signal("Joomla 3.10.12")], [{ ...signal("/misc/drupal.js"), kind: "asset_path" as const }]]) {
    assert.equal(assessCmsSignals(signals, "2026-10-11").matches.length, 0);
  }
});
test("historical v1 and v2 retain their original grammar, rules and review date", () => {
  for (const catalogue of [CMS_CATALOGUE_V1, CMS_CATALOGUE_V2] as const) {
    const old = assessCmsSignals([signal("Drupal 7.98")], "2026-10-11", catalogue);
    assert.equal(old.catalogueVersion, catalogue);
    assert.equal(old.catalogueReviewedAt, "2026-09-17");
    assert.equal(old.detections[0]?.version, null);
    assert.deepEqual(old.matches, []);
    const oldThreePart = assessCmsSignals([signal("Drupal 7.98.1")], "2026-10-11", catalogue);
    assert.equal(oldThreePart.detections[0]?.version, "7.98.1");
    assert.deepEqual(oldThreePart.matches, []);
  }
});

test("v4 whole-major declarations prove lifecycle only without inventing a release", () => {
  for (const value of ["Drupal 7 (http://drupal.org)", "Drupal 8", "Drupal 9 (https://www.drupal.org)", "Joomla! 3", "TYPO3 CMS 11"]) {
    const result = assessCmsSignals([signal(value)], "2026-10-11");
    assert.equal(result.detections[0]?.version, null, value);
    assert.equal(result.detections[0]?.versionGranularity, "declared_branch", value);
    assert.ok(result.matches.length, value);
    assert.ok(result.matches.every(row => row.record.kind === "lifecycle"));
    assert.equal(result.matches[0]?.observedVersion, result.detections[0]?.branchVersion);
  }
  assert.equal(assessCmsSignals([signal("Drupal 7")], "2025-01-04").matches.length, 0);
});
test("whole-branch proof fails closed for partial range, suffix, conflicts and historical catalogues", () => {
  for (const value of ["Drupal 10", "Drupal 7.x", "Drupal 7-vendor", "Drupal 7 vendor", "Drupal 7 (https://evil.example)", "Drupal 07", "Joomla! 3.x", "TYPO3 11 ELTS"]) {
    assert.equal(assessCmsSignals([signal(value)], "2026-10-11").matches.length, 0, value);
  }
  for (const values of [["Drupal 8", "Drupal 10"], ["Drupal 7", "Drupal 7.98"], ["Drupal 7", "Joomla 3"], ["Drupal 7", "Drupal"]]) {
    assert.equal(assessCmsSignals(values.map(signal), "2026-10-11").matches.length, 0);
  }
  for (const catalogue of [CMS_CATALOGUE_V1, CMS_CATALOGUE_V2, CMS_CATALOGUE_V3] as const) {
    const old = assessCmsSignals([signal("Drupal 7")], "2026-10-11", catalogue);
    assert.deepEqual(old.matches, []);
    assert.equal("branchVersion" in old.detections[0]!, false);
    assert.equal("versionGranularity" in old.detections[0]!, false);
  }
  const v3 = assessCmsSignals([signal("Drupal 7.98")], "2026-10-11", CMS_CATALOGUE_V3);
  assert.equal(v3.detections[0]?.version, "7.98");
  assert.equal(v3.catalogueReviewedAt, "2026-10-11");
  assert.equal(v3.matches.length, 1);
});
