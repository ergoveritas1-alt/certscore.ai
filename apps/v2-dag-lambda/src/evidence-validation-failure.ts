// Only schema-owned path segments may enter diagnostics. Never log rejected
// values, raw Zod messages (which can contain those values), or bundled stacks.
const safeFields = new Set([
  "modulesRun", "timingBreakdown", "consentUiObservations", "documentUrl",
  "impliedConsentLanguageEvidence", "captureDiagnostics", "completedChannels",
  "timedOutChannels", "failedChannels", "inventoryDiagnostics", "candidateLabels",
  "storage", "preAction", "postAction", "name", "storageType", "hostname",
  "identityBasis", "identityHash", "storageIdentityHash", "valueHash",
  "writesAfterAccept", "writesAfterRefusal", "itemsCreatedOrChangedAfterAccept",
  "nonEssentialItemsPersistingAfterRefusal", "network", "requests", "observations",
  "acceptanceRegistration", "refusalRegistration", "decisionEvidence", "captureCoverage",
  "actionControlProof", "afterActionCapture", "timing", "resolver", "limitations",
  "scanEvidenceLaneAssessment", "scan_evidence_lane_assessment", "usablePolicySurfaceUrls", "evidenceRefs",
  "visualCapture", "notes", "controls", "domBinding", "documentIdentity", "source", "token",
  "gpcImpactCapture", "gpcImpactSemanticObservation", "gpcObservationSession", "semanticObservation", "gppDiagnostics", "stateTransitions",
  "terminalDecisionEvidence", "observedActionSourceProof", "mainDocumentWriteCoverage",
]);

// Exact schema-owned messages may select a fixed diagnostic code. Neither the
// rejected message nor values are emitted; unknown text is always discarded.
const safeCustomInvariants = new Map([
  ["Terminal proof requires a matching verified decision and retained read timing.", "terminal_decision_read_binding"],
  ["Terminal decision must bind to the completed authorized after-action capture.", "terminal_decision_action_binding"],
  ["Prospective scoped source proof must match the original confirmed action, packet inventory and configured window.", "observed_action_source_binding"],
  ["After-action capture must be bound to retained control, dispatch, request and snapshot evidence.", "after_action_source_binding"],
  ["V2 capture requires a committed authorized action document.", "after_action_document_binding"],
  ["Main-document write coverage requires bound, loss-free counters and healthy completed capture.", "main_document_write_coverage"],
  ["Protocol advertising collection requires v5 endpoint-bound identity proof.", "protocol_collection_binding"],
  ["California v2 body/header proof must retain consistent dispositions and hashes.", "california_body_header_dispositions"],
  ["Protocol visitor identity must bind to its exact supported collector.", "protocol_identity_binding"],
  ["Exact cookie assignment must bind its parent write identity and clock.", "exact_cookie_assignment_binding"],
  ["Property disclosure source must bind to the Reject scan and target.", "reject_property_source_binding"],
  ["Action projection must preserve verified decision and capture-coverage invariants.", "reject_action_projection_binding"],
  ["Invalid California request URL binding.", "california_request_url_binding"],
  ["California collection proof must bind to its exact retained request.", "california_request_binding"],
  ["Scoped source proof must preserve its clocks and exact handler accounting.", "observed_action_clock_accounting"],
  ["After-click write diagnostics must preserve bounded readback accounting.", "after_click_write_accounting"],
  ["V2 after-action capture requires exact retained request ancestry.", "after_action_request_ancestry"],
  ["After-action capture requires consistent action timing, completion and unique retained request references.", "after_action_timing_references"],
  ["Write diagnostics must count the exact retained after-click writes.", "after_click_retained_writes"],
  ["Exact cookie assignments must retain their parent write identity and clock.", "exact_cookie_assignment_binding"],
]);

export function evidenceValidationFailure(error: unknown): { code: string; message: string } | undefined {
  if (!(error instanceof Error) || error.name !== "ZodError" || !("issues" in error) || !Array.isArray(error.issues)) return;
  const issues = error.issues.slice(0, 6).map((issue: unknown) => {
    if (!issue || typeof issue !== "object") return "packet (invalid)";
    const record = issue as { path?: unknown; code?: unknown; message?:unknown; params?: {invariant?:unknown} };
    const path = Array.isArray(record.path) ? record.path.slice(0, 8).map(segment =>
      typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0 ? `[${segment}]`
        : typeof segment === "string" && safeFields.has(segment) ? segment : "[field]"
    ).join(".") : "packet";
    const code = typeof record.code === "string" && /^[a-z_]{1,40}$/.test(record.code) ? record.code : "invalid";
    const knownInvariant=code==="custom"&&typeof record.message==="string"?safeCustomInvariants.get(record.message):undefined;
    const invariant=record.params?.invariant === "native_ax_observation_document_binding" ? ":native_ax_observation_document_binding" : knownInvariant?`:${knownInvariant}`:"";
    return `${path || "packet"} (${code}${invariant})`;
  });
  return {
    code: "v2_dag_lambda_evidence_invalid",
    message: `Evidence validation failed: ${issues.join("; ")}${error.issues.length > 6 ? "; further issues omitted" : ""}`.slice(0, 500),
  };
}
