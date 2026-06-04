import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanPageHeader } from "./scan-page-header";

test("ScanPageHeader can override completed status for limited coverage", () => {
  const html = renderToStaticMarkup(
    createElement(ScanPageHeader, {
      status: "completed",
      statusLabel: "Limited",
      statusTone: "info",
      title: "Scan: latimes.com"
    })
  );

  assert.match(html, /Limited/);
  assert.doesNotMatch(html, />Completed</);
});

test("ScanPageHeader places scan source badge between status and created timestamp", () => {
  const html = renderToStaticMarkup(
    createElement(ScanPageHeader, {
      createdAtLabel: "Created Jun 4, 2026, 8:13 AM PDT",
      scanFromLabel: "EU",
      scanFromValue: "eu",
      status: "completed",
      statusLabel: "Limited",
      statusTone: "info",
      title: "Scan: example.edu"
    })
  );

  assert.match(html, /Scan source/);
  assert.doesNotMatch(html, /Scanned from/);
  assert.doesNotMatch(html, />EU</);
  assert.ok(html.indexOf("Limited") < html.indexOf("Scan source: EU"));
  assert.ok(html.indexOf("Scan source: EU") < html.indexOf("Created Jun 4, 2026"));
});
