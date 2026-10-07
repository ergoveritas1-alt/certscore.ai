import { DetectedIntegrationVendors, DetectedIntegrationInventoryContext } from "./detected-integration-vendors";
import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportInventorySummary, ReportRuntimeSummary } from "./report-inventory-summary";
import { projectExecutiveRuntimeCards } from "../../lib/scans/executive-runtime-cards";
import { isAfterAcceptForm, type CollectionSurfaceTableRow } from "../../lib/scans/collection-surface-table-row";

const formRow: CollectionSurfaceTableRow = {
  id: "baseline:form", capturedAt: "", snapshot: { status: "unavailable" },
  form: { formRef: "form_0", structure: "native_form", surfaceType: "contact", title: "Contact", pageUrl: "https://example.test/", method: "post", actionRelationship: "same_site", candidateFieldCount: 1, retainedFieldCount: 1, fieldsTruncated: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [], fields: [] },
};

test("executive Forms tally includes both captured and structured After Accept observations", () => {
  for (const capturePhase of ["after_accept", "after_accept_click"] as const) {
    const rows = [0, 1].map(index => ({ ...formRow, id: `${capturePhase}:${index}`, capturePhase }));
    // Both single-page and full-site reports feed the same inventory card.
    const html = renderToStaticMarkup(<ReportInventorySummary metrics={[]} formCount={0} forms={rows.filter(isAfterAcceptForm)} />);
    const tile = html.slice(html.indexOf("group/forms"), html.indexOf("Observed forms"));
    assert.match(tile, />Forms</);
    assert.match(tile, />2</);
    assert.match(tile, /0 pre-consent · 2 after Accept click/);
  }
});

test("Forms tally adds post-Accept rows once to the baseline count", () => {
  const rows = [formRow, { ...formRow, id: "after_accept:form", capturePhase: "after_accept" as const }];
  for (const formCount of [1, undefined]) {
    const html = renderToStaticMarkup(<ReportInventorySummary metrics={[]} formCount={formCount} forms={rows} />);
    assert.match(html, /1 pre-consent · 1 after Accept click/);
    assert.equal((html.match(/>Contact</g) ?? []).length, 2);
    assert.match(html.slice(html.indexOf("group/forms"), html.indexOf("Observed forms")), />2</);
  }
});

test("inventory breakdown uses distinct counts rather than repeated events", () => {
  const html = renderToStaticMarkup(<ReportInventorySummary metrics={[{ label: "Network requests", value: 805, counts: {nonEssential:0,review:205,unclassified:296,contextual:304,essential:0}, overview: {identifiedServices:6,distinctResources:196,unattributedResources:145,distinctStorage:0,distinctEmbeds:3,distinctClassifications:{requests:{nonEssential:0,review:46,unclassified:74,contextual:76,essential:0},storage:{nonEssential:0,review:0,unclassified:0,contextual:0,essential:0},embeds:{nonEssential:0,review:0,unclassified:0,contextual:3,essential:0}}} }]} />);
  assert.match(html, /Services/);
  assert.match(html, />Requests</);
  assert.doesNotMatch(html.slice(0,html.indexOf('<details')), /805|Classification review/);
  assert.doesNotMatch(html, /805|205|296|304|Request events|Frame observations/);
  assert.match(html, /196/);
  assert.match(html, />46</);
  assert.match(html, /Classification review/);
  assert.doesNotMatch(html, /Unidentified does not mean tracking|resources without an identified service|Identified groups in this scan/);
  for (const color of ["rose", "amber", "slate", "sky", "blue"]) assert.match(html, new RegExp(`bg-${color}-${color === "slate" ? "400" : "500"}`));
  assert.doesNotMatch(html, /<details[^>]*open/);
});

