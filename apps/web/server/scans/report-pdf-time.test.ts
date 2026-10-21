import assert from "node:assert/strict";
import test from "node:test";
import { pdfLocalDate, pdfTimeZone } from "./report-pdf-time";

test("PDF timestamps use the recognized viewer zone with daylight-saving labels and an explicit UTC fallback", () => {
  assert.equal(pdfTimeZone(), "UTC");
  assert.equal(pdfTimeZone("America/Los_Angeles"), "America/Los_Angeles");
  assert.equal(pdfTimeZone("unknown/zone"), null);
  assert.equal(pdfTimeZone("x".repeat(101)), null);
  assert.equal(pdfLocalDate("2026-10-20T21:30:58.310Z", "America/Los_Angeles"), "20 Oct 2026, 14:30 PDT");
  assert.equal(pdfLocalDate("2026-01-20T21:30:58.310Z", "America/Los_Angeles"), "20 Jan 2026, 13:30 PST");
  assert.match(pdfLocalDate("2026-10-20T21:30:58.310Z"), /21:30 UTC$/);
  assert.equal(pdfLocalDate("not-a-date"), "Unavailable");
});
