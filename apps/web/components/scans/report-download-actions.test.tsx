import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDownloadActions } from "./report-download-actions";

test("report downloads use the compact icon-action treatment", () => {
  const markup = renderToStaticMarkup(createElement(ReportDownloadActions, { scanId: "scan-1" }));

  assert.match(markup, /aria-label="Download report \(PDF\)"/);
  assert.match(markup, /aria-label="Download JSON report"/);
  assert.match(markup, /inline-flex h-10 w-10/);
  assert.match(markup, /Download report \(PDF\)/);
  assert.match(markup, /Download JSON/);
  assert.doesNotMatch(markup, />Download PDF<\/a>/);
  assert.doesNotMatch(markup, />Download JSON<\/a>/);
});
