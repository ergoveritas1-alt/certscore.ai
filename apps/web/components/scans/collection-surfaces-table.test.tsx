import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionSurfacesTable, sortCollectionSurfaces, type FormSortKey, type CollectionSurfaceTableRow } from "./collection-surfaces-table";

const row: CollectionSurfaceTableRow = {
  id: "page:form", capturedAt: "2026-09-07T00:00:00Z", snapshot: { status: "available", url: "/api/scans/example/full-site?formPage=page&formRef=collection_form_0" },
  form: { formRef: "collection_form_0", structure: "native_form", surfaceType: "contact", title: "Contact us", pageUrl: "https://example.test/contact", method: "post", actionRelationship: "same_site", candidateFieldCount: 1, retainedFieldCount: 1, fieldsTruncated: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [], fields: [{ fieldRef: "email", elementType: "input", inputType: "email", semanticCategory: "email", label: "Your email", required: true, disabled: false, readOnly: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [] }] },
};
test("form rows expose page provenance, collapsed field details, and retained snapshot links", () => {
  const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[row, { ...row, id: "other-page:form", form: { ...row.form, pageUrl: "https://example.test/other" } }]} />);
  assert.match(html, /Form confidence/); assert.match(html, /100% · direct/); assert.match(html, /Evidence references/);
  assert.match(html, /Forms &amp; fields/); assert.match(html, /2 forms/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /hidden=""/);
  assert.match(html, /Your email/); assert.match(html, /https:\/\/example.test\/other/); assert.match(html, /View form: Contact us/);
});
test("missing, withheld, and unsafe snapshot URLs never become usable links", () => {
  for (const snapshot of [{ status: "unavailable" as const }, { status: "withheld" as const }, { status: "available" as const, url: "javascript:alert(1)" }]) {
    const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[{ ...row, snapshot }]} />);
    assert.doesNotMatch(html, /View form:|javascript:/);
  }
  const limited = renderToStaticMarkup(<CollectionSurfacesTable rows={[]} pagesWithoutInventory={2} limitedPages={1} />);
  assert.match(limited, /form coverage is incomplete/); assert.doesNotMatch(limited, /No forms were observed/);
});

test("key columns sort both ways without mutating input or sorting field counts as text", () => {
  const low: CollectionSurfaceTableRow = { ...row, id: "low", form: { ...row.form, title: "Alpha", surfaceType: "contact", retainedFieldCount: 2, method: "get", actionHostname: "a.test", pageUrl: "https://example.test/2" } };
  const high: CollectionSurfaceTableRow = { ...row, id: "high", snapshot: { status: "withheld" }, form: { ...row.form, title: "Zulu", surfaceType: "search", retainedFieldCount: 10, method: "post", actionHostname: "z.test", pageUrl: "https://example.test/10" } };
  const input = [high, low];
  for (const key of ["form", "type", "fields", "method", "destination", "page", "snapshot"] as FormSortKey[]) {
    assert.deepEqual(sortCollectionSurfaces(input, key, "asc").map(r => r.id), ["low", "high"], key);
    assert.deepEqual(sortCollectionSurfaces(input, key, "desc").map(r => r.id), ["high", "low"], key);
  }
  assert.deepEqual(input.map(r => r.id), ["high", "low"]);
});

test("field details follow retained page positions without changing stored evidence", async () => {
  const { fieldsInPageOrder } = await import("./collection-surfaces-table");
  const fields = [{ ...row.form.fields[0]!, fieldRef: "third", controlIndex: 3 }, { ...row.form.fields[0]!, fieldRef: "first", controlIndex: 1 }];
  assert.deepEqual(fieldsInPageOrder(fields).map(field => field.fieldRef), ["first", "third"]);
  assert.deepEqual(fields.map(field => field.fieldRef), ["third", "first"]);
  const legacy = fields.map(({ controlIndex, ...field }) => field);
  assert.deepEqual(fieldsInPageOrder(legacy), legacy);
});

