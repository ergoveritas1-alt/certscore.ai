import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { attachInventoryPolicyDisclosure } from "../../lib/scans/single-page-resource-inventory";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { reportRequestScanFixture } from "./report-forms.fixture";
import type { ReportPhaseInventories } from "../../components/scans/report-lab/shadow-report-data";

Object.assign(globalThis, { React });
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

test("completed report streams its overview before policy disclosure and preserves the verified inventory", { timeout: 10_000 }, async () => {
  const { ShadowScanReport } = await import("../../components/scans/report-lab/shadow-scan-report");
  const scan = reportRequestScanFixture();
  const report = buildTimelineReportModel(scan);
  assert.ok("findings" in report && report.resourceInventory);
  const documents = [{
    url: "https://example.test/privacy", text: "We use Stripe to process payments.", sha256: "a".repeat(64),
    complete: true, capturedAt: "2026-10-21T23:18:00Z",
  }];
  const eager = buildTimelineReportModel(scan, documents);
  assert.ok("findings" in eager);
  const resourceInventory = attachInventoryPolicyDisclosure(report.resourceInventory, documents);
  assert.deepEqual(resourceInventory, eager.resourceInventory);
  assert.deepEqual(report.score, eager.score);
  assert.deepEqual(report.californiaScore, eager.californiaScore);
  assert.deepEqual(report.findings, eager.findings);
  assert.ok(resourceInventory.services.some(item => item.context.policy.status === "mentioned"));
  assert.equal(attachInventoryPolicyDisclosure(report.resourceInventory, []), report.resourceInventory);
  assert.ok(report.resourceInventory.services.every(item => item.context.policy.status === "unknown"));

  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  for (const reviewFocus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const deferred = pending<ReportPhaseInventories>();
    const destination = new PassThrough();
    let html = "";
    const shell = pending<string>();
    const done = pending<void>();
    destination.setEncoding("utf8");
    destination.on("data", chunk => {
      html += chunk;
      if (html.includes("Loading retained resource evidence")) shell.resolve(html);
    });
    destination.once("end", done.resolve);
    const stream = renderToPipeableStream(
      <AppRouterContext.Provider value={router}>
        <PathnameContext.Provider value="/app/scans/fixture">
          <ShadowScanReport mode="authenticated" variant="timeline" reviewFocus={reviewFocus}
            report={report} phaseInventories={deferred.promise} />
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
      { onShellReady() { stream.pipe(destination); }, onError(error) { shell.reject(error); } },
    );
    try {
      const firstHtml = await shell.promise;
      assert.match(firstHtml, /Executive overview/);
      assert.match(firstHtml, /Findings and review items/);
      assert.doesNotMatch(firstHtml, /Policy disclosure for Stripe/);
      deferred.resolve({ resourceInventory, actionInventories: report.actionInventories });
      await done.promise;
      assert.ok(html.includes('aria-label="Policy disclosure for Stripe.js: Mentioned"'));
      assert.ok(html.includes("We use Stripe to process payments."));
    } finally {
      stream.abort();
      destination.destroy();
    }
  }
});
