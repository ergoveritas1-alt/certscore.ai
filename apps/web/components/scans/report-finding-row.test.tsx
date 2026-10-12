import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FindingRow } from "./report-finding-row";
import { evidenceRowAnchor, findingEvidenceAnchor } from "../../lib/scans/report-evidence-navigation";

test("a top issue orders affected pages and items, recommended fixes, then JSON evidence", () => {
  const page = { id: "home", url: "https://example.com/", homepage: true };
  const html = renderToStaticMarkup(<FindingRow priority pages={[page]} observations={[{ id: "affected-area", title: "Affected area", summary: "Observed item", pages: [page] }]} finding={{
    id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability", title: "Privacy policy not found", rank: 1,
    summary: "Completed discovery did not identify a policy.", status: "Potential gap", focus: "", vendors: [],
    evidence: ["Retained discovery evidence"], evidenceJson: {}, correctionSteps: ["Publish a privacy policy.", "Link it from the scanned page."],
  }}/>);
  assert.match(html, /href="#evidence-row-privacy_notice_availability"/);
  assert.ok(html.indexOf("Affected pages") < html.indexOf("Affected area"));
  assert.ok(html.indexOf("Affected area") < html.indexOf("Recommended fixes"));
  assert.ok(html.indexOf("Retained discovery evidence") < html.indexOf("Recommended fixes"));
  assert.ok(html.indexOf("Publish a privacy policy.") < html.indexOf("JSON evidence"));
  assert.ok(html.indexOf("Publish a privacy policy.") < html.indexOf("Link it from the scanned page."));
  assert.doesNotMatch(html, />Correction steps</);
  const fixes = html.match(/<details\b([^>]*)aria-label="Recommended fixes"[^>]*>(.*?)<\/details>/s);
  assert.ok(fixes, "recommended fixes use a disclosure");
  assert.doesNotMatch(fixes[1]!, /\bopen(?:=|\s|$)/, "fixes start collapsed");
  const summaries = [...html.matchAll(/<summary\b([^>]*)>(.*?)<\/summary>/gs)];
  const fixesSummary = summaries.find(match => match[2]!.includes("Recommended fixes"))!;
  const jsonSummary = summaries.find(match => match[2]!.includes("JSON evidence"))!;
  assert.equal(fixesSummary[1], jsonSummary[1], "fixes and JSON evidence share the same summary layout");
});

test("navigation supports grouped accessibility and specialized canonical findings", () => {
  assert.equal(findingEvidenceAnchor("accessibility_priority_group", "accessibility"), "accessibility-evidence");
  assert.equal(findingEvidenceAnchor("site_integrity_cms_security"), "cms-security-evidence");
  assert.equal(findingEvidenceAnchor("form_data_unexpected_destination"), "form-destination-evidence");
  assert.equal(findingEvidenceAnchor("acceptance_signal_contradicts_action"), "consent-review-evidence");
  assert.equal(findingEvidenceAnchor("unmapped"), "evidence");
  assert.equal(evidenceRowAnchor("pre_consent_cookies_storage"), "evidence-row-pre_consent_cookies_storage");
});
