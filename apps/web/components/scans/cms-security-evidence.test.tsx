import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assessCmsPluginSignals, assessCmsSignals, buildTechnologyInventory, type CmsSecurityProjection, type CmsSignal } from "@certscore/contracts";
import { CmsSecurityEvidence } from "./cms-security-evidence";
Object.assign(globalThis, { React });
const projection = (signals: CmsSignal[]): CmsSecurityProjection => ({
  contractVersion: "certscore.cms-security-projection.v2", scanId: "fixture", verificationStatus: "verified", sourceHash: "a".repeat(64),
  documentUrl: "https://cms.example/", documentToken: "loader", capturedAt: "2026-10-07T00:00:00.000Z", evidenceRef: "runtime:dom:1", signals,
  assessment: assessCmsSignals(signals, "2026-10-07T00:00:00.000Z", undefined, "v2"),
  pluginInventory: assessCmsPluginSignals(signals),
});
const signal = (value: string): CmsSignal => ({ evidenceRef: "site_integrity:dom:0", kind: "meta_generator", value, sourceUrl: "https://cms.example/", artifactRef: "runtime:dom:1" });
test("unknown CMS keeps neutral version labels and no stacked disclaimers", () => {
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={projection([signal("WordPress")])} />);
  assert.match(html, /aria-label="Version not detected">—/);
  assert.match(html, /WordPress · Version not detected/);
  assert.match(html, /All source evidence/);
  assert.doesNotMatch(html, /Limited|Version check unavailable|Version could not be checked|Confirm the installed|Page-reported versions/);
});
test("declared release is prominent and selected advisory warnings remain visible", () => {
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={projection([signal("WordPress 6.8")])} />);
  assert.match(html, /WordPress 6\.8/);
  assert.match(html, /No issue matched in the selected version checks/);
  const flagged = renderToStaticMarkup(<CmsSecurityEvidence projection={projection([signal("WordPress 4.5")])} />);
  assert.match(flagged, /Support ended/); assert.match(flagged, /View vendor source/);
  assert.doesNotMatch(flagged, /Version not detected/);
});
test("asset version candidates and conflicting declarations are labelled distinctly", () => {
  const proof = { kind: "core_asset_version" as const, version: "6.8.3", value: "6.8.3", sourceUrl: "https://cms.example/wp-includes/js/wp-embed.min.js" };
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={projection([{ evidenceRef: "site_integrity:version:0", kind: proof.kind, value: proof.value, sourceUrl: proof.sourceUrl, artifactRef: "runtime:dom:1", versionEvidence: proof }])} />);
  assert.match(html, /6\.8\.3 · Asset version/);
  assert.doesNotMatch(html, /No issue matched/);
  const conflict = renderToStaticMarkup(<CmsSecurityEvidence projection={projection([signal("WordPress 6.8"), { ...signal("WordPress 6.7"), evidenceRef: "site_integrity:dom:1" }])} />);
  assert.match(conflict, /Conflicting versions/);
});
test("plugins have their own rows alongside the unknown core version", () => {
  const signals = [signal("WordPress"), { ...signal("WPML ver:4.8.6 stt:12,77,1,3;"), evidenceRef: "site_integrity:dom:1" },
    { ...signal("Powered by WPBakery Page Builder - drag and drop page builder for WordPress."), evidenceRef: "site_integrity:dom:2" },
    { ...signal("WP Rocket 3.20.2"), evidenceRef: "site_integrity:dom:3" }];
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={projection(signals)} />);
  assert.match(html, /WordPress · Version not detected/);
  assert.match(html, /Plugin/); assert.match(html, /WPML/); assert.match(html, /4\.8\.6/);
  assert.match(html, /WP Rocket/); assert.match(html, /3\.20\.2/); assert.match(html, /WPBakery Page Builder/);
  assert.match(html, /aria-label="Version not detected">—/);
  assert.doesNotMatch(html, /Support ended|Potential exposure|Limited|disclaimer/i);
  const legacy = projection(signals); delete legacy.pluginInventory;
  assert.doesNotMatch(renderToStaticMarkup(<CmsSecurityEvidence projection={legacy} />), /id="site_integrity:plugin:/);
});

test("multiple platform detections keep the header compact and the details intact", () => {
  const sample = projection([signal("WordPress 6.8")]);
  sample.assessment.detections.push({ ...sample.assessment.detections[0]!, name: "Other platform", evidenceRef: "site_integrity:dom:other" });
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={sample} />);
  assert.match(html, /2 platforms detected/);
  assert.match(html, /WordPress/);
  assert.match(html, /Other platform/);
});

test("technology-only reports show source, version, confidence and scoped tentative evidence", () => {
  const sample = projection([]);
  sample.technologyInventory = buildTechnologyInventory([
    { kind: "header", value: "server: nginx/1.26.1", sourceUrl: sample.documentUrl, evidenceRef: "site_integrity:tech-signal:0", sourceRef: "response-1" },
    { kind: "asset", value: "/react.production.min.js", sourceUrl: "https://external.example/react.production.min.js", evidenceRef: "site_integrity:tech-signal:1", sourceRef: sample.evidenceRef },
  ], sample.documentUrl);
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={sample} />);
  assert.match(html, /Tech stack observed/); assert.match(html, /nginx/); assert.match(html, /1\.26\.1 · Declared/);
  assert.match(html, />High<\/td>/); assert.match(html, /Delivery infrastructure/);
  assert.match(html, />Tentative<\/td>/); assert.match(html, /External asset · ownership unresolved/);
  assert.match(html, /Supporting evidence/); assert.match(html, /response-1/);
  assert.equal((html.match(/<table /g) ?? []).length, 1);
  assert.match(html, /scope="col"[^>]*>Confidence/);
  assert.doesNotMatch(html, /Support ended|Potential exposure|No issue matched/);
});
