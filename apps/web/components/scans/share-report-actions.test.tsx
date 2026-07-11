import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildVisualEvidenceRetryHref,
  ShareReportActions,
  VISUAL_EVIDENCE_RETRY_DELAYS_MS
} from "./share-report-actions";

test("monitor action is hidden by default and shown only when access is granted", () => {
  const hidden = renderToStaticMarkup(createElement(ShareReportActions, {
    domainLabel: "example.com",
    scanId: "scan-1"
  }));
  const visible = renderToStaticMarkup(createElement(ShareReportActions, {
    domainLabel: "example.com",
    scanId: "scan-1",
    showMonitorSite: true
  }));

  assert.doesNotMatch(hidden, /Monitor this site/);
  assert.match(visible, /Monitor this site/);
});

test("visual evidence retries use bounded backoff for transient artifact-read races", () => {
  assert.deepEqual(VISUAL_EVIDENCE_RETRY_DELAYS_MS, [1_000, 2_000, 4_000, 8_000, 15_000]);
});

test("visual evidence retry URLs bypass a cached failed image response", () => {
  assert.equal(
    buildVisualEvidenceRetryHref("/api/scans/scan-1/visual-evidence/image-1", 2),
    "/api/scans/scan-1/visual-evidence/image-1?visualEvidenceAttempt=2"
  );
  assert.equal(
    buildVisualEvidenceRetryHref("/api/scans/scan-1/visual-evidence/image-1?variant=full", 3),
    "/api/scans/scan-1/visual-evidence/image-1?variant=full&visualEvidenceAttempt=3"
  );
});

test("visual evidence modal hides broken image output and provides manual recovery", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("apps/web/components/scans/share-report-actions.tsx", "utf8")
  );

  assert.match(source, /onError=\{handleVisualEvidenceLoadError\}/);
  assert.match(source, /The captured image is temporarily unavailable\./);
  assert.match(source, />\s*Try again\s*</);
  assert.match(source, /buildVisualEvidenceRetryHref\(visualEvidenceHref, visualEvidenceLoadAttempt\)/);
});
