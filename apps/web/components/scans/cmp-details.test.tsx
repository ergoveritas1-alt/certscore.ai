import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceDirectory, SignalSnapshot } from "./report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "./report-lab/shadow-report-data";
import { projectCmpAudit } from "../../lib/scans/cmp-audit-projection";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";

test("privacy-link magnifier uses only the referenced retained policy URL", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  const criterion = audit.rows.find(row => row.id === "privacy_link")!;
  Object.assign(criterion, { status: "Observed", sourceIds: ["privacy_notice_availability"] });
  const source = { ...SHADOW_REPORT.gdprTransparencyRows[0]!, id: "privacy_notice_availability",
    policyEvidence: { capturedAt: "2026-10-14T16:22:53Z", documentTitle: "Privacy policy", sourceUrl: "https://sits.com/en/privacy-policy", sections: [] } };
  const render = () => renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" evidenceRows={[source]} />);
  assert.match(render(), /aria-label="View privacy-policy link"/);
  assert.doesNotMatch(render(), /<dialog|<iframe/, "opening the control does not happen during render");
  for (const url of ["javascript:alert(1)", "data:text/html,policy", "https://user:password@example.test/privacy", "not a URL"]) {
    source.policyEvidence.sourceUrl = url;
    assert.doesNotMatch(render(), /View privacy-policy link/);
  }
  source.policyEvidence.sourceUrl = "https://sits.com/en/privacy-policy";
  source.id = "another-policy-check";
  assert.doesNotMatch(render(), /View privacy-policy link/, "unrelated policy references cannot fill a missing link");
  source.id = "privacy_notice_availability";
  criterion.status = "Not assessed";
  assert.doesNotMatch(render(), /View privacy-policy link/);
  assert.doesNotMatch(renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" />), /View privacy-policy link/);
});

test("banner magnifier requires an observed banner and retained crop; image loading waits for opening", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  const bannerPreview = { href: "/api/scans/scan-1/visual-evidence/banner", crop: {
    version: "consent_banner_crop.v1" as const, x: 100, y: 50, width: 500, height: 600,
    imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) } };
  const render = () => renderToStaticMarkup(<CmpDetails audit={audit} vendor="Example CMP" bannerPreview={bannerPreview} />);
  assert.match(render(), /aria-label="View captured cookie banner"/);
  assert.doesNotMatch(render(), /<image|<dialog/);
  assert.doesNotMatch(renderToStaticMarkup(<CmpDetails audit={audit} vendor="Example CMP" />), /View captured cookie banner/);
  audit.rows.find(row => row.id === "banner")!.status = "Not assessed";
  assert.doesNotMatch(render(), /View captured cookie banner/);
});

test("Reject magnifier is separate from the banner and requires an observed Reject with retained pixels", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  const rejectPreview = { href: "/api/scans/scan-1/visual-evidence/banner", crop: {
    version: "consent_control_crop.v1" as const, control: "reject" as const,
    x: 407, y: 544.75, width: 552, height: 73, imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) } };
  const render = () => renderToStaticMarkup(<CmpDetails audit={audit} vendor="Example CMP" rejectPreview={rejectPreview} />);
  assert.match(render(), /aria-label="View captured Reject option"/);
  assert.doesNotMatch(render(), /View captured cookie banner|<image|<dialog/);
  for (const compact of [false, true]) {
    assert.match(renderToStaticMarkup(<EvidenceDirectory compact={compact} report={{ ...SHADOW_REPORT, cmpAudit: audit,
      scan: { ...SHADOW_REPORT.scan, consentRejectPreview: rejectPreview } }} />), /View captured Reject option/);
  }
  assert.doesNotMatch(renderToStaticMarkup(<CmpDetails audit={audit} vendor="Example CMP" />), /View captured Reject option/);
  audit.rows.find(row => row.id === "reject")!.status = "Not observed";
  assert.doesNotMatch(render(), /View captured Reject option/);
});

