import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionSurfacesTable, sortCollectionSurfaces, type FormSortKey, type CollectionSurfaceTableRow } from "./collection-surfaces-table";

const row: CollectionSurfaceTableRow = {
  id: "page:form", capturedAt: "2026-09-07T00:00:00Z", snapshot: { status: "available", url: "/api/scans/example/full-site?formPage=page&formRef=collection_form_0" },
  form: { formRef: "collection_form_0", structure: "native_form", surfaceType: "contact", title: "Contact us", pageUrl: "https://example.test/contact", method: "post", actionRelationship: "same_site", candidateFieldCount: 1, retainedFieldCount: 1, fieldsTruncated: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [], fields: [{ fieldRef: "email", elementType: "input", inputType: "email", semanticCategory: "email", label: "Your email", required: true, disabled: false, readOnly: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [] }] },
};
test("form rows expose page provenance, collapsed field details, and retained snapshot links", () => {
  const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[row, { ...row, id: "other-page:form", form: { ...row.form, pageUrl: "https://example.test/other" } }]} />);
  assert.match(html, /Collection surfaces \(forms\)/); assert.match(html, /2 forms/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /hidden=""/);
  assert.match(html, /Your email/); assert.match(html, /https:\/\/example.test\/other/); assert.match(html, /View form: Contact us/);
});
test("missing, withheld, and unsafe snapshot URLs never become usable links", () => {
  for (const snapshot of [{ status: "unavailable" as const }, { status: "withheld" as const }, { status: "available" as const, url: "javascript:alert(1)" }]) {
    const html = renderToStaticMarkup(<CollectionSurfacesTable rows={[{ ...row, snapshot }]} />);
    assert.doesNotMatch(html, /View form:|javascript:/);
  }
  const limited = renderToStaticMarkup(<CollectionSurfacesTable rows={[]} pagesWithoutInventory={2} limitedPages={1} />);
  assert.match(limited, /Missing evidence does not establish/); assert.doesNotMatch(limited, /No forms were observed/);
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
