import assert from "node:assert/strict";
import test from "node:test";
import { assessCmsSignals, compareCmsVersions, cmsSecurityProjectionSchema, resolveCmsEvidence, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectCmsSecurity } from "./cms-security-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { projectCmsSecurityPriority } from "../../lib/scans/cms-security-report";
import { buildSitePriorityReview } from "../../lib/scans/full-site-priority-review";
const url = "https://cms.example/";
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
export function cmsBundle(generators: string[], cmsAssets: string[] = []) {
  return { scanId: "cms-fixture", startedAt: "2026-09-17T00:00:00.000Z", completedAt: "2026-09-17T00:00:10.000Z", domSnapshots: [],
    runtimeMetadataSnapshots: [{ url, artifactId: "runtime:dom:1", capturedAtMs: 1000, consentStateAtTime: "pre_consent", documentIdentity: { token: "loader-1" },
      siteMetadata: { contractVersion: "certscore.site-metadata.v1", title: "Fixture", language: "en", generators, wordpressAssetObserved: false, cmsAssets } }],
  } as unknown as CanonicalEvidenceBundle;
}
const project = (generators: string[]) => projectCmsSecurity(cmsBundle(generators), source, url)!;
const packetsFor = (projection: unknown) => buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });

test("all requested CMS families match declared vulnerable versions through policy to priorities without scoring", () => {
  for (const name of ["Joomla! 5.2.4", "Drupal 10.4.2", "Magento 2.4.7-p5", "Adobe Commerce 2.4.8", "PrestaShop 8.2.2", "TYPO3 13.4.2", "OpenCart 4.2.0.0"]) {
    const projection = project([name]);
    assert.ok(projection, name);
    assert.ok(projection.assessment.matches.length, name);
    assert.equal(projection.assessment.detections[0]!.runtimeVersionConfirmed, false);
    for (const row of projection.assessment.detections) for (const ref of row.evidenceRefs) assert.ok(resolveCmsEvidence(projection, ref));
    for (const match of projection.assessment.matches) {
      assert.equal(match.affectedVersionMatch, true);
      assert.ok(resolveCmsEvidence(projection, match.evidenceRef));
      assert.ok(resolveCmsEvidence(projection, match.detectionRef));
      assert.match(match.record.sourceUrl, /^https:/);
    }
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [] });
    assert.equal(concerns.length, 1, name);
    assert.deepEqual(concerns[0]!.scoreEffects ?? [], []);
    const packets = packetsFor(projection);
    const priority = projectCmsSecurityPriority(packets);
    assert.equal(priority?.title, "Potential CMS vulnerability", `${name}: ${JSON.stringify(packets).slice(0, 900)}`);
    assert.match(priority!.summary, /declared, not runtime-confirmed/);
    const fullSite = buildSitePriorityReview([], [{ id: "home", url, homepage: true, findingIds: [] }], [], packets);
    assert.equal(fullSite[0]?.id, priority!.id);
    assert.equal(fullSite[0]?.pages[0]?.homepage, true);
  }
});

test("fixed boundaries and unsupported branches remain distinct", () => {
  for (const name of ["Joomla! 5.2.5", "Drupal 10.4.3", "Magento 2.4.7-p6", "Adobe Commerce 2.4.8-p1", "PrestaShop 8.2.3", "TYPO3 13.4.3", "OpenCart 4.2.0.1"]) {
    assert.equal(project([name]).assessment.matches.length, 0, name);
  }
  const eol = project(["Joomla 3.10.12"]);
  assert.equal(projectCmsSecurityPriority(packetsFor(eol))?.title, "Unsupported CMS branch");
  assert.equal(compareCmsVersions("2.4.7-p10", "2.4.7-p6"), 1);
  assert.equal(compareCmsVersions("4.2.0.0", "4.2.0.1"), -1);
});

test("ambiguous, partial, plugin, prerelease and hosted versions never generate vulnerability findings", () => {
  for (const values of [["Drupal 10"], ["Drupal 10.4"], ["Drupal 10.4.2", "Drupal 10.4.3"], ["Drupal 10.4.2", "Drupal"], ["Drupal 10.4.2", "Joomla 5.2.4"], ["Magento 2.4.7-beta1"], ["Shopify 1.0.0"], ["Wix 1.0.0"], ["Squarespace 1.0.0"], ["WordPress SEO plugin 1.0.0"], ["TYPO3 11.5.41-elts"]]) {
    assert.equal(project(values).assessment.matches.length, 0, values.join(" / "));
    assert.equal(projectCmsSecurityPriority(packetsFor(project(values))), null);
  }
  const asset = projectCmsSecurity(cmsBundle([], ["https://cms.example/core/misc/drupal.js?version=10.4.2", "https://third.example/media/system/js/joomla.js"]), source, url)!;
  assert.equal(asset.assessment.detections[0]?.name, "Drupal");
  assert.equal(asset.assessment.detections[0]?.version, null);
  assert.equal(asset.signals.length, 1);
  assert.equal(asset.signals[0]?.sourceUrl, "https://cms.example/core/misc/drupal.js");
});

