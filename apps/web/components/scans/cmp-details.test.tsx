import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceDirectory, SignalSnapshot } from "./report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "./report-lab/shadow-report-data";
import { projectCmpAudit } from "../../lib/scans/cmp-audit-projection";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";

test("CMP details precede consent controls without redundant platform details in both report layouts", () => {
  const report = { ...SHADOW_REPORT, cmpAudit: projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment }) };
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(<EvidenceDirectory report={report} compact={compact} />);
    const cmpStart = html.indexOf('id="cmp-details"');
    const controlStart = html.indexOf('id="consent-review-evidence"');
    assert.ok(cmpStart > 0 && cmpStart < controlStart);
    const cmpHtml = html.slice(cmpStart, controlStart);
    assert.match(cmpHtml, /CMP details/);
    assert.match(cmpHtml, /13 criteria/);
    assert.doesNotMatch(cmpHtml, /Platform identification evidence|Preference check:/);
    assert.doesNotMatch(html.slice(controlStart), /Controls &amp; CMP|Consent-management framework signal|CMP identity and control context/);
    assert.doesNotMatch(html, /id="evidence-row-consent-management-framework"/);
    assert.equal((cmpHtml.match(/id="cmp-criterion-/g) ?? []).length, 13);
  }
});

test("expanded executive Consent platform links to the CMP details anchor", () => {
  const html = renderToStaticMarkup(<SignalSnapshot report={SHADOW_REPORT} siteOverview />);
  const platform = html.slice(html.indexOf("Consent platform"), html.indexOf("Consent controls"));
  assert.match(platform, /href="#cmp-details"/);
  assert.match(platform, /View CMP Details/);
});

test("internal preference inspection status does not distract from criterion assessments", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  audit.inspectionSupport = { state: "unknown", provider: null, recipeVersion: null, reason: "preference_budget_exhausted" };
  const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" />);
  assert.match(html, /Borlabs Cookie/);
  assert.match(html, /13 criteria/);
  assert.doesNotMatch(html, /Preference check:|Inspection incomplete — timed out|Support not established|CMP not supported by CertScore/);
  audit.inspectionSupport = { ...audit.inspectionSupport, state: "unsupported", reason: "adapter_unavailable" };
  assert.doesNotMatch(renderToStaticMarkup(<CmpDetails audit={audit} vendor="Another CMP" />), /Preference check:|CMP not supported by CertScore/);
});

test("CMP details render Not assessed reasons without point deductions", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1", checklistRows: [{
    id: "post_reject_tracking_reduction", status: "Not testable", evidenceState: "not_testable",
    assessmentStatus: "coverage_limitation", note: "The Reject test evidence failed validation and could not be used.",
  } as any] });
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" compact={compact} />);
    const start = html.indexOf('id="cmp-criterion-implementation"');
    const row = html.slice(start, html.indexOf('id="cmp-criterion-duration"', start));
    assert.match(row, /Not assessed/);
    assert.match(row, /Reject test evidence failed validation/);
    assert.doesNotMatch(html, /−\d+|\bpts\b|point deduction/i);
  }
});

test("partial assessment has a distinct badge and keeps its coverage explanation", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1" });
  const row = audit.rows.find(row => row.id === "implementation")!;
  row.status = "Partially assessed";
  row.detail = "Accept observation retained; Reject evidence was unavailable.";
  for (const compact of [true, false]) {
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" compact={compact} />);
    assert.match(html, /Tracking activity after consent choices/);
    assert.match(html, /bg-sky-50/);
    assert.match(html, /Partially assessed/);
    assert.match(html, /Accept observation retained; Reject evidence was unavailable/);
    assert.doesNotMatch(html, /−\d+|\bpts\b/);
  }
});

