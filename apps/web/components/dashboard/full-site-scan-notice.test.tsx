import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FullSiteScanNotice } from "./full-site-scan-notice";

const scan = { scanId: "83375a0d-9974-4151-9253-65e37283db2d", hostname: "example.com", status: "running", homepageStatus: "completed" };
test("active full-site scan confirms email and leaves a report link", () => {
  const html = renderToStaticMarkup(<FullSiteScanNotice scan={scan} />);
  assert.match(html, /Full-site scan in progress/);
  assert.match(html, /email you when the full-site scan is complete/);
  assert.match(html, /href="\/app\/scans\/83375a0d/);
});
test("homepage failure cannot display a running confirmation", () => {
  const html = renderToStaticMarkup(<FullSiteScanNotice scan={{ ...scan, status: "waiting_homepage", homepageStatus: "failed" }} />);
  assert.match(html, /couldn’t finish/);
  assert.doesNotMatch(html, /email you|in progress/);
});
test("terminal crawl replaces progress with the report action", () => {
  const html = renderToStaticMarkup(<FullSiteScanNotice scan={{ ...scan, status: "completed" }} />);
  assert.match(html, /View report/);
  assert.doesNotMatch(html, /in progress|email you when/);
});
test("stopped and unknown crawls do not claim to be running", () => {
  assert.doesNotMatch(renderToStaticMarkup(<FullSiteScanNotice scan={{ ...scan, status: "stopped" }} />), /in progress/);
  assert.equal(renderToStaticMarkup(<FullSiteScanNotice scan={{ ...scan, status: "unknown" }} />), "");
});
