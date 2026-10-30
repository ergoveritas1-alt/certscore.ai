import React from "react";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportPdfAccessProvider, ShadowReportShareMenu } from "./shadow-report-actions";

function markup(allowed: boolean, fullSite = false) {
  return renderToStaticMarkup(<ReportPdfAccessProvider allowed={allowed}>
    <ShadowReportShareMenu reportUrl="/scan/scan-1?reviewFocus=ccpa_cpra" scanId="scan-1" siteLabel="example.test" fullSite={fullSite} />
  </ReportPdfAccessProvider>);
}

test("the existing Share menu emails the same workspace-aware PDF link it downloads", () => {
  const html = markup(true, true);
  const mailto = html.match(/href="(mailto:[^"]+)"/)![1]!.replaceAll("&amp;", "&");
  const body = new URL(mailto).searchParams.get("body")!;
  assert.match(body, /https:\/\/certscore.ai\/scan\/scan-1\?reviewFocus=ccpa_cpra/);
  assert.match(body, /workspace header \(sign-in and workspace access required\)/);
  assert.match(body, /format=pdf&reviewFocus=gdpr_eprivacy&scope=full-site/);
  assert.match(html, /Download full-site PDF/);
  assert.doesNotMatch(body, /branding=|organizationId=|workspaceId=/);
});

test("public or regular viewers keep lightweight sharing without an unavailable PDF link", () => {
  const html = markup(false);
  const mailto = html.match(/href="(mailto:[^"]+)"/)![1]!.replaceAll("&amp;", "&");
  const body = new URL(mailto).searchParams.get("body")!;
  assert.match(body, /CertScore.ai scan report/);
  assert.doesNotMatch(body, /format=pdf|workspace header/);
  assert.doesNotMatch(html, /Download PDF report/);
});

test("Share menus retain the report downloads without tracking workpaper options", () => {
  for (const fullSite of [false, true]) {
    const html = markup(true, fullSite);
    assert.match(html, /format=pdf/);
    assert.match(html, /format=docx/);
    assert.match(html, /reviewFocus=ccpa_cpra/);
    assert.match(html, /Download (?:full-site )?Word report \(DOCX\)|Download full-site Word \(DOCX\)/);
    assert.doesNotMatch(html, /format=json|Download JSON/);
    assert.doesNotMatch(html, /Download tracking|format=csv|workpaper=tracking/);
  }
});

test("authenticated scan pages no longer add a workspace banner or separate white-label button", async () => {
  const report = await readFile(new URL("./shadow-scan-report.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../../../app/app/scans/[scanId]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(report, /WorkspaceReportBrand|Download white-label PDF/);
  assert.doesNotMatch(page, /getWorkspaceReportBranding|branding=/);
  assert.match(report, /ReportPdfAccessProvider allowed=\{canExportPdf\}/);
});
