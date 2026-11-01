import assert from "node:assert/strict";
import test from "node:test";
import { apiV2ChoiceConfirmationSummarySchema } from "./scan-observation-results.js";
import { buildCertScoreApiV2OpenApiDocument } from "./openapi-v2.js";

const summary = {
  policyVersion: "choice_confirmation_summary.v1", sourcePacketSha256: "a".repeat(64),
  initialRegistrationStatus: "unconfirmed", initialDecisionVerified: false,
  terminalDecisionVerified: true, notificationAcknowledged: null,
  categoryCheck: "unknown", diagnosticReasons: [],
};

test("confirmation contract preserves independent initial, terminal and unavailable stages", () => {
  assert.deepEqual(apiV2ChoiceConfirmationSummarySchema.parse(summary), summary);
  const missing = { ...summary, terminalDecisionVerified: null };
  assert.equal(apiV2ChoiceConfirmationSummarySchema.parse(missing).terminalDecisionVerified, null);
  assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse({ ...summary, initialDecisionVerified: true }).success, false);
  assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse({ ...summary, sourcePacketSha256: "missing" }).success, false);
  assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse({ ...summary, diagnosticReasons: Array(25).fill("reason") }).success, false);
});

test("OpenAPI documents the optional confirmation stages for both action paths", () => {
  const document = buildCertScoreApiV2OpenApiDocument() as any;
  for (const name of ["PostAcceptObservation", "PostRefusalObservation"]) {
    const schema = document.components.schemas[name];
    assert.deepEqual(schema.properties.confirmation.properties.policyVersion.enum,
      ["choice_confirmation_summary.v1", "choice_confirmation_summary.v2"]);
    assert.deepEqual(schema.properties.confirmation.properties.terminalDecisionVerified.type, ["boolean", "null"]);
    assert.deepEqual(schema.properties.confirmation.properties.executionStages.properties.observationCompleted.type, ["boolean", "null"]);
    assert.deepEqual(schema.properties.confirmation.properties.phaseDiagnostics.properties.initialReasons.type, ["array", "null"]);
    assert.ok(!schema.properties.confirmation.required.includes("executionStages"));
    assert.deepEqual(schema.properties.confirmation.properties.receiptAvailability.type, ["object", "null"]);
    assert.equal(schema.properties.confirmation.properties.receiptAvailability.properties.coverage.const, "retained_observations_only");
    assert.deepEqual(schema.properties.confirmation.properties.readDiagnostics.type, ["object", "null"]);
    assert.equal(schema.properties.confirmation.properties.readDiagnostics.properties.passCountLimit.const, 10_000);
    assert.ok(!schema.properties.confirmation.required.includes("readDiagnostics"));
    assert.ok(!schema.required.includes("confirmation"));
  }
});

test("v2 read diagnostics preserve operational states and nullable history without permitting private data or a v1 rewrite", () => {
  const unknown = {state: "unknown", conflictingObservations: false, reasonsTruncated: null};
  const current = {...summary, policyVersion: "choice_confirmation_summary.v2", categoryDiagnostics: {
    policyVersion: "consent_category_diagnostics.v1", diagnosticOnly: true, source: "retained_reason_inventory",
    aggregate: unknown, initial: null, terminal: null,
  }};
  const readDiagnostics = {policyVersion: "consent_confirmation_read_diagnostics.v1", diagnosticOnly: true,
    source: "retained_confirmation_diagnostics", sourceDiagnosticsPolicyVersion: "consent_confirmation_diagnostics.v1",
    passCountLimit: 10_000, initialPasses: 0, terminalPasses: 1, terminalRead: "discarded"};
  for (const terminalRead of ["not_started", "started", "unverified", "verified", "discarded"])
    assert.deepEqual(apiV2ChoiceConfirmationSummarySchema.parse({...current, readDiagnostics: {...readDiagnostics, terminalRead}}).readDiagnostics,
      {...readDiagnostics, terminalRead});
  assert.equal(apiV2ChoiceConfirmationSummarySchema.parse({...current, readDiagnostics: null}).readDiagnostics, null);
  assert.equal(apiV2ChoiceConfirmationSummarySchema.parse(current).readDiagnostics, undefined);
  for (const invalid of [
    {...summary, readDiagnostics}, {...summary, readDiagnostics: null},
    ...[{diagnosticOnly: false}, {decision: "granted"}, {cookieValue: "private"}, {initialPasses: 10_001},
      {terminalPasses: -1}, {terminalPasses: undefined}, {terminalRead: "future"}, {sourceDiagnosticsPolicyVersion: "future"},
      {passCountLimit: 20_000}].map(patch => ({...current, readDiagnostics: {...readDiagnostics, ...patch}})),
  ]) assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse(invalid).success, false);
});

