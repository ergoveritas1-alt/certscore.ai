import assert from "node:assert/strict";
import test from "node:test";
import { buildReportEmailText } from "./report-email-content";

test("report email retains the scan link and adds the canonical summary and PDF link", () => {
  const text = buildReportEmailText({
    domainLabel: "example.\u200Bcom",
    executiveSummary: [
      "The retained evidence indicates targeted review priority.",
      "One review signal was retained.",
      "This is not legal advice.",
    ],
    pdfUrl: "https://certscore.ai/api/scans/scan-1/report-export?format=pdf",
    reportUrl: "https://certscore.ai/scan/scan-1",
  });

  assert.match(text, /https:\/\/certscore\.ai\/scan\/scan-1/);
  assert.match(text, /Executive summary/);
  assert.match(text, /targeted review priority/);
  assert.match(text, /Download the detailed PDF report/);
  assert.match(text, /format=pdf/);
  assert.match(text, /not a determination of legal compliance or legal advice/i);
});
