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

test("CMS metadata cannot survive a later runtime document change or invalid latest proof", () => {
  for (const latest of [
    { url, capturedAtMs: 2000, documentIdentity: { source: "cdp_loader_id" as const, token: "loader-2" } },
    { url: `${url}other`, capturedAtMs: 2000, documentIdentity: { source: "cdp_loader_id" as const, token: "loader-1" } },
    { url, capturedAtMs: 2000, documentIdentity: undefined },
    { url, capturedAtMs: 10001, documentIdentity: { source: "cdp_loader_id" as const, token: "loader-1" } },
  ]) {
    const bundle = cmsBundle(["Drupal 10.4.2"]);
    bundle.runtimeMetadataSnapshots!.push({ ...bundle.runtimeMetadataSnapshots![0]!, ...latest, artifactId: "runtime:dom:2", siteMetadata: undefined });
    const projection = projectCmsSecurity(bundle, source, url);
    assert.equal(projection, null, JSON.stringify(latest));
    assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [] }), []);
    assert.equal(projectCmsSecurityPriority(packetsFor(projection)), null);
    assert.equal(bundle.runtimeMetadataSnapshots![0]!.siteMetadata!.generators[0], "Drupal 10.4.2", "original capture remains intact");
  }
});

test("CMS projection uses the newest metadata bound to the current runtime document", () => {
  const bundle = cmsBundle(["Drupal 10.4.2"]);
  const original = bundle.runtimeMetadataSnapshots![0]!;
  bundle.runtimeMetadataSnapshots!.push({ ...original, capturedAtMs: 2000, artifactId: "runtime:dom:2",
    siteMetadata: { ...original.siteMetadata!, generators: ["Drupal 10.4.3"] } });
  // A later lightweight snapshot still proves the same document without
  // requiring another metadata capture or borrowing from the consent lane.
  bundle.runtimeMetadataSnapshots!.push({ ...original, capturedAtMs: 3000, artifactId: "runtime:dom:3", siteMetadata: undefined });
  const projection = projectCmsSecurity(bundle, source, url)!;
  assert.equal(projection.evidenceRef, "runtime:dom:2");
  assert.equal(projection.assessment.detections[0]?.version, "10.4.3");
  assert.equal(projection.assessment.matches.length, 0);
  assert.equal(projectCmsSecurityPriority(packetsFor(projection)), null);
  assert.equal(projection.capturedAt, "2026-09-17T00:00:02.000Z");
  bundle.runtimeMetadataSnapshots!.reverse();
  assert.deepEqual(projectCmsSecurity(bundle, source, url), projection, "capture time determines metadata selection, not array ordering");
  const legacy = { ...bundle, domSnapshots: bundle.runtimeMetadataSnapshots! };
  delete legacy.runtimeMetadataSnapshots;
  assert.deepEqual(projectCmsSecurity(legacy, source, url), projection, "legacy unsharded snapshots remain readable");
  assert.equal(projectCmsSecurity({ ...legacy, runtimeMetadataSnapshots: [] }, source, url), null, "an empty runtime lane cannot borrow consent metadata");
  const reloaded = cmsBundle(["Drupal 10.4.2"]);
  reloaded.runtimeMetadataSnapshots!.push({ ...original, capturedAtMs: 4000, artifactId: "runtime:dom:reloaded",
    documentIdentity: { source: "cdp_loader_id", token: "loader-2" }, siteMetadata: { ...original.siteMetadata!, generators: ["Drupal 10.4.3"] } });
  const fresh = projectCmsSecurity(reloaded, source, url)!;
  assert.equal(fresh.documentToken, "loader-2", "newly captured metadata can establish the new document");
  assert.equal(fresh.assessment.detections[0]?.version, "10.4.3");
  assert.equal(fresh.assessment.matches.length, 0);
});

test("tied legacy document or CMS declaration conflicts cannot create findings in either source order", () => {
  const base = cmsBundle(["WordPress 4.5.33"]);
  const original = base.runtimeMetadataSnapshots![0]!;
  for (const competing of [
    { ...original, artifactId: "legacy:second", documentIdentity: { source: "cdp_loader_id" as const, token: "loader-2" }, siteMetadata: undefined },
    { ...original, artifactId: "legacy:second", url: `${url}other`, siteMetadata: undefined },
    { ...original, artifactId: "legacy:second", siteMetadata: { ...original.siteMetadata!, generators: ["WordPress 7.1.2"] } },
  ]) {
    // Multiple snapshots are valid on the legacy DOM path. The current
    // runtimeMetadataSnapshots contract remains bounded to one capture.
    for (const domSnapshots of [[original, competing], [competing, original]]) {
      const projection = projectCmsSecurity({ ...base, runtimeMetadataSnapshots: undefined, domSnapshots }, source, url);
      assert.equal(projection, null, "equal offsets must not select a loader or declaration by array order");
      assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [] }), []);
      assert.equal(projectCmsSecurityPriority(packetsFor(projection)), null);
    }
  }
});