test("prominence magnifier needs a retained comparison and preserves observed or review assessments", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  const row = audit.rows.find(row => row.id === "prominence")!;
  const measurement = { candidateId: "accept", bounds: [419, 438.75, 528, 45] as [number, number, number, number],
    fillContrast: 9, outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 };
  row.supportingEvidence = { prominence: { accept: measurement, reject: { ...measurement, candidateId: "reject", bounds: [419, 556.75, 528, 49] }, captureSkewMs: 100 } };
  const prominencePreview = { href: "/api/scans/scan-1/visual-evidence/banner", crop: {
    version: "consent_prominence_crop.v1" as const, x: 407, y: 426.75, width: 552, height: 191,
    imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) } };
  const render = () => renderToStaticMarkup(<CmpDetails audit={audit} vendor="Example CMP" prominencePreview={prominencePreview} />);
  for (const status of ["Observed", "Review recommended", "Informational"] as const) {
    row.status = status;
    assert.match(render(), /aria-label="View captured Accept \/ Reject comparison"/);
    assert.doesNotMatch(render(), /<image|<dialog/);
    assert.equal(row.status, status);
  }
  for (const compact of [false, true]) {
    assert.match(renderToStaticMarkup(<EvidenceDirectory compact={compact} report={{ ...SHADOW_REPORT, cmpAudit: audit,
      scan: { ...SHADOW_REPORT.scan, consentProminencePreview: prominencePreview } }} />), /View captured Accept \/ Reject comparison/);
  }
  row.status = "Not assessed";
  assert.doesNotMatch(render(), /View captured Accept \/ Reject comparison/);
  row.status = "Observed"; delete row.supportingEvidence;
  assert.doesNotMatch(render(), /View captured Accept \/ Reject comparison/);
});

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
  audit.rows.find(row => row.id === "categories")!.supportingEvidence = { inventory: { categories: [{ name: "Statistics", checked: false }, { name: "Marketing", checked: true }, { name: "External media", checked: null }] } };
  audit.rows.find(row => row.id === "services")!.supportingEvidence = { inventory: { services: Array.from({ length: 11 }, (_, i) => ({ name: `Service ${i + 1}`, source: "cmp_api_inventory" as const })) } };
  audit.rows.find(row => row.id === "cookie_information")!.supportingEvidence = { inventory: { declarations: Array.from({ length: 36 }, (_, i) => ({ name: `cookie_${i}`, purpose: "Measurement", duration: i ? "2 years" : "&lt;100ms", source: "cmp_api_inventory" as const })) } };
  audit.rows.find(row => row.id === "found_not_declared")!.supportingEvidence = { inventory: { cookies: [
    { name: "_ga_123", matchedPattern: "_ga_*", observedIn: ["before_choice", "after_accept"] },
    { name: "unknown", matchedPattern: null, observedIn: ["after_accept"] },
  ] } };
  audit.rows.find(row => row.id === "duration")!.supportingEvidence = { inventory: { expiries: [
    { visit: "Accept", name: "borlabs-cookie", capturedAtEpochSeconds: 1791946223.384, expiresAtEpochSeconds: 1797130217, remainingSeconds: 1797130217 - 1791946223.384 },
    { visit: "Reject", name: "borlabs-cookie", capturedAtEpochSeconds: 1791946219.865, expiresAtEpochSeconds: 1797130216, remainingSeconds: 1797130216 - 1791946219.865 },
  ] } };
  const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" />);
  assert.match(html, /Consent-cookie expiry · 2/); assert.match(html, /Remaining days/);
  assert.match(html, /59\.99992611/); assert.match(html, /59\.99995527/);
  assert.match(html, /Time remaining when the cookie was captured/);
  assert.match(html, /Category choices · 3/); assert.match(html, /Captured setting/);
  assert.match(html, />Off<\/td>/); assert.match(html, />On<\/td>/); assert.match(html, />Not captured<\/td>/);
  assert.match(html, /CMP services · 11/); assert.match(html, /Service 11/);
  assert.match(html, /Cookie details · 36/); assert.match(html, /cookie_35/);
  assert.match(html, /Storage duration/); assert.match(html, />&lt;100ms<\/td>/);
  assert.match(html, /text-emerald-700/); assert.match(html, /_ga_\*/); assert.match(html, /No match/);
  assert.match(html, /Before choice · After Accept/);
  assert.equal((html.match(/role="region"/g) ?? []).length, 5);
  assert.equal((html.match(/max-h-\[322px\]/g) ?? []).length, 5);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /Search service|All purposes|All types/);
  const services = audit.rows.find(row => row.id === "services")!;
  services.status = "Observed"; services.supportingEvidence = undefined;
  assert.match(renderToStaticMarkup(<CmpDetails audit={audit} vendor="Borlabs Cookie" />), /Service names were not saved/);
});

