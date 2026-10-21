import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalReportExport } from "./report-export";
import { pdfChoicePathEvidence } from "./report-pdf-appendices";

test("choice paths use one session summary and only actual request rows, without repeated per-vendor zeros", () => {
  const report = { scan: { id: "scan-1" }, projection: { unifiedFindings: [] }, appendix: {
    cookieAndTrackerInventory: { rows: [] }, evidenceDossier: { cmp: { audit: { rows: [{ supportingEvidence: { inventory: {
      consentStorage: [{ visit: "Accept", name: "ChoiceCookie", change: "stored" }, { visit: "Reject", name: "ChoiceCookie", change: "updated" }],
      choiceActivity: [
        { action: "accept", windowMs: 3000, requestCount: 0, nonEssentialRequestCount: 0, requests: [] },
        { action: "reject", windowMs: 346, requestCount: 1, nonEssentialRequestCount: 1, requests: [{ vendor: "Example", purpose: "analytics", hostname: "metrics.example.test", path: "/collect", msAfterClick: 71, nonEssential: true }] },
      ],
    } } }] } } },
  } } as unknown as CanonicalReportExport;
  const before = structuredClone(report);
  const layout = { text: (text: unknown) => [{ text: String(text) }], heading: (text: string) => ({ text }) };
  const lines = pdfChoicePathEvidence(report, layout);
  assert.equal(lines.filter(line => line.text === "Accept / Reject results").length, 1);
  assert.ok(lines.every(line => line.flowGroup === "consent-choice-results"));
  const summary = lines.filter(line => line.tableId === "choice-path-summary" && line.kind === "tableRow");
  assert.equal(summary.length, 2);
  assert.equal(summary[0]!.cells![2]!.join(" "), "3 s");
  assert.equal(summary[1]!.cells![2]!.join(" "), "0.346 s");
  const requests = lines.filter(line => line.tableId === "choice-path-requests" && line.kind === "tableRow");
  assert.equal(requests.length, 1);
  assert.match(requests[0]!.text, /Reject.*metrics.example.test\/collect.*71 ms after click/);
  assert.doesNotMatch(lines.map(line => line.text).join(" "), /0 displayed requests|Choice-state request comparison/);
  assert.match(lines.map(line => line.text).join(" "), /not a vendor-by-vendor pass/);
  assert.deepEqual(report, before);
});