test("unverified, stale, wrong-document, malformed and fabricated matches fail closed", () => {
  const bundle = cmsBundle(["Drupal 10.4.2"]);
  for (const supplied of [undefined, { ...source, verificationStatus: "unknown" }, { ...source, sha256: "bad" }]) assert.equal(projectCmsSecurity(bundle, supplied, url), null);
  assert.equal(projectCmsSecurity(bundle, source, "https://other.example/"), null);
  assert.equal(projectCmsSecurity({ ...bundle, completedAt: bundle.startedAt }, source, url), null);
  assert.equal(projectCmsSecurity({ ...bundle, runtimeMetadataSnapshots: [] }, source, url), null);
  const projection = project(["Drupal 10.4.2"]);
  for (const invalid of [
    { ...projection, assessment: { ...projection.assessment, matches: [] } },
    { ...projection, assessment: { ...projection.assessment, catalogueVersion: "invented" } },
    { ...projection, signals: [...projection.signals, ...projection.signals] },
    { ...projection, signals: [{ ...projection.signals[0], sourceUrl: "https://other.example/" }] },
    { ...projection, signals: [{ ...projection.signals[0], evidenceRef: "site_integrity:dom:999" }] },
  ]) assert.equal(cmsSecurityProjectionSchema.safeParse(invalid).success, false);
  assert.equal(assessCmsSignals(projection.signals, "2020-01-01T00:00:00.000Z").matches.length, 0);
});

test("JSONB key ordering preserves verifiable projection; source and CVE tampering do not", () => {
  const original = project(["Drupal 10.4.2"]);
  const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, row]) => [key, reverseKeys(row)])) : value;
  assert.equal(cmsSecurityProjectionSchema.safeParse(reverseKeys(original)).success, true);
  const altered = structuredClone(original);
  altered.assessment.matches[0]!.record.sourceUrl = "https://attacker.example/fake";
  assert.equal(cmsSecurityProjectionSchema.safeParse(altered).success, false);
  assert.equal(projectCmsSecurityPriority(packetsFor(altered)), null);
  assert.equal(project(["Wix.com Website Builder"]).assessment.detections[0]?.informationalOnly, true);
  assert.ok(project(["PrestaShop 1.7.8.11"]).assessment.matches.some(row => row.record.kind === "lifecycle"));
});

test("WordPress 4.5.33 lifecycle evidence follows the canonical concern/policy/finding path", () => {
  const projection = project(["WordPress 4.5.33"]);
  const match = projection.assessment.matches[0]!;
  assert.equal(projection.assessment.matches.length, 1);
  assert.equal(match.record.id, "wordpress-4.1-4.6-security-eol");
  assert.equal(match.record.kind, "lifecycle");
  assert.equal(match.observedVersion, "4.5.33");
  assert.equal(match.matchedRange, ">= 4.1.0 < 4.7.0");
  assert.equal(match.evidenceRef, "site_integrity:lifecycle:0");
  assert.ok(resolveCmsEvidence(projection, match.detectionRef));
  const signal = resolveCmsEvidence(projection, "site_integrity:dom:0");
  assert.ok(signal && "value" in signal);
  assert.equal(signal.value, "WordPress 4.5.33");
  const packets = packetsFor(projection);
  const priority = projectCmsSecurityPriority(packets);
  assert.equal(priority?.title, "Unsupported CMS branch");
  assert.match(priority!.summary, /WordPress declares 4\.5\.33/);
  assert.match(priority!.summary, /not runtime-confirmed/);
  assert.ok(packets.some(row => row.unifiedFindingId === priority!.id));
  assert.ok(packets.every(row => (row.scoreEffects ?? []).length === 0));
  const site = buildSitePriorityReview([], [{ id: "home", url, homepage: true, findingIds: [] }], [], packets);
  assert.equal(site[0]?.id, priority!.id);
});

