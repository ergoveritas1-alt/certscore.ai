import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionSurfaceInventory,
  classifyCollectionSurfaceSemanticCategory,
  legacyCollectionSurfaceObservationsFromInventory,
  type CollectionSurfaceCaptureRow,
} from "./collection-surface-inventory.js";

function row(index: number, overrides: Partial<CollectionSurfaceCaptureRow> = {}): CollectionSurfaceCaptureRow {
  return {
    groupKey: "form-0",
    structure: "native_form",
    title: "Contact",
    method: "post",
    actionHostname: "forms.example.com",
    elementType: "input",
    inputType: "text",
    label: `Field ${index}`,
    required: false,
    disabled: false,
    readOnly: false,
    domOrder: index,
    ...overrides,
  };
}

test("classifies canonical collection semantics without retaining values", () => {
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(0, { inputType: "email", label: "Correo electrónico" })), "email");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(1, { label: "Social Security Number" })), "social_security_number");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(2, { autocompleteToken: "cc-number" })), "payment_card");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(3, { elementType: "textarea", label: "Message" })), "free_text");
});

test("bounds pathological pages to 10 forms, 20 fields per form, and 60 total fields", () => {
  const rows = Array.from({ length: 1_000 }, (_, index) => row(index, {
    groupKey: `form-${Math.floor(index / 25)}`,
    title: `Form ${Math.floor(index / 25)}`,
  }));
  const inventory = buildCollectionSurfaceInventory({
    pageUrl: "https://www.example.com/final",
    rows: rows.slice(0, 250),
    inspectedFieldCandidateCount: 250,
    candidateScanTruncated: true,
  }, Date.now());
  assert.equal(inventory.forms.length, 10);
  assert.ok(inventory.forms.every((form) => form.fields.length <= 20));
  assert.ok(inventory.forms.reduce((total, form) => total + form.fields.length, 0) <= 60);
  assert.equal(inventory.coverage.status, "limited");
  assert.ok(inventory.coverage.reasonCodes.includes("candidate_scan_truncated"));
});

test("keeps sensitive compatibility recall while the legacy path migrates", () => {
  const inventory = buildCollectionSurfaceInventory({
    pageUrl: "https://example.com/",
    rows: [
      row(0, { inputType: "password", label: "Password" }),
      row(1, { autocompleteToken: "cc-number", label: "Card number" }),
      row(2, { inputType: "email", label: "Email" }),
    ],
    inspectedFieldCandidateCount: 3,
    candidateScanTruncated: false,
  }, Date.now());
  const legacy = legacyCollectionSurfaceObservationsFromInventory(inventory);
  assert.equal(legacy.filter((observation) => observation.hasSensitiveFieldHint).length, 2);
  assert.equal(legacy.filter((observation) => observation.hasEmailField).length, 1);
});

test("bounded inventory projection stays within the 64 KB and 100 ms guardrails", () => {
  const snapshot = {
    pageUrl: "https://example.com/final",
    rows: Array.from({ length: 250 }, (_, index) => row(index, {
      groupKey: `form-${Math.floor(index / 20)}`,
      title: `Form ${Math.floor(index / 20)} ${"x".repeat(100)}`,
      label: `Field ${index} ${"y".repeat(100)}`,
      inputType: index % 17 === 0 ? "password" : "text",
    })),
    inspectedFieldCandidateCount: 250,
    candidateScanTruncated: true,
  };
  const durations = Array.from({ length: 100 }, () => {
    const startedAt = performance.now();
    const inventory = buildCollectionSurfaceInventory(snapshot, Date.now());
    assert.ok(Buffer.byteLength(JSON.stringify(inventory), "utf8") <= 64 * 1024);
    return performance.now() - startedAt;
  }).sort((left, right) => left - right);
  const p95 = durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY;
  assert.ok(p95 < 100, `bounded projection p95 ${p95.toFixed(2)}ms exceeded 100ms`);
});