test("inline CMP evidence renders comparison, both requests, every cookie name and scope limits", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1" });
  const metric = { candidateId: "accept", bounds: [419, 438.75, 528, 45] as [number, number, number, number], fillContrast: 9.462, outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 };
  audit.rows.find(row => row.id === "prominence")!.supportingEvidence = { prominence: { accept: metric, reject: { ...metric, candidateId: "reject", fillContrast: 1, bounds: [419, 556.75, 528, 49] }, captureSkewMs: 137 } };
  audit.rows.find(row => row.id === "implementation")!.supportingEvidence = { requests: [{ hostname: "js-eu1.hs-analytics.net", path: "/analytics/example.js", vendor: "HubSpot", category: "analytics", msAfterReject: 754 }, { hostname: "js-eu1.hsadspixel.net", path: "/pixels.js", vendor: "HubSpot", category: "advertising", msAfterReject: 754 }] };
  const names = ["bscookie", "bcookie", "_lfa", "li_sugr", "test_cookie", "lidc", "hubspotutk", "UserMatchHistory", "__cf_bm", "__hstc", "__hssrc", "_gcl_au", "borlabs-cookie-gcs", "AnalyticsSyncHistory", "__hssc"];
  audit.rows.find(row => row.id === "found_not_declared")!.supportingEvidence = { cookieComparison: { unmatchedNames: names, unmatchedNameCount: 15, declarationPatternCount: 36, observedCookieNameCount: 22, allUnmatchedOnlyAfterAccept: true } };
  for (const compact of [true, false]) {
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" compact={compact} />);
    assert.match(html, /9\.462:1/); assert.match(html, /1\.000:1/);
    assert.match(html, /528 × 45/); assert.match(html, /528 × 49/);
    assert.equal((html.match(/\+754 ms/g) ?? []).length, 2);
    assert.match(html, /Requests after confirmed Reject · 2/);
    for (const column of ["Service", "Category", "After Reject", "Request"]) assert.ok(html.includes(`>${column}</th>`));
    assert.match(html, /js-eu1.hs-analytics.net/); assert.match(html, /\/analytics\/example.js/);
    for (const name of names) assert.ok(html.includes(`>${name}</span>`));
    assert.match(html, /not text readability/);
    assert.match(html, /data sent by them was not assessed/);
    assert.match(html, /The unmatched cookies were found after Accept/);
    assert.match(html, /Names alone do not show each cookie/);
    assert.doesNotMatch(html, /\bpts\b|point deduction|Search service|All purposes/);
  }
});

test("compact CMP tables retain all rows, exact matches and historical limitations", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1" });
  audit.rows.find(row => row.id === "services")!.supportingEvidence = { inventory: { services: Array.from({ length: 11 }, (_, i) => ({ name: `Service ${i + 1}`, source: "cmp_api_inventory" as const })) } };
  audit.rows.find(row => row.id === "cookie_information")!.supportingEvidence = { inventory: { declarations: Array.from({ length: 36 }, (_, i) => ({ name: `cookie_${i}`, purpose: "Measurement", duration: i ? "2 years" : "&lt;100ms", source: "cmp_api_inventory" as const })) } };
  audit.rows.find(row => row.id === "found_not_declared")!.supportingEvidence = { inventory: { cookies: [
    { name: "_ga_123", matchedPattern: "_ga_*", observedIn: ["before_choice", "after_accept"] },
    { name: "unknown", matchedPattern: null, observedIn: ["after_accept"] },
  ] } };
  const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" />);
  assert.match(html, /CMP services · 11/); assert.match(html, /Service 11/);
  assert.match(html, /Cookie details · 36/); assert.match(html, /cookie_35/);
  assert.match(html, /Storage duration/); assert.match(html, />&lt;100ms<\/td>/);
  assert.match(html, /text-emerald-700/); assert.match(html, /_ga_\*/); assert.match(html, /No match/);
  assert.match(html, /Before choice · After Accept/);
  assert.equal((html.match(/role="region"/g) ?? []).length, 3);
  assert.equal((html.match(/max-h-\[322px\]/g) ?? []).length, 3);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /Search service|All purposes|All types/);
  const services = audit.rows.find(row => row.id === "services")!;
  services.status = "Observed"; services.supportingEvidence = undefined;
  assert.match(renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" />), /Service names were not saved/);
});
