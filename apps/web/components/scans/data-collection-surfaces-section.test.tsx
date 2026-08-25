import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionSurfaceAssessment } from "@certscore/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DataCollectionSurfacesSection,
  getCollectionSurfaceSummary,
} from "./data-collection-surfaces-section";

function assessmentFixture(
  overrides: Partial<CollectionSurfaceAssessment> = {}
): CollectionSurfaceAssessment {
  return {
    contractVersion: "certscore.collection-surface-assessment.v1",
    scanId: "scan-1",
    assessedAt: "2026-08-24T12:00:00.000Z",
    assessmentStatus: "observed",
    sourceInventoryContractVersion: "certscore.collection-surface-inventory.v1",
    sourceHash: "a".repeat(64),
    sourceLane: "runtime_evidence",
    pageUrl: "https://example.com/contact",
    coverage: {
      status: "complete",
      documentScope: "main_document",
      interactionMode: "none",
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
    forms: [
      {
        formRef: "form-0",
        structure: "native_form",
        surfaceType: "contact",
        title: "Contact us",
        pageUrl: "https://example.com/contact",
        method: "post",
        actionRelationship: "self",
        candidateFieldCount: 1,
        retainedFieldCount: 1,
        fieldsTruncated: false,
        fields: [
          {
            fieldRef: "field-0",
            elementType: "input",
            inputType: "email",
            semanticCategory: "email",
            label: "Work email",
            required: true,
            disabled: false,
            readOnly: false,
            evidenceRefs: [],
            confidence: 0.95,
            directVsInferred: "direct",
          },
        ],
        evidenceRefs: [],
        confidence: 0.95,
        directVsInferred: "direct",
      },
    ],
    limitationKeys: [],
    evidenceRefs: ["runtime-evidence:collection-surface-inventory"],
    productionProjectable: true,
    ...overrides,
  };
}

test("observed collection surfaces show canonical counts, field details, and default expanded state", () => {
  const assessment = assessmentFixture();
  const summary = getCollectionSurfaceSummary(assessment);
  const html = renderToStaticMarkup(
    <DataCollectionSurfacesSection assessment={assessment} />
  );

  assert.deepEqual(summary, {
    badgeLabel: "1 form · 1 field",
    defaultOpen: true,
    fieldCount: 1,
    formCount: 1,
  });
  assert.match(html, /<details[^>]* open=""/);
  assert.match(html, /Data collection surfaces/);
  assert.match(html, /1 form · 1 field/);
  assert.match(html, /Contact us/);
  assert.match(html, /Work email/);
  assert.match(html, /Field values are never retained/);
});

test("zero retained forms use the explicit No forms found badge and remain collapsed", () => {
  const assessment = assessmentFixture({
    assessmentStatus: "not_observed",
    forms: [],
    coverage: {
      status: "complete",
      documentScope: "main_document",
      interactionMode: "none",
      candidateFormCount: 0,
      retainedFormCount: 0,
      candidateFieldCount: 0,
      retainedFieldCount: 0,
      inspectedFormCandidateCount: 0,
      inspectedFieldCandidateCount: 0,
      candidateScanTruncated: false,
      retentionTruncated: false,
      reasonCodes: [],
    },
  });
  const html = renderToStaticMarkup(
    <DataCollectionSurfacesSection assessment={assessment} />
  );

  assert.equal(getCollectionSurfaceSummary(assessment).badgeLabel, "No forms found");
  assert.match(html, /No forms found/);
  assert.doesNotMatch(html, /Not testable/);
  assert.doesNotMatch(html, /<details[^>]* open=""/);
});

test("limited evidence stays explicitly limited and does not become an absence conclusion", () => {
  const assessment = assessmentFixture({
    assessmentStatus: "limited",
    forms: [],
    limitationKeys: ["collection_surface_inventory_limited"],
  });
  const html = renderToStaticMarkup(
    <DataCollectionSurfacesSection assessment={assessment} />
  );

  assert.match(html, /No forms found/);
  assert.match(html, /coverage was limited/);
  assert.match(html, /Missing forms or fields remain unknown/);
});

test("a missing persisted assessment creates no display-layer inventory", () => {
  assert.equal(
    renderToStaticMarkup(<DataCollectionSurfacesSection assessment={null} />),
    ""
  );
});