test("WordPress lifecycle ranges, effective date and ambiguous evidence fail closed", () => {
  for (const name of ["WordPress 4.1.0", "WordPress 4.6.99"]) assert.equal(project([name]).assessment.matches.length, 1, name);
  for (const values of [["WordPress 4.0.99"], ["WordPress 4.7.0"], ["WordPress 6.8.3"], ["WordPress 4.5"], ["WordPress"], ["WordPress 4.5.33-beta"], ["WordPress 4.5.33", "WordPress 6.8.3"]]) {
    assert.equal(project(values).assessment.matches.length, 0, values.join(" / "));
  }
  const projection = project(["WordPress 4.5.33"]);
  assert.equal(assessCmsSignals(projection.signals, "2025-06-30T23:59:59.000Z").matches.length, 0);
  assert.equal(assessCmsSignals(projection.signals, "2025-07-01T00:00:00.000Z").matches.length, 1);
  const historical = { ...projection, assessment: assessCmsSignals(projection.signals, projection.capturedAt, "certscore.cms-catalogue.2026-09-17.v1") };
  assert.equal(historical.assessment.matches.length, 0);
  assert.equal(cmsSecurityProjectionSchema.safeParse(historical).success, true);
  assert.equal(projectCmsSecurityPriority(packetsFor(historical)), null);
  const fabricated = structuredClone(projection);
  fabricated.assessment.matches[0]!.matchedRange = ">= 4.1.0 < 99.0.0";
  assert.equal(cmsSecurityProjectionSchema.safeParse(fabricated).success, false);
});

test("new metadata supports WordPress major/minor releases while historical assessments remain unchanged", () => {
  const bundle = cmsBundle(["WordPress 4.5"]);
  const snapshot = bundle.runtimeMetadataSnapshots![0]!;
  snapshot.siteMetadata!.versionEvidence = [];
  const current = projectCmsSecurity(bundle, source, url)!;
  assert.equal(current.contractVersion, "certscore.cms-security-projection.v2");
  assert.equal(current.assessment.detections[0]?.version, "4.5");
  assert.equal(current.assessment.matches[0]?.observedVersion, "4.5");
  assert.equal(current.assessment.matches[0]?.record.kind, "lifecycle");
  assert.ok(packetsFor(current).every(row => (row.scoreEffects ?? []).length === 0));
  const legacy = project(["WordPress 4.5"]);
  assert.equal(legacy.contractVersion, "certscore.cms-security-projection.v1");
  assert.equal(legacy.assessment.detections[0]?.version, null);
  assert.equal(legacy.assessment.matches.length, 0);
  assert.equal(cmsSecurityProjectionSchema.safeParse(legacy).success, true);
});

test("comments and verified linked feed declarations project through the canonical CMS path", () => {
  for (const proof of [
    { kind: "html_generator_comment" as const, version: "4.5", value: 'generator="WordPress/4.5"', sourceUrl: url },
    { kind: "feed_generator" as const, version: "4.5", value: "<generator>https://wordpress.org/?v=4.5</generator>", sourceUrl: `${url}feed/`, linkedFrom: url, bodySha256: "b".repeat(64) },
  ]) {
    const bundle = cmsBundle([], [`${url}wp-includes/js/jquery/jquery.min.js`]);
    const metadata = bundle.runtimeMetadataSnapshots![0]!.siteMetadata!;
    metadata.versionEvidence = [proof]; metadata.feedLinks = [`${url}feed/`];
    const projection = projectCmsSecurity(bundle, source, url)!;
    assert.equal(projection.assessment.detections[0]?.version, "4.5");
    assert.equal(cmsSecurityProjectionSchema.safeParse(projection).success, true);
    assert.equal(projectCmsSecurityPriority(packetsFor(projection))?.title, "Unsupported CMS branch");
    assert.ok(resolveCmsEvidence(projection, "site_integrity:version:0"));
    assert.ok(packetsFor(projection).every(row => (row.scoreEffects ?? []).length === 0));
    const historical = { ...projection, contractVersion: "certscore.cms-security-projection.v1" };
    assert.equal(cmsSecurityProjectionSchema.safeParse(historical).success, false);
  }
});

test("curated core asset versions are candidates only; conflicts and forged declarations stay neutral", () => {
  const bundle = cmsBundle([], [`${url}wp-includes/js/wp-embed.min.js`]);
  const metadata = bundle.runtimeMetadataSnapshots![0]!.siteMetadata!;
  metadata.versionEvidence = [{ kind: "core_asset_version", version: "4.5", value: "4.5", sourceUrl: `${url}wp-includes/js/wp-embed.min.js` }];
  let projection = projectCmsSecurity(bundle, source, url)!;
  assert.deepEqual(projection.assessment.detections[0]?.observedVersions, ["4.5"]);
  assert.equal(projection.assessment.detections[0]?.version, null);
  assert.equal(projection.assessment.detections[0]?.versionBasis, "inferred");
  assert.equal(projection.assessment.matches.length, 0);
  metadata.versionEvidence.push({ kind: "html_generator_comment", version: "6.8", value: 'generator="WordPress/6.8"', sourceUrl: url });
  projection = projectCmsSecurity(bundle, source, url)!;
  assert.equal(projection.assessment.detections[0]?.version, "6.8");
  metadata.generators = ["WordPress 4.5"];
  assert.equal(projectCmsSecurity(bundle, source, url)!.assessment.detections[0]?.version, null);
  assert.equal(projectCmsSecurity(bundle, source, url)!.assessment.matches.length, 0);
  metadata.versionEvidence = [{ kind: "core_asset_version", version: "4.5", value: "4.5", sourceUrl: `${url}wp-includes/js/jquery/jquery.min.js` }];
  assert.equal(projectCmsSecurity(bundle, source, url), null);
  metadata.versionEvidence = [{ kind: "feed_generator", version: "4.5", value: "<generator>https://wordpress.org/?v=6.8</generator>", sourceUrl: `${url}feed/`, linkedFrom: url, bodySha256: "b".repeat(64) }];
  assert.equal(projectCmsSecurity(bundle, source, url), null);
});

