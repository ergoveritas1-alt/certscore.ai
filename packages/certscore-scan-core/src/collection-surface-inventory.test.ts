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

test("privacy choices survive per-form and page retention caps with their observed state", () => {
  const rows = Array.from({ length: 84 }, (_, i) => row(i, {
    groupKey: `form-${Math.floor(i / 21)}`,
    ...(i % 21 === 20 ? {
      inputType: "checkbox", controlKind: "checkbox" as const, checkedState: "unchecked" as const,
      label: "Ja, ich möchte den Newsletter erhalten und erteile meine Einwilligung.",
      required: true,
      privacyDisclosure: { version: 1 as const, excerpts: [{ text: "Newsletter consent", association: "inside_form" as const, links: [] }], truncated: false },
    } : { inputType: "email", label: "Email" }),
  }));
  const inventory = buildCollectionSurfaceInventory({ pageUrl: "https://example.test/", rows, inspectedFieldCandidateCount: rows.length, candidateScanTruncated: false }, Date.now());
  assert.equal(inventory.coverage.retainedFieldCount, 60);
  assert.equal(inventory.coverage.status, "limited");
  for (const form of inventory.forms) {
    const choice = form.fields.find(field => field.controlKind === "checkbox");
    assert.ok(choice, form.formRef);
    assert.equal(choice.checkedState, "unchecked");
    assert.equal(choice.required, true);
    assert.equal(choice.review?.preselectedMarketing, false);
    assert.equal(choice.semanticCategory, "boolean_choice");
    assert.equal(form.privacyDisclosure?.excerpts[0]?.text, "Newsletter consent");
    assert.ok(form.fields.length <= 20);
    assert.equal(form.candidateFieldCount, 21);
    assert.equal(form.fieldsTruncated, true);
  }
});

test("German contact labels have bounded semantics without matching incidental prose", () => {
  for (const [label, expected] of [
    ["Vorname*", "name"], ["Nachname*", "name"], ["Mobiltelefonnummer*", "phone"],
    ["Firma Telefonnummer", "phone"], ["Straße/Nr.*", "address"], ["PLZ*", "address"], ["Ort*", "address"],
    ["Firmenname", "unknown"], ["Dateiname", "unknown"], ["Anreise*", "unknown"], ["Transport", "unknown"],
    ["Ich stimme der Verarbeitung meiner Adresse zu", "unknown"],
  ] as const) assert.equal(classifyCollectionSurfaceSemanticCategory(row(0, { label })), expected, label);
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(0, { label: "Name", inputType: "checkbox" })), "boolean_choice");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(0, { label: "Email updates", elementType: "custom_control", inputType: "custom", controlKind: "switch" })), "boolean_choice");
});

test("classifies canonical collection semantics without retaining values", () => {
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(0, { autocompleteToken: "url", label: "Website URL to scan" })), "website_url");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(0, { inputType: "email", label: "Correo electrónico" })), "email");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(1, { label: "Social Security Number" })), "social_security_number");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(2, { autocompleteToken: "cc-number" })), "payment_card");
  assert.equal(classifyCollectionSurfaceSemanticCategory(row(3, { elementType: "textarea", label: "Message" })), "free_text");
});

test("standalone UI toggles do not become forms or contaminate unrelated collection controls", () => {
  const standalone = { structure: "unassociated_controls" as const, groupKey: "unassociated_controls", title: undefined, method: undefined, actionHostname: undefined };
  const toggles = [undefined, "Menü öffnen", "Dark mode"].map((label, index) => row(index, {
    ...standalone, inputType: "checkbox", controlKind: "checkbox", label,
  }));
  const snapshot = { pageUrl: "https://example.com/contact", rows: toggles, inspectedFieldCandidateCount: 3, candidateScanTruncated: false };
  const empty = buildCollectionSurfaceInventory(snapshot, Date.now());
  assert.equal(empty.forms.length, 0);
  assert.equal(empty.coverage.candidateFormCount, 0);
  assert.equal(empty.coverage.status, "complete");
  assert.equal(empty.coverage.inspectedFieldCandidateCount, 3);
  const withEmail = buildCollectionSurfaceInventory({ ...snapshot, rows: [...toggles, row(3, { ...standalone, inputType: "email", label: "Email" })], inspectedFieldCandidateCount: 4 }, Date.now());
  assert.equal(withEmail.forms.length, 1);
  assert.deepEqual(withEmail.forms[0]?.fields.map((field) => field.inputType), ["email"]);
  assert.equal(withEmail.coverage.status, "complete");
  assert.equal(withEmail.coverage.candidateFieldCount, 1);
});

test("native and role form choices and standalone collection-purpose controls remain eligible", () => {
  const rows = [
    row(0, { inputType: "checkbox", controlKind: "checkbox", label: "Ich stimme zu" }),
    row(1, { structure: "role_form", groupKey: "js-form", inputType: "checkbox", controlKind: "checkbox", label: "Choice", method: undefined, actionHostname: undefined }),
    row(2, { structure: "unassociated_controls", groupKey: "standalone", inputType: "checkbox", controlKind: "checkbox", label: "Subscribe to newsletter", method: undefined, actionHostname: undefined }),
    row(3, { structure: "unassociated_controls", groupKey: "standalone", inputType: "search", label: "Search" }),
  ];
  const inventory = buildCollectionSurfaceInventory({ pageUrl: "https://example.com/", rows, inspectedFieldCandidateCount: rows.length, candidateScanTruncated: false }, Date.now());
  assert.equal(inventory.forms.length, 3);
  assert.equal(inventory.coverage.retainedFieldCount, 4);
  assert.equal(inventory.coverage.status, "complete");
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

for (const [name, groups, fieldsPerGroup, expectedForms, expectedFields, reason] of [
  ["10-form", 11, 1, 10, 10, "form_retention_limit_reached"],
  ["20-field-per-form", 1, 21, 1, 20, "field_retention_limit_reached"],
  ["60-field-per-page", 4, 20, 4, 60, "field_retention_limit_reached"],
] as const) {
  test(`${name} limit preserves explicit truncation and candidate counts`, () => {
    const rows = Array.from({ length: groups * fieldsPerGroup }, (_, i) => row(i, { groupKey: `form-${Math.floor(i / fieldsPerGroup)}` }));
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "https://example.test/", rows, inspectedFieldCandidateCount: rows.length, candidateScanTruncated: false }, Date.now());
    assert.equal(inventory.forms.length, expectedForms);
    assert.equal(inventory.coverage.retainedFieldCount, expectedFields);
    assert.equal(inventory.coverage.candidateFormCount, groups);
    assert.equal(inventory.coverage.candidateFieldCount, rows.length);
    assert.equal(inventory.coverage.retentionTruncated, true);
    assert.equal(inventory.coverage.status, "limited");
    assert.ok(inventory.coverage.reasonCodes.includes(reason));
    if (reason === "field_retention_limit_reached") assert.ok(inventory.forms.some(form => form.fieldsTruncated && form.candidateFieldCount > form.retainedFieldCount));
  });
}
