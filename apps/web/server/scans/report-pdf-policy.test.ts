import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalReportExport } from "./report-export";
import { pdfPolicyEvidenceLines } from "./report-pdf-appendices";

function fixture() {
  return {
    appendix: {
      gdprTransparency: { scopeNote: "Persisted disclosure evidence.", rows: Array.from({ length: 11 }, (_, index) => ({
        id: `check-${index}`, label: `Disclosure ${index + 1}`, status: index < 7 ? "Observed" : "Not confirmed", rationale: `Reason for disclosure ${index + 1}`,
      })) },
      evidenceDossier: { checklistDetails: Array.from({ length: 11 }, (_, index) => ({
        id: `check-${index}`, topic: "policy", facts: [
          { label: "selectedPolicySectionUrl", value: "https://example.test/privacy" },
          { label: "evidenceText", value: `CLAUSE_${index} ${"Retained policy text. ".repeat(100)}FINAL_CLAUSE_${index}` },
          { label: "Policy provenance / documentOwnerEntity", value: "Example controller" },
          { label: "Policy provenance / retrievalTimestamp", value: "2026-10-20T23:18:34.000Z" },
        ],
      })) },
    },
  } as unknown as CanonicalReportExport;
}

test("policy appendix keeps every disclosure status, shares provenance and explicitly shortens visible excerpts", () => {
  const report = fixture();
  const before = structuredClone(report);
  const lines = pdfPolicyEvidenceLines(report, { text: text => [{ text: String(text) }], heading: text => ({ text }) });
  const text = lines.map(line => line.text).join("\n");
  assert.equal(text.split("https://example.test/privacy").length - 1, 1);
  assert.equal(text.split("Example controller").length - 1, 1);
  assert.match(text, /Excerpts below are shortened/);
  assert.match(text, /full passages, detailed checks and provenance remain in the JSON workpaper/);
  const rows = lines.filter(line => line.kind === "tableRow");
  assert.equal(rows.length, 11);
  rows.forEach((line, index) => {
    const cells = line.cells!.map(cell => cell.join(" "));
    assert.equal(cells[0], `Disclosure ${index + 1}`);
    assert.equal(cells[1], index < 7 ? "Observed" : "Not confirmed");
    assert.match(cells[2]!, /^S1\./);
    if (index < 7) {
      assert.match(cells[2]!, new RegExp(`Excerpt: CLAUSE_${index}`));
      assert.ok(cells[2]!.length < 200);
      assert.match(cells[2]!, /\.\.\.$/);
    } else {
      assert.match(cells[2]!, /does not establish absence/);
      assert.equal(line.flowGroup, "policy-coverage-limitations");
    }
  });
  assert.doesNotMatch(text, /FINAL_CLAUSE_/);
  assert.deepEqual(report, before);
});

test("policy source references do not attribute a second document's excerpt to the first source", () => {
  const report = fixture();
  report.appendix.evidenceDossier!.checklistDetails[1]!.facts[0]!.value = "https://example.test/second-policy";
  const lines = pdfPolicyEvidenceLines(report, { text: text => [{ text: String(text) }], heading: text => ({ text }) });
  const rows = lines.filter(line => line.kind === "tableRow");
  assert.match(rows[0]!.cells![2]!.join(" "), /^S1\./);
  assert.match(rows[1]!.cells![2]!.join(" "), /^S2\./);
  assert.ok(lines.some(line => line.text === "S2: https://example.test/second-policy"));
});