test("v2 groups one shared preference failure and retains every criterion anchor and JSON evidence", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1" });
  audit.version = "cmp_audit_report.v2";
  const ids = ["categories", "services", "cookie_information"] as const;
  for (const id of ids) Object.assign(audit.rows.find(row => row.id === id)!, { status: "Incomplete", detail: "This check depends on the incomplete preference inspection.",
    sourceIds: ["packet"], limitation: { group: "preferences", code: "preference_operation_timed_out" } });
  audit.limitationGroups = [{ id: "preferences", code: "preference_operation_timed_out", title: "Preference inspection timed out", criterionIds: [...ids] }];
  for (const compact of [true, false]) {
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="OneTrust" compact={compact} />);
    assert.equal((html.match(/>Preference inspection timed out</g) ?? []).length, 1);
    assert.equal((html.match(/id="cmp-criterion-/g) ?? []).length, 13);
    assert.match(html, /id="cmp-limitation-preferences"/);
    assert.match(html, /3 checks · View affected checks/);
    const group = html.slice(html.indexOf('id="cmp-limitation-preferences"'));
    for (const id of ids) assert.match(group, new RegExp(`id="cmp-criterion-${id}"`));
    assert.match(group, /JSON evidence/);
    assert.doesNotMatch(group, /Correction steps|Review recommended/);
  }
});

test("partial cookie comparisons show neutral unmatched labels and preserve available detail fields", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1" });
  Object.assign(audit.rows.find(row => row.id === "found_not_declared")!, { status: "Partially assessed", label: "Unmatched cookie names", supportingEvidence: {
    inventory: { cookies: [{ name: "_ga", matchedPattern: "_ga", observedIn: ["before_choice"] }, { name: "unknown_name", matchedPattern: null, observedIn: ["before_choice"] }] },
    cookieComparison: { declarationPatternCount: 1, observedCookieNameCount: 2, unmatchedNameCount: 1, unmatchedNames: ["unknown_name"], allUnmatchedOnlyAfterAccept: false, declarationInventoryComplete: false } } });
  Object.assign(audit.rows.find(row => row.id === "cookie_information")!, { status: "Partially assessed", supportingEvidence: { inventory: {
    declarations: [{ name: "_ga", purpose: "Measurement", duration: "", source: "cmp_visible_inventory" }] } } });
  const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor="OneTrust" />);
  assert.match(html, /No match in captured list/); assert.match(html, /Unmatched names are not confirmed omissions/);
  assert.match(html, /text-emerald-700/); assert.match(html, /Measurement/); assert.match(html, /Not captured/);
  assert.match(html, /Cookie matches · 2/);
});

test("v3 shows copied activity and inferred purpose tables separately from CMP disclosures", async () => {
  const { CmpDetails } = await import("./cmp-details");
  const audit = projectCmpAudit({ scanId: "scan-1" }); audit.version="cmp_audit_report.v3";
  Object.assign(audit.rows.find(row=>row.id==="consent_record")!, { label:"Consent storage observed",status:"Observed",supportingEvidence:{inventory:{consentStorage:[{visit:"Reject",name:"OptanonConsent",change:"updated"}]}} });
  Object.assign(audit.rows.find(row=>row.id==="implementation")!, {status:"Observed",supportingEvidence:{inventory:{choiceActivity:[{action:"reject",windowMs:8000,requestCount:1,nonEssentialRequestCount:0,requests:[{hostname:"privacyportal-de.onetrust.com",path:"/request/v1/consentreceipts/anonymous",vendor:"OneTrust",purpose:"consent_management",msAfterClick:58,nonEssential:false}]}]}} });
  Object.assign(audit.rows.find(row=>row.id==="cookie_information")!, {status:"Partially assessed",supportingEvidence:{inventory:{declarations:[{name:"_ga",purpose:"",duration:"",source:"cmp_api_inventory",inferredPurpose:{category:"analytics",basis:"canonical_cookie_registry.v1"}}]}} });
  const html=renderToStaticMarkup(<CmpDetails audit={audit} vendor="OneTrust" />);
  for (const text of [/Consent storage observed/,/Updated after choice/,/Requests after Reject click · 1/,/CMP-stated purpose/,/Inferred purpose/,/CMP-stated retention/,/Not captured/,/analytics/,/consent management/]) assert.match(html,text);
  assert.doesNotMatch(html,/Requests after confirmed Reject|consent not confirmed/);
  assert.doesNotMatch(html,/id="evidence-row-post_reject_tracking_reduction"/);
});

test("named CMP disclosure rows keep their source distinct from configuration and tested controls", async () => {
  const {CmpDetails}=await import("./cmp-details");
  const audit=projectCmpAudit({scanId:"scan-1"});
  Object.assign(audit.rows.find(row=>row.id==="services")!,{status:"Observed",supportingEvidence:{inventory:{services:[{name:"Vimeo",source:"cmp_named_disclosure"},{name:"Google",source:"cmp_named_disclosure"}]}}});
  const html=renderToStaticMarkup(<CmpDetails audit={audit} vendor="OneTrust"/>);
  assert.match(html,/Vimeo/);assert.match(html,/Google/);assert.match(html,/CMP disclosure/);
  assert.doesNotMatch(html,/Labelled control|CMP configuration/);
});