test("consistent duplicate legacy metadata has stable provenance while a later unambiguous declaration remains eligible", () => {
  const base = cmsBundle(["WordPress 4.5.33"]);
  const original = base.runtimeMetadataSnapshots![0]!;
  const duplicate = { ...original, artifactId: "legacy:duplicate", siteMetadata: {
    // Reordered JSON keys do not make an identical declaration contradictory.
    cmsAssets: [...original.siteMetadata!.cmsAssets!], wordpressAssetObserved: false,
    generators: [...original.siteMetadata!.generators], language: "en", title: "Fixture",
    contractVersion: "certscore.site-metadata.v1" as const } };
  const projectOrder = (domSnapshots: typeof base.domSnapshots) => projectCmsSecurity({ ...base, runtimeMetadataSnapshots: undefined, domSnapshots }, source, url);
  const first = projectOrder([original, duplicate]);
  assert.ok(first);
  assert.equal(first.assessment.matches[0]?.record.id, "wordpress-4.1-4.6-security-eol");
  assert.deepEqual(projectOrder([duplicate, original]), first);
  const updated = { ...original, capturedAtMs: 2000, artifactId: "legacy:updated",
    siteMetadata: { ...original.siteMetadata!, generators: ["WordPress 7.1.2"] } };
  assert.equal(projectOrder([original, updated])!.assessment.matches.length, 0);
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

test("Drupal 7 complete release follows canonical lifecycle projection with original evidence and no score effect", () => {
  const projection = project(["Drupal 7.98"]);
  assert.equal(projection.assessment.detections[0]?.version, "7.98");
  assert.equal(projection.signals[0]?.value, "Drupal 7.98");
  assert.equal(projection.assessment.matches[0]?.record.id, "drupal-7-community-eol");
  assert.ok(resolveCmsEvidence(projection, projection.assessment.matches[0]!.evidenceRef));
  assert.equal(cmsSecurityProjectionSchema.safeParse(projection).success, true);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [] });
  assert.equal(concerns.length, 1);
  assert.deepEqual(concerns[0]?.scoreEffects ?? [], []);
  assert.equal(projectCmsSecurityPriority(packetsFor(projection))?.title, "Unsupported CMS branch");
});

test("stored v1/v2 catalogue projections validate with their original dates and conclusions", () => {
  const current = project(["Drupal 7.98"]);
  for (const version of ["certscore.cms-catalogue.2026-09-17.v1", "certscore.cms-catalogue.2026-09-17.v2"] as const) {
    const assessment = assessCmsSignals(current.signals, current.capturedAt, version, "v2");
    const historical = { ...current, assessment };
    assert.equal(assessment.catalogueReviewedAt, "2026-09-17");
    assert.deepEqual(assessment.matches, []);
    assert.equal(cmsSecurityProjectionSchema.safeParse(historical).success, true);
    assert.equal(cmsSecurityProjectionSchema.safeParse({ ...historical, assessment: { ...assessment, catalogueReviewedAt: "2026-10-11" } }).success, false);
    assert.equal(projectCmsSecurityPriority(packetsFor(historical)), null);
  }
});

test("v4 declared whole branch follows canonical score-neutral lifecycle path and retained reader", () => {
  for (const declaration of ["Drupal 7 (http://drupal.org)", "Drupal 9 (https://www.drupal.org)"]) {
    const projection = project([declaration]);
    assert.equal(projection.assessment.detections[0]?.version, null);
    assert.equal(projection.assessment.detections[0]?.versionStatus, "declared_branch");
    assert.ok(projection.assessment.matches.every(row => row.record.kind === "lifecycle"));
    assert.equal(cmsSecurityProjectionSchema.safeParse(projection).success, true);
    assert.ok(resolveCmsEvidence(projection, projection.assessment.matches[0]!.evidenceRef));
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [] });
    assert.equal(concerns.length, 1);
    assert.deepEqual(concerns[0]?.scoreEffects ?? [], []);
    assert.equal(projectCmsSecurityPriority(packetsFor(projection))?.title, "Unsupported CMS branch");
    const forged = structuredClone(projection);
    forged.assessment.detections[0]!.branchVersion = "8";
    assert.equal(cmsSecurityProjectionSchema.safeParse(forged).success, false);
    const historical = { ...projection, assessment: assessCmsSignals(projection.signals, projection.capturedAt, "certscore.cms-catalogue.2026-10-11.v3", "v2") };
    assert.equal(historical.assessment.catalogueReviewedAt, "2026-10-11");
    assert.equal(cmsSecurityProjectionSchema.safeParse(historical).success, true);
    assert.equal(projectCmsSecurityPriority(packetsFor(historical)), null);
  }
});
