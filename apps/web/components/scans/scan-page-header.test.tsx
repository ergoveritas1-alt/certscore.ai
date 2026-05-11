import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanPageHeader } from "./scan-page-header";

test("ScanPageHeader can override completed status for incomplete coverage", () => {
  const html = renderToStaticMarkup(
    createElement(ScanPageHeader, {
      status: "completed",
      statusLabel: "Incomplete",
      statusTone: "warning",
      title: "Scan: latimes.com"
    })
  );

  assert.match(html, /Incomplete/);
  assert.doesNotMatch(html, />Completed</);
});