test("feed evidence must remain bound to the retained page link and document", () => {
  const bundle = cmsBundle([]);
  const metadata = bundle.runtimeMetadataSnapshots![0]!.siteMetadata!;
  metadata.versionEvidence = [{ kind: "feed_generator", version: "6.8", value: "<generator>https://wordpress.org/?v=6.8</generator>", sourceUrl: `${url}feed/`, linkedFrom: url, bodySha256: "b".repeat(64) }];
  assert.equal(projectCmsSecurity(bundle, source, url), null);
  metadata.feedLinks = [`${url}feed/`];
  assert.equal(projectCmsSecurity(bundle, source, url)!.assessment.detections[0]?.version, "6.8");
  metadata.versionEvidence[0] = { ...metadata.versionEvidence[0]!, sourceUrl: "https://other.example/feed/" };
  assert.equal(projectCmsSecurity(bundle, source, url), null);
});

test("SITS plugin declarations and paths produce a deduplicated, version-bound informational inventory", () => {
  const bundle = cmsBundle(["WPML ver:4.8.6 stt:12,77,1,3;", "Powered by WPBakery Page Builder - drag and drop page builder for WordPress.", "WP Rocket 3.20.2"], [
    `${url}wp-content/plugins/borlabs-cookie/assets/javascript/borlabs-cookie-prioritize.min.js`,
    `${url}wp-content/cache/min/1/wp-content/plugins/svg-support/css/svgs-attachment.css`,
    `${url}wp-content/plugins/wp-rocket/assets/script.js`,
  ]);
  const projected = projectCmsSecurity(bundle, source, url)!;
  assert.ok(projected);
  assert.deepEqual(projected.pluginInventory?.detections.map(row => [row.name, row.version]), [
    ["WPML", "4.8.6"], ["WPBakery Page Builder", null], ["WP Rocket", "3.20.2"], ["Borlabs Cookie", null], ["SVG Support", null],
  ]);
  assert.equal(projected.assessment.detections[0]?.version, null);
  assert.equal(projected.assessment.matches.length, 0);
  assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts: { cmsSecurity: projected }, reviewFindingCandidates: [], validationFindings: [] }), []);
  for (const plugin of projected.pluginInventory!.detections) {
    assert.ok(resolveCmsEvidence(projected, plugin.evidenceRef));
    for (const ref of plugin.evidenceRefs) assert.ok(resolveCmsEvidence(projected, ref));
  }
  const tampered = structuredClone(projected);
  tampered.pluginInventory!.detections[1]!.version = "8.0.0";
  assert.equal(cmsSecurityProjectionSchema.safeParse(tampered).success, false);
  const legacy = structuredClone(projected); delete legacy.pluginInventory;
  assert.equal(cmsSecurityProjectionSchema.safeParse(legacy).success, true);
  assert.equal(projectCmsSecurity(bundle, { ...source, verificationStatus: "unverified" }, url), null);
});

test("conflicting plugin versions remain unknown and arbitrary plugin names never supply a core version", () => {
  const projected = projectCmsSecurity(cmsBundle(["WP Rocket 3.20.2", "WP Rocket 3.19.0"], [
    `${url}wp-content/plugins/custom-plugin/assets/version-6.8.js`,
    `${url}wp-content/themes/theme/plugins/not-a-wp-plugin/script.js`,
  ]), source, url)!;
  assert.equal(projected.pluginInventory?.detections[0]?.versionStatus, "conflicting");
  assert.equal(projected.pluginInventory?.detections[0]?.version, null);
  assert.deepEqual(projected.pluginInventory?.detections[0]?.observedVersions, ["3.20.2", "3.19.0"]);
  assert.equal(projected.pluginInventory?.detections[1]?.name, "custom-plugin");
  assert.equal(projected.pluginInventory?.detections[1]?.version, null);
  assert.equal(projected.pluginInventory?.detections.length, 2);
  assert.equal(projected.assessment.detections[0]?.version, null);
  assert.equal(projected.assessment.matches.length, 0);
});
