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

test("ScanPageHeader places scan source badge above the created timestamp row", () => {
  const html = renderToStaticMarkup(
    createElement(ScanPageHeader, {
      createdAtLabel: "Created Jun 4, 2026, 8:13 AM PDT (scan time: 5 sec)",
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
  assert.match(
    html,
    /<\/div><div class="flex flex-wrap items-center gap-1\.5 text-sm font-normal text-slate-400">Created Jun 4, 2026, 8:13 AM PDT \(scan time: 5 sec\)<\/div>/
  );
});
