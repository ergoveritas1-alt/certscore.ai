import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreClient } from "./client.js";
import { reconstructReportEvidencePages } from "./detailed-evidence.js";
import type { ReportEvidencePage } from "./types.js";

const scanId = "9ba99a8c-b1ad-44c1-985f-92cef760ab40";
function page(entries: ReportEvidencePage["entries"], changes: Partial<ReportEvidencePage> = {}): ReportEvidencePage {
  return { type: "certscore_report_evidence_page", version: 1, scanId, snapshot: "a".repeat(64), section: "cmp",
    reportUrl: `https://certscore.ai/scan/${scanId}`, entries,
    pagination: { offset: 0, returned: entries.length, total: entries.length, complete: true, nextCursor: null },
    coverage: { scope: "public_report_projection", exportTruncated: false, observationCompleteness: "see_report_coverage", exclusions: [] }, reconstruction: "JSON Pointer entries", ...changes };
}
test("reconstruction preserves Unicode, escaped keys, arrays and shared evidence records", () => {
  const result = reconstructReportEvidencePages([page([
    { path: "", value: {} }, { path: "/rows", value: [] }, { path: "/rows/0", value: { status: "Not assessed", sourceHash: "retained" } },
    { path: "/rows/1", value: { reportContentRef: "/rows/0" } }, { path: "/a~1b~0c", value: {} },
    { path: "/a~1b~0c/0", value: "first 🧪", stringPart: 0, stringParts: 2 },
    { path: "/a~1b~0c/0", value: " second", stringPart: 1, stringParts: 2 },
  ])]);
  assert.deepEqual(result.rows, [{ status: "Not assessed", sourceHash: "retained" }, { status: "Not assessed", sourceHash: "retained" }]);
  assert.deepEqual(result["a/b~c"], { "0": "first 🧪 second" });
});
test("incomplete, mixed or malicious evidence snapshots fail closed", () => {
  const valid = page([{ path: "", value: {} }]);
  for (const invalid of [
    { ...valid, pagination: { ...valid.pagination, complete: false } },
    { ...valid, entries: [{ path: "", value: {} }, { path: "/__proto__/polluted", value: true }], pagination: { offset: 0, returned: 2, total: 2, complete: true, nextCursor: null } },
    page([{ path: "", value: { bad: { reportContentRef: "/missing" } } }]),
    page([{ path: "", value: { bad: { reportContentRef: "/bad" } } }]),
    page([{ path: "", value: {} }, { path: "/text", value: "half", stringPart: 0, stringParts: 2 }]),
    page([{ path: "", value: {} }, { path: "", value: {} }]),
  ]) assert.throws(() => reconstructReportEvidencePages([invalid]));
  assert.equal(({} as any).polluted, undefined);
});
test("typed SDK evidence read preserves section and snapshot through bounded pagination without creating a scan", async () => {
  const first = page([{ path: "", value: {} }], { pagination: { offset: 0, returned: 1, total: 2, complete: false, nextCursor: "next" } });
  const last = page([{ path: "/detailedEvidence", value: { version: "certscore.detailed-evidence.v1", scanId, sections: [], interpretation: "Retained results" } }],
    { pagination: { offset: 1, returned: 1, total: 2, complete: true, nextCursor: null } });
  const original = globalThis.fetch, calls: string[] = [];
  globalThis.fetch = async (input) => { calls.push(String(input)); return new Response(JSON.stringify(calls.length === 1 ? first : last), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const result = await new CertScoreClient({ baseUrl: "https://certscore.ai", apiKey: "test-key" }).getReportEvidence(scanId, { section: "cmp" });
    assert.equal(result.detailedEvidence?.scanId, scanId);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(url => new URL(url).pathname.endsWith("/report-evidence") && new URL(url).searchParams.get("section") === "cmp"));
    assert.equal(new URL(calls[1]!).searchParams.get("cursor"), "next");
  } finally { globalThis.fetch = original; }
});
test("SDK evidence reads reject selector drift and stop at the caller's page bound", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(page([{ path: "", value: {} }], { section: "cms" })), { status: 200 });
    const client = new CertScoreClient({ apiKey: "test-key" });
    await assert.rejects(client.getReportEvidence(scanId, { section: "cmp" }), /Mismatched/);
    globalThis.fetch = async () => new Response(JSON.stringify(page([{ path: "", value: {} }], { pagination: { offset: 0, returned: 1, total: 2, complete: false, nextCursor: "next" } })), { status: 200 });
    await assert.rejects(client.getReportEvidence(scanId, { section: "cmp", maxPages: 1 }), /maxPages/);
  } finally { globalThis.fetch = original; }
});