test("v2 requires matching versioned category diagnostics while v1 remains unchanged", () => {
  const unknown = {state: "unknown", conflictingObservations: false, reasonsTruncated: false};
  const categoryDiagnostics = {policyVersion: "consent_category_diagnostics.v1", diagnosticOnly: true, source: "retained_reason_inventory",
    aggregate: unknown, initial: unknown, terminal: null};
  const current = {...summary, policyVersion: "choice_confirmation_summary.v2", categoryDiagnostics};
  assert.deepEqual(apiV2ChoiceConfirmationSummarySchema.parse(current), current);
  for (const invalid of [
    {...current, categoryDiagnostics: undefined},
    {...current, categoryCheck: "unsupported"},
    {...summary, categoryDiagnostics},
    {...current, categoryDiagnostics: {...categoryDiagnostics, aggregate: {
      state: "supported", conflictingObservations: true, reasonsTruncated: false,
    }}},
    {...current, categoryDiagnostics: {...categoryDiagnostics, initial: {
      state: "unsupported", conflictingObservations: false, reasonsTruncated: true,
    }}},
  ]) assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse(invalid).success, false);
});

test("receipt availability remains optional, nullable, source-bound and count-consistent", () => {
  const zero = {retained: 0, available: 0, unavailable: 0, limited: 0, valueProof: 0};
  const phase = {receipts: zero, configuration: zero};
  const receiptAvailability = {policyVersion: "consent_receipt_availability.v1", diagnosticOnly: true,
    sourcePacketSha256: summary.sourcePacketSha256, action: "accept", coverage: "retained_observations_only",
    documentStable: true, cancelled: false, observationsTruncated: true, processingLimited: false,
    phases: {baseline: phase, initial: phase, terminal: phase}};
  assert.equal(apiV2ChoiceConfirmationSummarySchema.parse({...summary, receiptAvailability: null}).receiptAvailability, null);
  assert.deepEqual(apiV2ChoiceConfirmationSummarySchema.parse({...summary, receiptAvailability}).receiptAvailability, receiptAvailability);
  for (const invalid of [
    {...receiptAvailability, sourcePacketSha256: "b".repeat(64)},
    {...receiptAvailability, rawReceipt: "do-not-export"},
    {...receiptAvailability, phases: {...receiptAvailability.phases, initial: {
      ...phase, receipts: {...zero, available: 1},
    }}},
  ]) assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse({...summary, receiptAvailability: invalid}).success, false);
});

test("execution and phase fields preserve false, unknown, empty and truncated inventories", () => {
  const extended = { ...summary,
    executionStages: { controlResolved: null, clickCompleted: true, observationCompleted: false },
    phaseDiagnostics: { initialReasons: null, terminalReasons: [], reasonsTruncated: true },
  };
  assert.deepEqual(apiV2ChoiceConfirmationSummarySchema.parse(extended), extended);
  assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse({ ...extended,
    phaseDiagnostics: { ...extended.phaseDiagnostics, terminalReasons: Array(25).fill("reason") },
  }).success, false);
  assert.equal(apiV2ChoiceConfirmationSummarySchema.safeParse({ ...extended,
    executionStages: { ...extended.executionStages, observationCompleted: "unknown" },
  }).success, false);
});
