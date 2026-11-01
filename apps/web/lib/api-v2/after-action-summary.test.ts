import { observedControlAssessment } from "../scans/test-fixtures/observed-control-assessment";
import assert from "node:assert/strict";
import test from "node:test";
import { deriveAfterActionSummary, afterActionInterpretation, deriveChoiceConfirmationSummary } from "./after-action-summary";
import retainedTerminal from "../scans/test-fixtures/retained-terminal-confirmations.json";
import { apiV2PostAcceptObservationSchema, apiV2PostRefusalObservationSchema } from "@certscore/api-contracts";
import { deriveApiV2PostAcceptObservation, deriveApiV2PostRefusalObservation } from "./scan-resource";
import { POST_ACCEPT_REPORT_PROJECTION_VERSION, POST_REFUSAL_REPORT_PROJECTION_VERSION } from "@certscore/contracts";
import { postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema,
  projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import ownedReceipts from "../../../../packages/certscore-contracts/src/test-fixtures/retained-owned-receipt-packets.json";

function fixture(action: "accept" | "reject") {
  return {
    contractVersion: action === "accept" ? POST_ACCEPT_REPORT_PROJECTION_VERSION : POST_REFUSAL_REPORT_PROJECTION_VERSION,
    completedAt: "2026-09-11T12:00:00.000Z", packetSha256: "a".repeat(64),
    status: "unconfirmed", registrationStatus: "unconfirmed", resolverMethod: "canonical_consent_control_registry_recipe",
    evidenceDisposition: "indeterminate", indeterminateReason: "consent_registration_unconfirmed",
    contradictionObserved: false, limitations: [], observationCount: 0, observationWindowMs: 1000,
    productionProjectable: false,
    ...(action === "accept" ? { acceptanceExercised: false, postAcceptActivity: [] }
      : { refusalExercised: false, postRefusalActivity: [], preConsentStorageNotCleared: [] }),
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v2", action, observedAtMs: 99,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text",
      actionSemantics: "direct_label", classifierIntent: action, classifierConfidence: 1,
      recipeId: "fixture", selectorHint: "#choice", visible: true, enabled: true, uniquelyActionable: true,
    },
    afterActionCapture: {
      policyVersion: "bounded_after_action_capture.v2", action, activationStatus: "completed",
      actionDispatchedAtMs: 100, captureEndedAtMs: 1100, requestedWindowMs: 1000,
      stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
      storageWriteCoverage: "bounded_main_document_sample", storageWrites: [], requestIds: [], requestAncestry: [],
    },
    afterActionRequests: [], afterActionStorage: [],
  };
}

