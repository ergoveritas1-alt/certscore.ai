import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AgentSummaryActions,
  buildMcpEvidenceInvocation,
  buildSdkEvidenceSnippet,
  calculateVisualEvidenceFit,
  buildVisualEvidenceRetryHref,
  ShareReportActions,
  VISUAL_EVIDENCE_MAX_ZOOM,
  VISUAL_EVIDENCE_MIN_ZOOM,
  VISUAL_EVIDENCE_RETRY_DELAYS_MS
} from "./share-report-actions";

test("scan-report share actions do not expose the retired monitor action", async () => {
  const markup = renderToStaticMarkup(createElement(ShareReportActions, {
    domainLabel: "example.com",
    scanId: "scan-1"
  }));
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("apps/web/components/scans/share-report-actions.tsx", "utf8")
  );

  assert.doesNotMatch(markup, /Monitor this site/);
  assert.doesNotMatch(source, /showMonitorSite|MonitorIcon|Monitor this site/);
});

test("copy-link tooltip anchors from the left edge so its label is not clipped", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("apps/web/components/scans/share-report-actions.tsx", "utf8")
  );

  assert.match(source, /<IconTooltip align="start" label=\{copyState === "copied" \? "Report URL copied" : "Copy link to report"\}/);
});

test("visual evidence retries use bounded backoff for transient artifact-read races", () => {
  assert.deepEqual(VISUAL_EVIDENCE_RETRY_DELAYS_MS, [1_000, 2_000, 4_000, 8_000, 15_000]);
});

test("visual evidence zoom supports detailed inspection up to 1000%", () => {
  assert.equal(VISUAL_EVIDENCE_MIN_ZOOM, 0.5);
  assert.equal(VISUAL_EVIDENCE_MAX_ZOOM, 10);
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
  assert.equal(
    buildVisualEvidenceRetryHref("/api/scans/scan-1/visual-evidence/image-1", 0, 4),
    "/api/scans/scan-1/visual-evidence/image-1?visualEvidenceAttempt=0&visualEvidenceRefresh=4"
  );
});

test("visual evidence zoom uses a measured fit size for tall and wide captures", () => {
  assert.deepEqual(
    calculateVisualEvidenceFit({
      containerWidth: 1_000,
      naturalHeight: 10_000,
      naturalWidth: 2_000,
      viewportHeight: 1_000
    }),
    { height: 720, width: 144 }
  );
  assert.deepEqual(
    calculateVisualEvidenceFit({
      containerWidth: 1_000,
      naturalHeight: 600,
      naturalWidth: 1_200,
      viewportHeight: 1_000
    }),
    { height: 484, width: 968 }
  );
});

test("visual evidence modal hides broken image output and provides manual recovery", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("apps/web/components/scans/share-report-actions.tsx", "utf8")
  );

  assert.match(source, /onError=\{handleVisualEvidenceLoadError\}/);
  assert.match(source, /The captured image is temporarily unavailable\./);
  assert.match(source, />\s*Try again\s*</);
  assert.match(source, /buildVisualEvidenceRetryHref\(visualEvidenceHref, visualEvidenceLoadAttempt, visualEvidenceRefreshToken\)/);
  assert.match(source, /Force refresh captured image/);
  assert.match(source, /setVisualEvidenceRefreshToken\(\(value\) => value \+ 1\)/);
});

test("withheld visual evidence renders a compact blocked-capture control", async () => {
  const markup = renderToStaticMarkup(createElement(ShareReportActions, {
    domainLabel: "example.com",
    scanId: "scan-1",
    visualEvidenceWithheldReason: "sensitive_visual_content"
  }));

  assert.match(markup, /aria-label="Captured image unavailable"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /Screenshot withheld/);
  assert.doesNotMatch(markup, /visual safety check|sensitive or explicit/);
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /View captured image/);

  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("apps/web/components/scans/share-report-actions.tsx", "utf8")
  );
  assert.match(source, /onClick=\{\(\) => setIsWithheldNoticeOpen\(true\)\}/);
  assert.match(source, /Image was not retained\./);
});

test("agent summary exposes canonical API, SDK, and MCP evidence actions", () => {
  const markup = renderToStaticMarkup(createElement(AgentSummaryActions, {
    domainLabel: "cnn.com",
    scanId: "scan-123"
  }));

  assert.match(markup, /View Pulse page/);
  assert.match(markup, /Copy Pulse JSON URL/);
  assert.match(markup, /Copy Pulse Markdown URL/);
  assert.match(markup, /Copy Evidence JSON URL/);
  assert.match(markup, /Copy Full Pulse JSON URL/);
  assert.match(markup, /Copy SDK evidence example/);
  assert.match(markup, /Copy MCP evidence invocation/);
});

test("agent SDK and MCP snippets use registered canonical evidence clients", () => {
  assert.match(buildSdkEvidenceSnippet("scan-123"), /certscore\.pulse\.evidence\("scan-123"\)/);
  assert.deepEqual(JSON.parse(buildMcpEvidenceInvocation("scan-123")), {
    tool: "certscore_get_evidence",
    arguments: { scanId: "scan-123" }
  });
});