test("loading inventory never announces zero forms", () => {
  const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[]} loading />);
  assert.match(html, /Loading form inventory/);
  assert.doesNotMatch(html, /0 forms/);
});

 test("form count marks active updates and removes the marker when scanning ends", () => {
  const active = renderToStaticMarkup(<CollectionSurfacesTable rows={[row]} scanning />);
  assert.match(active, /Updating as scan progresses/);
  const complete = renderToStaticMarkup(<CollectionSurfacesTable rows={[row]} scanning={false} />);
  assert.doesNotMatch(complete, /Updating as scan progresses|scan-hourglass-flip/);
  assert.match(complete, /1 form/);
});

test("retained toggle state and field warnings display without treating legacy missing state as off", () => {
 const field={...row.form.fields[0]!,inputType:"checkbox",controlKind:"switch" as const,checkedState:"checked" as const,review:{version:"collection-field-review.v1" as const,category:"operational" as const,preselectedMarketing:true}};
 const form={...row.form,fields:[field,{...field,fieldRef:"legacy",controlKind:"checkbox" as const,checkedState:undefined,review:undefined}]};
 const html=renderToStaticMarkup(<CollectionSurfacesTable rows={[{...row,form}]}/>);
 assert.match(html,/Checkboxes \/ toggles/);assert.match(html,/Preselected marketing opt-in/);assert.match(html,/>On</);assert.match(html,/Not captured/);
});

test("complete zero-form inventory renders only a single line", () => {
  const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[]} />);
  assert.match(html, /Forms: no forms observed on the scanned pages/);
  assert.doesNotMatch(html, /<table|<h2|Expand a form|0 forms/);
});

test("ordinary field classifications are neutral information, separate from findings and submission", () => {
  for (const category of ["identity_profile", "personal_contact", "free_text"] as const) {
    const field = { ...row.form.fields[0]!, review: { version: "collection-field-review.v1" as const, category, preselectedMarketing: false } };
    const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[{ ...row, form: { ...row.form, fields: [field] } }]} />);
    assert.match(html, /Field review information/);
    assert.doesNotMatch(html, /⚠|text-amber-700|text-rose-700/);
    assert.doesNotMatch(html, /Forms and fields observed on scanned pages|Field review identifies fields worth checking|Declared destination is the configured form action/);
  }
});

test("limited form inventory exposes retained counts and omitted fields instead of implying complete coverage", () => {
  const html = renderToStaticMarkup(<CollectionSurfacesTable limitedPages={1} rows={[{ ...row, form: { ...row.form, fieldsTruncated: true, candidateFieldCount: 21, retainedFieldCount: 20 } }]} />);
  assert.match(html, /20 of 21/);
  assert.match(html, /1 field\(s\) were omitted by the capture limit/);
  assert.match(html, /1 page\(s\) have limited form coverage/);
});

test("form disclosure stays collapsed, escapes text, and preserves form-specific sources", () => {
  const form = { ...row.form, privacyDisclosure: { version: 1 as const, truncated: false, excerpts: [{ text: "We process your data to handle your request. <script>unsafe</script>", association: "inside_form" as const, links: [{ label: "Privacy policy", url: "https://example.test/privacy" }] }] } };
  const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[{ ...row, form }]} />);
  assert.match(html, /Privacy disclosure/);
  assert.match(html, /We process your data to handle your request/);
  assert.match(html, /href="https:\/\/example.test\/privacy"/);
  assert.doesNotMatch(html, /<script>|<details[^>]*open/);
  const legacy = renderToStaticMarkup(<CollectionSurfacesTable rows={[row]} />);
  assert.match(legacy, /does not establish that a notice was absent/);
});


test("after-click form observations retain context without claiming consent or absent forms", () => {
  const html = renderToStaticMarkup(<CollectionSurfacesTable afterAcceptLimited rows={[{...row, capturePhase:"after_accept_click", captureLimited:true, snapshot:{status:"unavailable"}}]} />);
  assert.match(html,/After Accept click/);
  assert.match(html,/1 form observation/);
  assert.match(html,/does not establish consent registration/);
  assert.match(html,/Some forms or disclosures may not have been retained/);
  assert.doesNotMatch(html,/Snapshot unavailable|View form:/);
  assert.match(html,/aria-expanded="false"/);
  const empty=renderToStaticMarkup(<CollectionSurfacesTable afterAcceptLimited rows={[]} />);
  assert.doesNotMatch(empty,/No forms were observed|no forms observed/);
});
