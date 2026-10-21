import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { reportPdfDownloadHref, ReportPdfDownloadLink } from "./report-pdf-download-link";

test("PDF downloads preserve scope and branding while attaching a recognized client time zone", () => {
  const href = "/api/scans/scan-1/report-export?format=pdf&scope=full-site&branding=workspace&reviewFocus=gdpr_eprivacy";
  const resolved = new URL(reportPdfDownloadHref(href, "America/Los_Angeles"), "https://certscore.ai");
  assert.equal(resolved.searchParams.get("timeZone"), "America/Los_Angeles");
  for (const [key, value] of new URL(href, resolved).searchParams) assert.equal(resolved.searchParams.get(key), value);
  assert.equal(reportPdfDownloadHref(href, null), href);
  const markup = renderToStaticMarkup(<ReportPdfDownloadLink download href={href}>Download PDF</ReportPdfDownloadLink>);
  assert.match(markup, /download=""/);
  assert.doesNotMatch(markup, /timeZone=/);
});
