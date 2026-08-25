import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTION_SURFACE_INVENTORY_VERSION,
  MAX_COLLECTION_SURFACE_FIELDS,
  MAX_COLLECTION_SURFACE_FIELDS_PER_FORM,
  MAX_COLLECTION_SURFACE_FORMS,
  collectionSurfaceInventorySchema,
} from "./index.js";

function field(index: number) {
  return {
    fieldRef: `field_${index}`,
    elementType: "input" as const,
    inputType: "email",
    semanticCategory: "email" as const,
    label: `Email ${index}`,
    required: false,
    disabled: false,
    readOnly: false,
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct" as const,
  };
}

function inventory() {
  const fields = [field(0)];
  return {
    contractVersion: COLLECTION_SURFACE_INVENTORY_VERSION,
    inventoryId: "inventory_1",
    sourceLane: "runtime_evidence" as const,
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    observedAtMs: 100,
    consentStateAtTime: "pre_consent" as const,
    pageUrl: "https://example.com/",
    coverage: {
      status: "complete" as const,
      documentScope: "main_document" as const,
      interactionMode: "none" as const,
      candidateFormCount: 1,
      retainedFormCount: 1,
      candidateFieldCount: 1,
      retainedFieldCount: 1,
      inspectedFormCandidateCount: 1,
      inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false,
      retentionTruncated: false,
      reasonCodes: [],
    },
    forms: [{
      formRef: "form_0",
      structure: "native_form" as const,
      surfaceType: "newsletter" as const,
      title: "Updates",
      pageUrl: "https://example.com/",
      method: "post" as const,
      actionRelationship: "self" as const,
      candidateFieldCount: 1,
      retainedFieldCount: 1,
      fieldsTruncated: false,
      fields,
      evidenceRefs: [],
      confidence: 0.9,
      directVsInferred: "direct" as const,
    }],
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct" as const,
  };
}

test("CollectionSurfaceInventory v1 accepts a bounded value-free inventory", () => {
  assert.equal(collectionSurfaceInventorySchema.parse(inventory()).forms[0]?.fields[0]?.semanticCategory, "email");
});

test("CollectionSurfaceInventory v1 rejects page values, raw selectors, and raw HTML", () => {
  for (const prohibited of ["value", "selector", "html"] as const) {
    const candidate = structuredClone(inventory()) as Record<string, unknown>;
    const forms = candidate.forms as Array<Record<string, unknown>>;
    const fields = forms[0]?.fields as Array<Record<string, unknown>>;
    fields[0]![prohibited] = prohibited === "html" ? "<input value='secret'>" : "secret";
    assert.equal(collectionSurfaceInventorySchema.safeParse(candidate).success, false, prohibited);
  }
  const rawEvidencePointer = structuredClone(inventory()) as Record<string, unknown>;
  const forms = rawEvidencePointer.forms as Array<Record<string, unknown>>;
  const fields = forms[0]?.fields as Array<Record<string, unknown>>;
  fields[0]!.evidenceRefs = [{ refId: "field-ref", path: "form input[value='secret']" }];
  assert.equal(collectionSurfaceInventorySchema.safeParse(rawEvidencePointer).success, false);
});

test("CollectionSurfaceInventory v1 enforces form, per-form field, and total field limits", () => {
  const tooManyForms = inventory();
  tooManyForms.forms = Array.from({ length: MAX_COLLECTION_SURFACE_FORMS + 1 }, (_, index) => ({
    ...structuredClone(tooManyForms.forms[0]!),
    formRef: `form_${index}`,
  }));
  tooManyForms.coverage.retainedFormCount = tooManyForms.forms.length;
  tooManyForms.coverage.candidateFormCount = tooManyForms.forms.length;
  tooManyForms.coverage.retainedFieldCount = tooManyForms.forms.length;
  tooManyForms.coverage.candidateFieldCount = tooManyForms.forms.length;
  assert.equal(collectionSurfaceInventorySchema.safeParse(tooManyForms).success, false);

  const tooManyPerForm = inventory();
  tooManyPerForm.forms[0]!.fields = Array.from({ length: MAX_COLLECTION_SURFACE_FIELDS_PER_FORM + 1 }, (_, index) => field(index));
  tooManyPerForm.forms[0]!.candidateFieldCount = tooManyPerForm.forms[0]!.fields.length;
  tooManyPerForm.forms[0]!.retainedFieldCount = tooManyPerForm.forms[0]!.fields.length;
  tooManyPerForm.coverage.candidateFieldCount = tooManyPerForm.forms[0]!.fields.length;
  tooManyPerForm.coverage.retainedFieldCount = tooManyPerForm.forms[0]!.fields.length;
  assert.equal(collectionSurfaceInventorySchema.safeParse(tooManyPerForm).success, false);

  const tooManyTotal = inventory();
  tooManyTotal.forms = Array.from({ length: 4 }, (_, formIndex) => ({
    ...structuredClone(tooManyTotal.forms[0]!),
    formRef: `form_${formIndex}`,
    fields: Array.from({ length: 16 }, (_, fieldIndex) => field(formIndex * 16 + fieldIndex)),
    candidateFieldCount: 16,
    retainedFieldCount: 16,
  }));
  tooManyTotal.coverage.retainedFormCount = 4;
  tooManyTotal.coverage.candidateFormCount = 4;
  tooManyTotal.coverage.retainedFieldCount = 64;
  tooManyTotal.coverage.candidateFieldCount = 64;
  assert.ok(64 > MAX_COLLECTION_SURFACE_FIELDS);
  assert.equal(collectionSurfaceInventorySchema.safeParse(tooManyTotal).success, false);
});
