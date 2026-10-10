import assert from "node:assert/strict";
import test from "node:test";
import { apiFormSnapshotExport } from "./form-snapshot-export";
import { buildReportDisplayExport } from "./report-display-export";

const scanId = "9ba99a8c-b1ad-44c1-985f-92cef760ab40";
const pageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("pre-consent, registered Accept and unconfirmed Accept click fields retain their phase and API image follow-ups", () => {
  const phases = ["pre_consent", "after_accept", "after_accept_click"];
  const rows = ["collection_form_0", "after_accept:collection_form_1", "after_accept:collection_form_2"].map((ref, index) => ({
    id: ref, capturePhase: phases[index],
    form: { formRef: `collection_form_${index}`, fields: [{ fieldRef: "email", semanticCategory: "email" }] },
    snapshot: { status: "available", url: `/api/scans/${scanId}/form-snapshot?formRef=${encodeURIComponent(ref)}` },
  }));
  const report = { scan: { id: scanId }, collectionTableRows: rows, collectionSurfaces: [{ title: "Newsletter" }] };
  const original = structuredClone(report);
  const output = buildReportDisplayExport(report) as any;
  for (const [index, row] of output.collectionTableRows.entries()) {
    const url = new URL(row.snapshot.url);
    assert.equal(url.pathname, `/api/v2/scans/${scanId}/report-evidence/form-snapshot`);
    assert.equal(url.searchParams.get("formRef"), rows[index]!.id);
    assert.equal(url.searchParams.has("formPage"), false);
    assert.equal(row.snapshot.mediaType, "image/jpeg");
    assert.match(row.snapshot.retrieval, /same API read bearer credential/);
    assert.deepEqual(row.form.fields, rows[index]!.form.fields);
    assert.equal(row.capturePhase, rows[index]!.capturePhase);
  }
  assert.deepEqual(output.collectionSurfaces, report.collectionSurfaces);
  assert.deepEqual(report, original);
});

test("API snapshot exports preserve full-site identity and unavailable image states", () => {
  const exported = apiFormSnapshotExport(scanId, { status: "available",
    url: `/api/scans/${scanId}/full-site?formPage=${pageId}&formRef=collection_form_0` }, { requirePage: true });
  const url = new URL(exported.url!);
  assert.equal(url.searchParams.get("formPage"), pageId);
  assert.equal(url.searchParams.get("formRef"), "collection_form_0");
  for (const status of ["withheld", "unavailable"]) {
    const snapshot = { status, reason: "review_withheld" };
    assert.equal(apiFormSnapshotExport(scanId, snapshot), snapshot);
  }
});

test("malformed, cross-scan and foreign snapshot references cannot become API links", () => {
  for (const url of [
    "/bad", `https://foreign.example/api/scans/${scanId}/form-snapshot?formRef=collection_form_0`,
    `/api/scans/${pageId}/form-snapshot?formRef=collection_form_0`,
    `/api/scans/${scanId}/form-snapshot?formRef=unknown`,
    `/api/scans/${scanId}/form-snapshot?formRef=collection_form_0&formRef=collection_form_1`,
    `/api/scans/${scanId}/full-site?formRef=collection_form_0`,
    `/api/scans/${scanId}/full-site?formPage=${pageId}&formRef=after_accept:collection_form_0`,
  ]) assert.throws(() => apiFormSnapshotExport(scanId, { status: "available", url }), /Invalid retained/);
  assert.throws(() => apiFormSnapshotExport(scanId, { status: "available",
    url: `/api/scans/${scanId}/form-snapshot?formRef=collection_form_0` }, { requirePage: true }), /Invalid retained/);
});