test("inventory totals show non-essential and review classifications, including zero", () => {
  const html = renderToStaticMarkup(<ReportInventorySummary metrics={[
    { label: "Network requests", value: 12, counts: { nonEssential: 3, review: 2, contextual: 7, essential: 0 } },
    { label: "Cookies & storage", value: 4, counts: { nonEssential: 0, review: 1, contextual: 3, essential: 0 } },
    { label: "Embedded frames", value: 2, counts: { nonEssential: 0, review: 0, contextual: 2, essential: 0 } },
  ]} />);
  const tiles = html.slice(html.indexOf('aria-label="Inventory totals"'), html.indexOf('group/technical'));
  assert.match(tiles, /text-xs font-semibold">3<\/span> non-essential/);
  assert.match(tiles, /text-xs font-semibold">2<\/span> review/);
  assert.match(tiles, /text-xs font-semibold">1<\/span> review/);
  assert.equal((tiles.match(/non-essential/g) ?? []).length, 3);
  assert.equal((tiles.match(/review/g) ?? []).length, 3);
  assert.match(tiles, /bg-rose-500/);
  assert.match(tiles, /bg-amber-500/);
  assert.match(tiles, /text-xs font-semibold">0<\/span> non-essential/);
  assert.match(tiles, /text-xs font-semibold">0<\/span> review/);
  assert.match(tiles, /bg-slate-300/);
  assert.match(tiles, /flex-nowrap items-center gap-x-2 whitespace-nowrap/);
  assert.match(tiles, /grid-cols-1 divide-y divide-slate-200 md:grid-cols-3/);
});
test("all vendor identities remain available with bundled logos and bounded expansion", () => {
  const html = renderToStaticMarkup(<DetectedIntegrationVendors vendors={[{name:"Google Fonts"}]} inventoryNames={["Google Fonts", ...Array.from({length:47},(_,i)=>`Service ${i}`)]} />);
  assert.match(html, /vendor-logos\/google.png/);
  assert.match(html, /max-h-48 overflow-y-auto/);
  assert.match(html, /Service 46/);
  assert.match(html, /tabindex="0"/);
});
test("executive cards show only canonical privacy counts, concise states and evidence links", () => {
  const html = renderToStaticMarkup(<ReportRuntimeSummary cards={projectExecutiveRuntimeCards([
    {id:"pre_consent_cookies_storage",assessmentStatus:"checked",status:"Not observed"},
    {id:"third_party_iframe_pre_consent",assessmentStatus:"review_signal",status:"Review signal",retainedEvidence:{embeddedContentHosts:["www.facebook.com"],iframeObservationCount:805}},
  ])} />);
  assert.match(html, />0</);
  assert.match(html, /≥1/);
  assert.match(html, /Not confirmed/);
  assert.match(html, /Review needed/);
  assert.match(html, /href="#evidence"/);
  assert.doesNotMatch(html, /805|Classification review|Unknown purpose|Distinct count unavailable|compliance scores/);
});
test("missing assessments do not produce reassuring zero counts", () => {
  const html = renderToStaticMarkup(<ReportRuntimeSummary cards={projectExecutiveRuntimeCards([])} />);
  assert.equal((html.match(/Not confirmed/g) ?? []).length, 3);
  assert.doesNotMatch(html, />0</);
});


test("site inventory supplements the starting-page list without repeating names", () => {
  const html = renderToStaticMarkup(<DetectedIntegrationInventoryContext.Provider value={["Google Fonts", "Facebook", "Google Maps", "YouTube", "Google Static Assets"]}>
    <DetectedIntegrationVendors vendors={[{name:"Google Fonts"}, {name:"Facebook",purpose:"Embedded media"}]} inventoryNames={["Wrong scope"]} />
  </DetectedIntegrationInventoryContext.Provider>);
  assert.equal((html.match(/>Google Fonts</g) ?? []).length, 1);
  assert.equal((html.match(/>Facebook</g) ?? []).length, 1);
  for (const label of ["Google Maps", "YouTube", "Google Static Assets", "Other services · scanned inventory"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Wrong scope/);
});


test("overview, breakdown and legend keep the same terminology and order", () => {
  const metrics = [
    { label: "Embedded frames", value: 3 },
    { label: "Cookies & storage", value: 2 },
    { label: "Network requests", value: 196 },
  ];
  const html = renderToStaticMarkup(<ReportInventorySummary metrics={metrics} />);
  for (const fragment of [html.slice(html.indexOf('aria-label="Inventory totals"'), html.indexOf('group/technical')), html.slice(html.indexOf('group/technical'))]) {
    assert.ok(fragment.indexOf(">Requests<") < fragment.indexOf(">Cookies &amp; storage<"));
    assert.ok(fragment.indexOf(">Cookies &amp; storage<") < fragment.indexOf(">Embedded frames<"));
  }
  assert.doesNotMatch(html, /Network requests|Network resources/);
});
