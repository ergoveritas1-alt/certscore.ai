import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assessCmsPluginSignals, assessCmsSignals, type CmsSecurityProjection, type CmsSignal } from "@certscore/contracts";
import { CmsSecurityEvidence } from "./cms-security-evidence";
Object.assign(globalThis, { React });
const projection = (signals: CmsSignal[]): CmsSecurityProjection => ({
  contractVersion: "certscore.cms-security-projection.v2", scanId: "fixture", verificationStatus: "verified", sourceHash: "a".repeat(64),
  documentUrl: "https://cms.example/", documentToken: "loader", capturedAt: "2026-10-07T00:00:00.000Z", evidenceRef: "runtime:dom:1", signals,
  assessment: assessCmsSignals(signals, "2026-10-07T00:00:00.000Z", undefined, "v2"),
  pluginInventory: assessCmsPluginSignals(signals),
});
const signal = (value: string): CmsSignal => ({ evidenceRef: "site_integrity:dom:0", kind: "meta_generator", value, sourceUrl: "https://cms.example/", artifactRef: "runtime:dom:1" });
test("unknown CMS has one neutral version label and no stacked disclaimers", () => {
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={projection([signal("WordPress")])} />);
  assert.equal((html.match(/Version not detected/g) ?? []).length, 1);
  assert.match(html, /WordPress · Version not detected/);
  assert.match(html, /How we identified this/);
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
test("plugins show separately from the unknown core version without extra warnings", () => {
  const signals = [signal("WordPress"), { ...signal("WPML ver:4.8.6 stt:12,77,1,3;"), evidenceRef: "site_integrity:dom:1" },
    { ...signal("Powered by WPBakery Page Builder - drag and drop page builder for WordPress."), evidenceRef: "site_integrity:dom:2" },
    { ...signal("WP Rocket 3.20.2"), evidenceRef: "site_integrity:dom:3" }];
  const html = renderToStaticMarkup(<CmsSecurityEvidence projection={projection(signals)} />);
  assert.match(html, /WordPress · Version not detected/);
  assert.match(html, /Plugins/); assert.match(html, /WPML/); assert.match(html, /4\.8\.6/);
  assert.match(html, /WP Rocket/); assert.match(html, /3\.20\.2/); assert.match(html, /WPBakery Page Builder/);
  assert.match(html, /aria-label="Version not detected">—/);
  assert.doesNotMatch(html, /Support ended|Potential exposure|Limited|disclaimer/i);
  const legacy = projection(signals); delete legacy.pluginInventory;
  assert.doesNotMatch(renderToStaticMarkup(<CmsSecurityEvidence projection={legacy} />), /<table/);
});
