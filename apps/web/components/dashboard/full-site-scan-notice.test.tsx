import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FullSiteScanNotice } from "./full-site-scan-notice";

const scan = { scanId: "83375a0d-9974-4151-9253-65e37283db2d", hostname: "example.com", status: "running", homepageStatus: "completed", region: "eu-west-1", startedAt: "2026-09-07T00:50:00Z", limits: { maxPages: 10, concurrency: 4, waitSeconds: 5 }, earlierResults: [] };
test("active full-site scan confirms email and leaves a report link", () => {
  const html = renderToStaticMarkup(<FullSiteScanNotice scan={scan} />);
  assert.match(html, /In progress/);
  assert.match(html, /email you when the full-site scan is complete/);
  assert.match(html, /href="\/app\/scans\/83375a0d/);
});
test("homepage failure cannot display a running confirmation", () => {
  const html = renderToStaticMarkup(<FullSiteScanNotice scan={{ ...scan, status: "waiting_homepage", homepageStatus: "failed" }} />);
  assert.match(html, /could not finish/i);
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

test("scan summary shows recorded settings without earlier results", () => {
 const html = renderToStaticMarkup(<FullSiteScanNotice scan={scan} />);
 for (const text of ["Ireland", "10 pages", "4 pages", "5 sec", "5:50 PM PDT"]) assert.ok(html.includes(text), text);
 assert.doesNotMatch(html, /Earlier results|Homepage report/);
});

test("storage failure explains recovery inline without sending users to a dead end", () => {
 const html = renderToStaticMarkup(<FullSiteScanNotice scan={{...scan, homepageStatus: "failed", errorMessage:"connect ECONNREFUSED 127.0.0.1:9000"}} />);
 for (const text of ["Evidence storage was unavailable", "not a problem found on the website", "will not resume automatically", 'href="#scan-a-site"']) assert.ok(html.includes(text));
 assert.doesNotMatch(html, /View details|ECONNREFUSED/);
});

test("report header links back to Overview without a self-link", () => {
 const html = renderToStaticMarkup(<FullSiteScanNotice scan={scan} reportPage />);
 assert.ok(html.includes('href="/app"'));
 assert.match(html, /<h1/);
 assert.doesNotMatch(html, /View details/);
});

test("missing dispatch configuration is terminal and preserves the homepage explanation", () => {
  const html = renderToStaticMarkup(<FullSiteScanNotice scan={{ ...scan, status: "stopped", errorMessage: "dispatch_queue_unavailable" }} reportPage />);
  assert.match(html, /Additional page scans could not start/);
  assert.match(html, /homepage results below are retained/);
  assert.match(html, /will not resume/);
  assert.doesNotMatch(html, /In progress|email you when/);
});