test("26 retained owned packets preserve receipt availability through canonical projection and API", () => {
  assert.equal(ownedReceipts.length, 26);
  let confirmed = 0;
  for (const row of ownedReceipts) {
    const action = row.action as "accept" | "reject";
    const projection = action === "accept"
      ? projectPostAcceptEvidenceForReport({packet: postAcceptEvidencePacketSchema.parse(row.packet), packetSha256: row.sourceSha256})
      : projectPostRefusalEvidenceForReport({packet: postRefusalEvidencePacketSchema.parse(row.packet), packetSha256: row.sourceSha256});
    // Controlled removal of optional diagnostics, never a rewritten source packet.
    const without = {...row.packet, consentReceiptCapture: undefined};
    const before = action === "accept"
      ? projectPostAcceptEvidenceForReport({packet: postAcceptEvidencePacketSchema.parse(without), packetSha256: row.sourceSha256})
      : projectPostRefusalEvidenceForReport({packet: postRefusalEvidencePacketSchema.parse(without), packetSha256: row.sourceSha256});
    const {receiptAvailability, ...canonical} = projection;
    assert.deepEqual(canonical, before, row.name);
    assert.ok(receiptAvailability);
    assert.equal(receiptAvailability.sourcePacketSha256, row.sourceSha256);
    assert.equal(receiptAvailability.action, action);
    const sourceCount = row.packet.consentReceiptCapture.observations.length;
    assert.equal(Object.values(receiptAvailability.phases).reduce((n, p) => n + p.receipts.retained + p.configuration.retained, 0), sourceCount);
    assert.ok(Buffer.byteLength(JSON.stringify(receiptAvailability)) < 2048);
    assert.equal(deriveChoiceConfirmationSummary(before, action)?.receiptAvailability, null);
    if (projection.execution?.consentConfirmed) confirmed++;
    const record = {events: [], runtimeArtifacts: {consentControlAssessment: observedControlAssessment,
      [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: projection}} as any;
    const result = (action === "accept" ? deriveApiV2PostAcceptObservation : deriveApiV2PostRefusalObservation)(record)!;
    const serialized = (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
    assert.deepEqual(serialized.confirmation?.receiptAvailability, receiptAvailability);
    assert.equal((action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).safeParse({
      ...serialized, confirmation: {...serialized.confirmation, receiptAvailability: {...receiptAvailability,
        action: action === "accept" ? "reject" : "accept"}},
    }).success, false);
    if (row.name.includes("oversized")) {
      assert.ok(Object.values(receiptAvailability.phases).some(p => p.receipts.available > p.receipts.valueProof && p.receipts.limited > 0));
      assert.equal(serialized.confirmation?.initialDecisionVerified, false);
      assert.equal(serialized.execution?.consentConfirmed, false);
    }
    assert.equal(deriveChoiceConfirmationSummary({...projection, receiptAvailability: {
      ...receiptAvailability, sourcePacketSha256: "f".repeat(64),
    }}, action), undefined);
    assert.equal(deriveChoiceConfirmationSummary({...projection, receiptAvailability: {
      ...receiptAvailability, action: action === "accept" ? "reject" : "accept",
    }}, action), undefined);
  }
  assert.equal(confirmed, 6, "diagnostics cannot create additional verified decisions");
});

for (const action of ["accept", "reject"] as const) {
  test(`${action}: public summary preserves unconfirmed capture without registration or score promotion`, () => {
    const projection = fixture(action);
    const summary = deriveAfterActionSummary(projection, action);
    assert.ok(summary);
    assert.equal(summary.activationStatus, "completed");
    assert.match(afterActionInterpretation(summary)!, /was clicked/);
    const record = { events: [], runtimeArtifacts: { consentControlAssessment: observedControlAssessment,
      [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: projection,
    } } as any;
    const result = action === "accept" ? deriveApiV2PostAcceptObservation(record) : deriveApiV2PostRefusalObservation(record);
    assert.ok(result);
    assert.ok("execution" in result);
    assert.equal(result.execution?.status, "succeeded");
    assert.equal(result.execution?.consentConfirmed, false);
    assert.equal(result.status, "unconfirmed");
    assert.equal(result.productionProjectable, false);
    assert.equal(result.observationCount, 0);
    assert.deepEqual(result.afterAction, summary);
    assert.equal(result.confirmation?.initialRegistrationStatus, "unconfirmed");
    assert.equal(result.confirmation?.terminalDecisionVerified, null);
    assert.equal(result.confirmation?.notificationAcknowledged, null);
    assert.deepEqual(result.confirmation?.executionStages, {
      controlResolved: true, clickCompleted: true, observationCompleted: true,
    });
    assert.match(result.interpretation, /was clicked/);
    (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
  });
  test(`${action}: malformed, missing-hash, wrong-action and legacy capture fail closed`, () => {
    const projection = fixture(action);
    assert.equal(deriveAfterActionSummary({ ...projection, packetSha256: undefined }, action), undefined);
    assert.equal(deriveAfterActionSummary({ ...projection, actionControlProof: undefined }, action), undefined);
    assert.equal(deriveAfterActionSummary({ ...projection, afterActionCapture: { ...projection.afterActionCapture, requestIds: ["missing"] } }, action), undefined);
    assert.equal(deriveAfterActionSummary(projection, action === "accept" ? "reject" : "accept"), undefined);
    assert.equal(deriveAfterActionSummary({ ...projection, afterActionCapture: undefined, afterActionRequests: undefined, afterActionStorage: undefined }, action), undefined);
  });
  test(`${action}: partial capture and drops remain explicit`, () => {
    const projection = fixture(action);
    const summary = deriveAfterActionSummary({ ...projection, afterActionCapture: {
      ...projection.afterActionCapture, stopReason: "aborted", captureEndedAtMs: 500, requestsDropped: 2,
    } }, action);
    assert.ok(summary);
    assert.equal(summary.requestsDropped, 2);
    assert.match(afterActionInterpretation(summary)!, /capture was limited/);
    assert.doesNotMatch(afterActionInterpretation(summary)!, /window completed/);
  });
  test(`${action}: API distinguishes completed registered paths from confirmation without completion`, () => {
    const projection = { ...fixture(action), afterActionCapture: undefined, afterActionRequests: undefined,
      afterActionStorage: undefined, status: "confirmed_clean", registrationStatus: "confirmed",
      productionProjectable: true, evidenceDisposition: "confirmed", indeterminateReason: null,
      ...(action === "accept" ? { acceptanceExercised: true, acceptanceRegisteredAtMs: 101 }
        : { refusalExercised: true, refusalRegisteredAtMs: 101 }),
      decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: action === "accept" ? "granted" : "denied",
        basis: "verified_state", observedAtMs: 101, observedStateSha256: "b".repeat(64), timestampBasis: "verified_state_observed" },
      captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
      registeredObservationCompletion: { policyVersion: "registered_action_observation_completion.v1", action,
        startedAtMs: 101, completedAtMs: 1101, requiredWindowMs: 1000, termination: "window_elapsed" },
    };
    for (const complete of [true, false]) {
      const record = { events: [], runtimeArtifacts: { consentControlAssessment: observedControlAssessment,
        [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: {
          ...projection, registeredObservationCompletion: complete ? projection.registeredObservationCompletion : undefined,
        },
      } } as any;
      const result = action === "accept" ? deriveApiV2PostAcceptObservation(record) : deriveApiV2PostRefusalObservation(record);
      assert.ok(result && "execution" in result);
      assert.equal(result.execution?.status, complete ? "succeeded_with_confirmation" : "limited");
      assert.equal(result.execution?.consentConfirmed, true);
      assert.equal(result.productionProjectable, true); // Existing findings contract is independent.
      (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
    }
  });
}

test("retained terminal decisions survive API serialization without rewriting initial registration", () => {
  for (const fixture of retainedTerminal) {
    const action = fixture.action as "accept" | "reject";
    const summary = deriveChoiceConfirmationSummary(fixture.projection, action)!;
    assert.equal(summary.initialRegistrationStatus, "unconfirmed");
    assert.equal(summary.initialDecisionVerified, false);
    assert.equal(summary.terminalDecisionVerified, true);
    assert.equal(summary.receiptAvailability, null);
    assert.equal(summary.sourcePacketSha256, fixture.source.sha256);
    assert.deepEqual(summary.executionStages, {
      controlResolved: true, clickCompleted: true, observationCompleted: true,
    });
    assert.deepEqual(summary.phaseDiagnostics, {
      initialReasons: null, terminalReasons: null, reasonsTruncated: null,
    });
    const record = { events: [], runtimeArtifacts: { consentControlAssessment: observedControlAssessment,
      [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: fixture.projection,
    } } as any;
    const result = (action === "accept" ? deriveApiV2PostAcceptObservation : deriveApiV2PostRefusalObservation)(record)!;
    const serialized = (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
    assert.deepEqual(serialized.confirmation, summary);
    assert.equal(serialized.status, "unconfirmed");
    assert.equal(serialized.productionProjectable, false);
    assert.equal(serialized.execution?.consentConfirmed, true);
    assert.equal(fixture.projection.registrationStatus, "unconfirmed");
  }
});

test("completed clicks with interrupted observations remain distinct from completed paths", () => {
  for (const action of ["accept", "reject"] as const) {
    const projection = fixture(action);
    const summary = deriveChoiceConfirmationSummary({ ...projection, afterActionCapture: {
      ...projection.afterActionCapture, stopReason: "aborted", captureEndedAtMs: 500,
    } }, action)!;
    assert.deepEqual(summary.executionStages, {
      controlResolved: true, clickCompleted: true, observationCompleted: false,
    });
    assert.equal(summary.initialDecisionVerified, false);
    assert.equal(summary.terminalDecisionVerified, null);
  }
});

test("phase reasons retain chronology, missing history and truncation without verifying a choice", () => {
  for (const action of ["accept", "reject"] as const) {
    const projection = fixture(action);
    const diagnostics = {
      policyVersion: "consent_confirmation_diagnostics.v3", diagnosticOnly: true,
      initialPasses: 1, terminalPasses: 1, terminalRead: "unverified",
      reasons: ["receipt_missing", "no_registered_complete_decision"],
      initialReasons: ["receipt_missing"], terminalReasons: ["no_registered_complete_decision"],
      reasonsTruncated: true,
    };
    const phased = deriveChoiceConfirmationSummary({ ...projection, confirmationDiagnostics: diagnostics }, action)!;
    assert.deepEqual(phased.phaseDiagnostics, {
      initialReasons: ["receipt_missing"], terminalReasons: ["no_registered_complete_decision"], reasonsTruncated: true,
    });
    assert.equal(phased.initialDecisionVerified, false);
    assert.equal(phased.terminalDecisionVerified, null);
    const { initialReasons, terminalReasons, reasonsTruncated, ...legacy } = diagnostics;
    const historical = deriveChoiceConfirmationSummary({ ...projection,
      confirmationDiagnostics: { ...legacy, policyVersion: "consent_confirmation_diagnostics.v1" },
    }, action)!;
    assert.deepEqual(historical.diagnosticReasons, diagnostics.reasons);
    assert.deepEqual(historical.phaseDiagnostics, {
      initialReasons: null, terminalReasons: null, reasonsTruncated: null,
    });
  }
});

test("v2 category diagnostics preserve unknown and phase conflicts without verifying a decision", () => {
  for (const action of ["accept", "reject"] as const) {
    const projection = {...fixture(action), confirmationDiagnostics: {
      policyVersion: "consent_confirmation_diagnostics.v3", diagnosticOnly: true,
      initialPasses: 1, terminalPasses: 1, terminalRead: "unverified",
      reasons: ["category_private_flag_unresolved", "category_applicability_verified"],
      initialReasons: ["category_private_flag_unresolved"], terminalReasons: ["category_applicability_verified"],
      reasonsTruncated: false,
    }};
    const result = deriveChoiceConfirmationSummary(projection, action)!;
    assert.equal(result.policyVersion, "choice_confirmation_summary.v2");
    assert.equal(result.categoryCheck, "unknown");
    assert.equal(result.categoryDiagnostics.aggregate.conflictingObservations, true);
    assert.equal(result.categoryDiagnostics.initial?.state, "unknown");
    assert.equal(result.categoryDiagnostics.terminal?.state, "supported");
    assert.equal(result.initialDecisionVerified, false);
    assert.equal(result.terminalDecisionVerified, null);
    const record = {events: [], runtimeArtifacts: {consentControlAssessment: observedControlAssessment,
      [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: projection}} as any;
    const publicResult = (action === "accept" ? deriveApiV2PostAcceptObservation : deriveApiV2PostRefusalObservation)(record)!;
    const serialized = (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(publicResult);
    assert.deepEqual(serialized.confirmation, result);
    assert.equal(serialized.execution?.consentConfirmed, false);
    const truncated = deriveChoiceConfirmationSummary({...projection, confirmationDiagnostics: {
      ...projection.confirmationDiagnostics, reasons: ["category_applicability_verified"],
      initialReasons: ["category_applicability_verified"], terminalReasons: [], reasonsTruncated: true,
    }}, action)!;
    assert.equal(truncated.categoryCheck, "unknown");
    assert.equal(truncated.categoryDiagnostics.aggregate.reasonsTruncated, true);
  }
});

test("Accept and Reject keep read lifecycle diagnostics separate from decision proof in serialized API output", () => {
  for (const action of ["accept", "reject"] as const) {
    const projection = fixture(action);
    const absent = deriveChoiceConfirmationSummary({...projection, confirmationDiagnostics: undefined}, action)!;
    assert.equal(absent.readDiagnostics, null);
    for (const terminalRead of ["not_started", "started", "unverified", "verified", "discarded"] as const) {
      const diagnostics = {policyVersion: "consent_confirmation_diagnostics.v3", diagnosticOnly: true,
        initialPasses: 0, terminalPasses: 0, terminalRead, reasons: [],
        initialReasons: [], terminalReasons: [], reasonsTruncated: false};
      const input = {...projection, confirmationDiagnostics: diagnostics};
      const summary = deriveChoiceConfirmationSummary(input, action)!;
      assert.deepEqual(summary.readDiagnostics, {
        policyVersion: "consent_confirmation_read_diagnostics.v1", diagnosticOnly: true,
        source: "retained_confirmation_diagnostics", sourceDiagnosticsPolicyVersion: diagnostics.policyVersion,
        passCountLimit: 10_000, initialPasses: 0, terminalPasses: 0, terminalRead,
      });
      assert.equal(summary.initialDecisionVerified, false);
      assert.equal(summary.terminalDecisionVerified, null);
      assert.deepEqual(summary.executionStages, absent.executionStages);
      const record = {events: [], runtimeArtifacts: {consentControlAssessment: observedControlAssessment,
        [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: input}} as any;
      const result = (action === "accept" ? deriveApiV2PostAcceptObservation : deriveApiV2PostRefusalObservation)(record)!;
      const serialized = (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
      assert.deepEqual(serialized.confirmation?.readDiagnostics, summary.readDiagnostics);
      assert.equal(serialized.execution?.consentConfirmed, false);
    }
    assert.equal(deriveChoiceConfirmationSummary({...projection, packetSha256: undefined}, action), undefined);
    assert.equal(deriveChoiceConfirmationSummary({...projection, confirmationDiagnostics: {
      policyVersion: "consent_confirmation_diagnostics.v1", diagnosticOnly: true,
      initialPasses: 0, terminalPasses: -1, terminalRead: "discarded", reasons: [],
    }}, action), undefined);
  }
});

test("invalid source, target, timing and cross-action terminal proofs cannot produce confirmation summaries", () => {
  for (const fixture of retainedTerminal) {
    const action = fixture.action as "accept" | "reject";
    for (const invalid of [
      { ...fixture.projection, packetSha256: undefined },
      { ...fixture.projection, terminalDecisionEvidence: { ...fixture.projection.terminalDecisionEvidence,
        authorizedTargetSha256: "f".repeat(64) } },
      { ...fixture.projection, terminalDecisionEvidence: { ...fixture.projection.terminalDecisionEvidence,
        readCompletedAtMs: 100_000_000 } },
    ]) assert.equal(deriveChoiceConfirmationSummary(invalid, action), undefined);
    assert.equal(deriveChoiceConfirmationSummary(fixture.projection, action === "accept" ? "reject" : "accept"), undefined);
  }
});


test("customer action summaries require an observed first-layer control while retaining independent action evidence", () => {
  for (const action of ["accept", "reject"] as const) {
    for (const state of ["unknown", "not_observed"]) {
      const assessment = { ...observedControlAssessment, controls: { ...observedControlAssessment.controls,
        [action]: { ...observedControlAssessment.controls[action], state } } };
      const record = { events: [], runtimeArtifacts: { consentControlAssessment: assessment,
        [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: fixture(action),
      } } as any;
      const derive = action === "accept" ? deriveApiV2PostAcceptObservation : deriveApiV2PostRefusalObservation;
      assert.equal(derive(record), undefined);
      const key = action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection";
      record.runtimeArtifacts[key] = { ...fixture(action), afterActionCapture: undefined,
        afterActionRequests: undefined, afterActionStorage: undefined };
      assert.equal(derive(record), undefined);
      assert.ok(record.runtimeArtifacts[action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"], "internal evidence remains retained");
    }
  }
});
