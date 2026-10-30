import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { reportDocumentDownloadHref, ReportDocumentDownloadLink } from "./report-document-download-link";
import { ShadowReportShareMenu as LegacyShareMenu } from "../scanso2/report-lab/shadow-report-actions";
import { ReportDownloadActions as LegacyDownloads } from "../scanso2/report-download-actions";

test("Word downloads retain California focus and full-site scope while attaching the browser time zone", () => {
  const href = "/api/scans/scan-1/report-export?format=docx&reviewFocus=ccpa_cpra&scope=full-site";
  const url = new URL(reportDocumentDownloadHref(href, "Pacific/Honolulu"), "https://certscore.ai");
  assert.equal(url.searchParams.get("format"), "docx"); assert.equal(url.searchParams.get("reviewFocus"), "ccpa_cpra");
  assert.equal(url.searchParams.get("scope"), "full-site"); assert.equal(url.searchParams.get("timeZone"), "Pacific/Honolulu");
  assert.equal(reportDocumentDownloadHref(href, null), href);
  assert.match(renderToStaticMarkup(<ReportDocumentDownloadLink href={href} download>Download Word report (DOCX)</ReportDocumentDownloadLink>), /download=""/);
});

test("legacy report menus and icon actions also replace JSON with Word", () => {
  const menu = renderToStaticMarkup(<LegacyShareMenu reportUrl="/scan/scan-1?reviewFocus=ccpa_cpra" scanId="scan-1" siteLabel="example.test" fullSite />);
  assert.match(menu, /format=docx&amp;reviewFocus=ccpa_cpra&amp;scope=full-site/);
  assert.match(menu, /Download full-site Word \(DOCX\)/);
  const icons = renderToStaticMarkup(<LegacyDownloads scanId="scan-1" />);
  assert.match(icons, /Download Word report \(DOCX\)/);
  assert.doesNotMatch(menu + icons, /format=json|Download JSON|format=pdf/);
});
