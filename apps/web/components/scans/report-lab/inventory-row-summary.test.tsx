import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryRowSummary, inventoryRequestEvidenceLabel } from "./inventory-row-summary";
import type { ShadowReportData } from "./shadow-report-data";

const row: ShadowReportData["inventory"][number] = {
  category: "Review", confidence: "high", controllingEntity: "Google LLC", domains: "google.com",
  evidence: "Review", entityRelationship: "Unknown", name: "Google Maps embed", observed: "9.33s",
  priority: "review needed", purpose: "Embedded maps", relationship: "Cross-site", requestNames: "/maps/embed",
  serverLocation: "Location not retained", transferMechanism: "Unknown", type: "Tracker / request",
  vendor: "Google", recordCount: 1, requestCount: null,
  evidenceJson: { preConsent: true, requestDetails: [{ path: "/maps/embed" }] },
};

test("request detail availability is distinct from the total request-event count", () => {
  assert.equal(inventoryRequestEvidenceLabel(row), "1 retained request detail · total event count unavailable");
  assert.equal(inventoryRequestEvidenceLabel({ ...row, requestCount: 4 }), "4 request events · 1 retained detail");
  assert.equal(inventoryRequestEvidenceLabel({ ...row, evidenceJson: {}, requestCount: 0 }), "0 request events · detailed records unavailable");
  assert.equal(inventoryRequestEvidenceLabel({ ...row, evidenceJson: {}, type: "Embed / iframe" }), "Iframe observation; no linked request details retained");
});

test("supporting iframe is a compact observation, without repeating summaries or JSON", () => {
  const html = renderToStaticMarkup(<InventoryRowSummary row={{ ...row, evidenceJson: { ...row.evidenceJson,
    supportingObservations: [{ ...row, type: "Embed / iframe", observed: "10.88s", domains: "www.google.com" }],
  } }} />);
  assert.equal((html.match(/>Resource summary</g) ?? []).length, 1);
  assert.equal((html.match(/>Google Maps embed</g) ?? []).length, 1);
  assert.match(html, /Supporting observations \(1\)/);
  assert.match(html, /Embed \/ iframe · 10.88s · www.google.com · before consent/);
  assert.match(html, /total event count unavailable/);
  assert.doesNotMatch(html, /<pre|Retained JSON|Inventory fields|Safe JSON|Requests \/ paths|>Category</);
});
