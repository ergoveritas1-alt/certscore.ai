import assert from "node:assert/strict";
import test from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsentControlEvidencePanel } from "./consent-control-evidence-panel";

test("renders a clear visual first-layer inventory without the retired no-click copy", () => {
  const url = "https://example.test/";
  const assessment = deriveConsentControlAssessment({
    scan: {
      scanId: "scan-consent-card",
      requestedUrl: url,
      finalUrl: url,
      scanStatus: "completed"
    },
    document: {
      canonicalDocumentId: url,
      observedDocumentIds: [url],
      identityStatus: "matched"
    },
    observations: [],
    geometry: {
      assessmentStatus: "complete",
      documentId: url,
      completedChannels: ["dom_inventory", "geometry"],
      incompleteChannels: [],
      candidates: []
    },
    surface: {
      status: "not_observed",
      firstObservedAtMs: null,
      lastObservedAtMs: null,
      evidenceRefs: []
    },
    coverage: {
      status: "complete",
      requiredChannels: ["dom_inventory", "geometry"],
      completedChannels: ["dom_inventory", "geometry"],
      incompleteChannels: []
    },
    source: {
      bundleVersion: "fixture",
      geometryVersion: "consent_control_geometry.v1",
      computedAt: "2026-08-24T00:00:00.000Z"
    }
  });
  const markup = renderToStaticMarkup(createElement(ConsentControlEvidencePanel, { assessment }));

  assert.match(markup, /Consent controls observations/);
  assert.match(markup, /First-layer inventory complete/);
  assert.match(markup, /It does not mean those controls were present/);
  assert.match(markup, /Accept/);
  assert.match(markup, /Reject \/ necessary only/);
  assert.match(markup, /Options/);
  assert.equal((markup.match(/Not observed/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /No consent control was clicked/);
});

test("scan detail no longer imports or renders the cookies and storage card", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8")
  );

  assert.doesNotMatch(source, /CookieStoragePanel|cookie-storage-panel|Cookies & storage/);
});
