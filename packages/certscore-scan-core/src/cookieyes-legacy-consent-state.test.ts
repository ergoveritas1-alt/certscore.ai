import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createHash } from "node:crypto";
import type { BrowserContext, Locator, Page } from "playwright";
import { consentDecisionEvidenceSchema, cookieYesLegacyReceiptEvidenceSchema, validateCookieYesLegacyReceiptEnvelope,
  decodeCanonicalConsentDecision, type CookieYesLegacyConfiguration } from "@certscore/contracts";
import fixtures from "../../certscore-contracts/src/test-fixtures/cookieyes-legacy-current-categories.json";
import { decodeLegacyCookieYesReceipt, verifyLegacyCookieYesReceipt, type CookieYesLegacyBaseline } from "./cookieyes-legacy-consent-state.js";
import { captureCookieYesConfirmationBaseline, readConsentActionSnapshot, verifiedCookieDecision, type ActionStateWrite } from "./consent-action-semantic-state.js";
import { terminalConsentDecisionRead } from "./terminal-consent-decision.js";
import type { AfterActionCapture } from "@certscore/contracts";
import { postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema, projectPostAcceptEvidenceForReport,
  projectPostRefusalEvidenceForReport, postAcceptReportProjectionSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const url = "https://fixture.invalid/", encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
test("source-pinned original writer excerpt reproduces current and preserved fixture fields in memory", () => {
  assert.equal(sha(fixtures.writerExcerpt), fixtures.writerExcerptSha256);
  const writer = fixtures.writerExcerpt.trim().replace(/^generateConsent:\s*/, "").replace(/,$/, "");
  for (const row of fixtures.cases.slice(0, 5)) {
    const before = {retired_custom_category: false, ccpaOptout: true}; let written: string | undefined;
    const boxes = row.configuration.categories.map(category => ({category, checked: row.receipt[category as keyof typeof row.receipt]}));
    const jQuery = (value: unknown) => typeof value === "string" ? {each(fn: Function) {for (const box of boxes) fn.call(box);}}
      : {attr() {return `checkbox-${(value as typeof boxes[number]).category}`;}, is() {return (value as typeof boxes[number]).checked;}};
    vm.runInNewContext(`(${writer})()`, {jQuery, Cli_Data: {consentVersion: row.configuration.consentVersion},
      CLI_PREFERNCE_COOKIE: "CookieLawInfoConsent", CLI_ACCEPT_COOKIE_EXPIRE: 365,
      window: {atob(value: string) {return Buffer.from(value, "base64").toString("binary");}, btoa(value: string) {return Buffer.from(value, "binary").toString("base64");}},
      CLI_Cookie: {read() {return encode(before);}, set(name: string, value: string) {assert.equal(name, "CookieLawInfoConsent"); written = value;}}});
    assert.ok(written); assert.deepEqual({...decodeLegacyCookieYesReceipt(written)}, {...before, ...row.receipt});
  }
});
function input(index = 0) {
  const row = fixtures.cases[index]!;
  const configuration = structuredClone(row.configuration) as CookieYesLegacyConfiguration;
  const baseline: CookieYesLegacyBaseline = {configuration, documentUrl: url, capturedAtEpochMs: 100, lastSequence: 0};
  const value = encode(row.receipt);
  const cookies = [{name: "CookieLawInfoConsent", value, domain: "fixture.invalid", path: "/", httpOnly: false,
    secure: true, sameSite: "Lax" as const, expires: -1}];
  const writes: ActionStateWrite[] = [{storageType: "cookie", name: "CookieLawInfoConsent", value,
    cookieAssignment: `CookieLawInfoConsent=${value}; path=/`, documentUrl: url, observedAtEpochMs: 210, sequence: 1}];
  return {baseline, configuration, documentUrl: url, cookies, writes, actionAt: 200, readAt: 220};
}

for (const [index, fixture] of fixtures.cases.entries()) test(`documented current categories: ${fixture.name}`, () => {
  const data = input(index), state = verifyLegacyCookieYesReceipt(data);
  assert.equal(state?.decision ?? null, fixture.expectedDecision);
  assert.equal(decodeCanonicalConsentDecision("CookieLawInfoConsent", data.cookies[0]!.value, true), "unknown", "Standalone receipts remain insufficient.");
  if (state) {
    assert.equal(cookieYesLegacyReceiptEvidenceSchema.safeParse(state.cookieYesLegacyReceiptEvidence).success, true);
    assert.equal(JSON.stringify(state).includes(data.cookies[0]!.value), false, "No raw receipt is persisted.");
    assert.equal(JSON.stringify(state).includes("retired_custom_category"), false);
  }
});

for (const mode of ["missing_config", "unknown_category", "duplicate_category", "necessary_only", "missing_required", "version_changed",
  "required_split_changed", "document_changed", "future_baseline", "missing_cookie", "duplicate_cookie", "http_only", "partitioned",
  "old_identity", "unchanged", "no_write", "old_write", "future_write", "wrong_document_write", "wrong_path", "wrong_name",
  "no_assignment", "readback_changed", "missing_required_value", "false_required", "string_optional", "reversed_write", "over_cap", "old_sequence"] as const) {
  test(`legacy category proof rejects ${mode}`, () => {
    const data = input(), config = data.configuration as unknown as Record<string, unknown>;
    if (mode === "missing_config") data.configuration = undefined as never;
    if (mode === "unknown_category") data.configuration.categories.push("custom" as never);
    if (mode === "duplicate_category") data.configuration.categories.push("analytics");
    if (mode === "necessary_only") data.configuration.categories = ["necessary"];
    if (mode === "missing_required") data.configuration.requiredCategories = [];
    if (mode === "version_changed") data.configuration = {...data.configuration, consentVersion: 2};
    if (mode === "required_split_changed") data.configuration = {...data.configuration, requiredCategories: ["functional", "necessary"]};
    if (mode === "document_changed") data.documentUrl += "changed";
    if (mode === "future_baseline") data.baseline.capturedAtEpochMs = 201;
    if (mode === "missing_cookie") data.cookies = [];
    if (mode === "duplicate_cookie") data.cookies.push({...data.cookies[0]!});
    if (mode === "http_only") data.cookies[0]!.httpOnly = true;
    if (mode === "partitioned") Object.assign(data.cookies[0]!, {partitionKey: "https://fixture.invalid"});
    if (mode === "old_identity") data.baseline.beforeIdentitySha256 = "f".repeat(64);
    if (mode === "unchanged") data.baseline.beforeValueSha256 = sha(data.cookies[0]!.value);
    if (mode === "no_write") data.writes = [];
    if (mode === "old_sequence") data.baseline.lastSequence = 1;
    if (mode === "old_write") data.writes[0]!.observedAtEpochMs = 199;
    if (mode === "future_write") data.writes[0]!.observedAtEpochMs = 221;
    if (mode === "wrong_document_write") data.writes[0]!.documentUrl += "other";
    if (mode === "wrong_path") data.writes[0]!.cookieAssignment += "; path=/other";
    if (mode === "wrong_name") data.writes[0]!.cookieAssignment = data.writes[0]!.cookieAssignment!.replace("CookieLawInfoConsent", "other");
    if (mode === "no_assignment") delete data.writes[0]!.cookieAssignment;
    if (mode === "readback_changed") data.writes[0]!.value = "other";
    if (["missing_required_value", "false_required", "string_optional"].includes(mode)) {
      const fields = JSON.parse(Buffer.from(data.cookies[0]!.value, "base64").toString());
      if (mode === "missing_required_value") delete fields.necessary;
      if (mode === "false_required") fields.necessary = false;
      if (mode === "string_optional") fields.analytics = "true";
      data.cookies[0]!.value = encode(fields); data.writes[0]!.value = data.cookies[0]!.value;
      data.writes[0]!.cookieAssignment = `CookieLawInfoConsent=${data.cookies[0]!.value}; path=/`;
    }
    if (mode === "reversed_write") data.writes.push({...data.writes[0]!, sequence: 2, value: "reversed", observedAtEpochMs: 211});
    if (mode === "over_cap") {config.categories = Array(8).fill("analytics");}
    assert.equal(verifyLegacyCookieYesReceipt(data), undefined);
  });
}

test("bounded legacy JSON parser rejects duplicate/escaped keys and unsupported encodings", () => {
  for (const text of ['{"ver":1,"analytics":true,"analytics":false}', '{"ver":1,"analytics":true,"anal\\u0079tics":false}',
    '{"__proto__":true}', '{"ver":1,}', '{"ver":01}', '{"ver":1,"nested":{}}', '{"ver":1,"list":[]}',
    `{${Array.from({length: 25}, (_, i) => `"field${i}":true`).join(",")}}`]) {
    assert.equal(decodeLegacyCookieYesReceipt(Buffer.from(text).toString("base64")), undefined, text);
  }
  for (const value of ["", "x".repeat(2049), "!!==", "e30= ", "e30", "%7B%7D", encode("true")]) assert.equal(decodeLegacyCookieYesReceipt(value), undefined);
});

function browserFixture() {
  let evaluations = 0, cookieReads = 0, sdkCalls = 0;
  const data = input(), boxRows = data.configuration.categories.map(category => ({localName: "input",
    getAttribute(name: string) {return name === "type" ? "checkbox" : name === "data-id" ? `checkbox-${category}` : null;}}));
  const bar = {}, panel = {contains(box: unknown) {return boxRows.includes(box as typeof boxRows[number]);}};
  const control = {isConnected: true, closest() {return bar;}};
  const window: Record<string, unknown> = {Cli_Data: {consentVersion: 1, strictlyEnabled: ["necessary"]},
    CLI_PREFERNCE_COOKIE: "CookieLawInfoConsent", CLI_ACCEPT_COOKIE_NAME: "viewed_cookie_policy",
    CLI: {generateConsent() {sdkCalls++; throw Error("SDK must not be called");}}, __certscoreReadPostAcceptWrites: () => data.writes};
  const document = {querySelectorAll(selector: string) {return selector === "#cookie-law-info-bar" ? [bar]
    : selector === "#cliSettingsPopup" ? [panel] : selector === ".cli-user-preference-checkbox" ? boxRows : [];}};
  const run = (fn: Function, arg?: unknown) => {evaluations++; return vm.runInNewContext(`(${fn.toString()})(argument)`, {window, document, argument: arg});};
  const scope = {url: () => url, evaluate: async (fn: Function) => run(fn)} as unknown as Page;
  const locator = {evaluate: async (fn: Function) => run(fn, control)} as unknown as Locator;
  const context = {cookies: async () => {cookieReads++; return data.cookies;}} as unknown as BrowserContext;
  return {data, window, document, boxRows, bar, control, scope, locator, context, run,
    counts: () => ({evaluations, cookieReads, sdkCalls})};
}

test("real serialized snapshot binds current checkboxes without SDK/getter calls", () => {
  const f = browserFixture(); const result = f.run(readConsentActionSnapshot, f.control);
  assert.equal(result.legacyControlBound, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.cookieYesLegacy)), f.data.configuration);
  assert.deepEqual(f.counts(), {evaluations: 1, cookieReads: 0, sdkCalls: 0});
  for (const key of ["CLI", "Cli_Data", "CLI_PREFERNCE_COOKIE", "CLI_ACCEPT_COOKIE_NAME"]) {
    const other = browserFixture(); Object.defineProperty(other.window, key, {get() {throw Error("Accessor must not run");}});
    assert.equal(other.run(readConsentActionSnapshot, other.control).cookieYesLegacy, undefined);
  }
});

test("the shared serialized snapshot preserves existing loaded Complianz configuration", () => {
  const categories = ["functional", "preferences", "statistics", "marketing"];
  const window = {complianz: {prefix: "cmplz_", tcf_active: false}, cmplz_categories: categories};
  const snapshot = vm.runInNewContext(`(${readConsentActionSnapshot.toString()})()`, {window, cmplz_categories: categories});
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.complianz)), {prefix: "cmplz_", tcfActive: false, categories});
  assert.equal(snapshot.cookieYesLegacy, undefined);
});

for (const mode of ["outside_control", "missing_panel", "foreign_box", "over_cap", "duplicate", "unknown", "tcf", "required_accessor", "version_accessor", "renamed_cookie", "coexisting_modern"] as const) {
  test(`baseline refuses ${mode} without authorizing any action`, async () => {
    const f = browserFixture();
    if (mode === "outside_control") f.control.closest = () => ({});
    if (mode === "missing_panel") f.document.querySelectorAll = () => [];
    if (mode === "foreign_box") {f.boxRows.push({localName: "button", getAttribute: () => "checkbox-analytics"});}
    if (mode === "over_cap") f.boxRows.push(...Array(8).fill(f.boxRows[0]));
    if (mode === "duplicate") f.boxRows.push(f.boxRows[0]!);
    if (mode === "unknown") f.boxRows[0]!.getAttribute = name => name === "type" ? "checkbox" : "checkbox-custom";
    if (mode === "tcf") f.window.__tcfapi = () => {throw Error("Must not call TCF");};
    if (mode === "required_accessor") Object.defineProperty((f.window.Cli_Data as {strictlyEnabled: unknown[]}).strictlyEnabled, "0", {get() {throw Error("No getter");}});
    if (mode === "version_accessor") Object.defineProperty(f.window.Cli_Data, "consentVersion", {get() {throw Error("No getter");}});
    if (mode === "renamed_cookie") f.window.CLI_PREFERNCE_COOKIE = "renamed";
    if (mode === "coexisting_modern") f.data.cookies.push({...f.data.cookies[0]!, name: "cookieyes-consent"});
    assert.equal(await captureCookieYesConfirmationBaseline(f.scope, f.locator, f.context.cookies()), undefined);
    assert.equal(f.counts().sdkCalls, 0);
  });
}

test("existing named receipt read carries fresh complete proof; no standalone alias", async () => {
  const f = browserFixture(); f.data.cookies = []; f.data.writes = [];
  const baseline = await captureCookieYesConfirmationBaseline(f.scope, f.locator, f.context.cookies()); assert.ok(baseline);
  baseline.capturedAtEpochMs = 100; f.data.cookies = input().cookies; f.data.writes = input().writes;
  const state = await verifiedCookieDecision({context: f.context, scope: f.scope, cookieName: "cookieyes-consent", actionAt: 200, cookieYesLegacyBaseline: baseline});
  assert.equal(state?.decision, "granted"); assert.ok(state?.cookieYesLegacyReceiptEvidence);
  assert.deepEqual(f.counts(), {evaluations: 2, cookieReads: 2, sdkCalls: 0});
  assert.equal(await verifiedCookieDecision({context: f.context, scope: f.scope, cookieName: "cookieyes-consent", actionAt: 200}), undefined);
  f.window.Cli_Data = {consentVersion: 2, strictlyEnabled: ["necessary"]};
  assert.equal(await verifiedCookieDecision({context: f.context, scope: f.scope, cookieName: "cookieyes-consent", actionAt: 200, cookieYesLegacyBaseline: baseline}), undefined);
});

test("modern CookieYes skips the new renderer baseline read; slow legacy proof expires unknown", async () => {
  const modern = browserFixture(); modern.data.cookies[0]!.name = "cookieyes-consent";
  assert.equal(await captureCookieYesConfirmationBaseline(modern.scope, modern.locator, modern.context.cookies()), undefined);
  assert.deepEqual(modern.counts(), {evaluations: 0, cookieReads: 1, sdkCalls: 0});
  const slow = browserFixture();
  const locator = {evaluate: async () => new Promise<never>(() => {})} as unknown as Locator;
  assert.equal(await captureCookieYesConfirmationBaseline(slow.scope, locator, slow.context.cookies()), undefined);
  assert.equal(slow.counts().sdkCalls, 0);
});

test("a modern receipt appearing during legacy confirmation is ambiguous", () => {
  const data = input(); data.cookies.push({...data.cookies[0]!, name: "cookieyes-consent"});
  assert.equal(verifyLegacyCookieYesReceipt(data), undefined);
});

test("typed decision and packet envelope reject proof substitution", () => {
  const state = verifyLegacyCookieYesReceipt(input())!, proof = state.cookieYesLegacyReceiptEvidence!;
  const evidence = {policyVersion: "semantic_consent_registration.v2", decision: "granted", basis: "verified_state",
    timestampBasis: "instrumented_state_write", observedStateSha256: state.stateHash, observedAtMs: 210,
    cookieYesLegacyReceiptEvidence: proof};
  assert.equal(consentDecisionEvidenceSchema.safeParse(evidence).success, true);
  for (const extra of [{decision: "denied"}, {observedStateSha256: "a".repeat(64)}, {basis: "unverified"},
    {timestampBasis: "verified_state_observed"}, {tcfApiSource: "getTCData"}]) assert.equal(consentDecisionEvidenceSchema.safeParse({...evidence, ...extra}).success, false);
  const envelope = {startedAt: new Date(0).toISOString(), completedAt: new Date(300).toISOString(),
    dispatchedAtMs: 200, observedAtMs: 210, frameIdentitySha256: sha(url), cmpId: "CookieYes"};
  const errors: unknown[] = [], ctx = {addIssue(issue: unknown) {errors.push(issue);}, path: []};
  validateCookieYesLegacyReceiptEnvelope(proof, envelope, ctx); assert.equal(errors.length, 0);
  for (const extra of [{cmpId: "other"}, {frameIdentitySha256: "f".repeat(64)}, {dispatchedAtMs: 99}, {dispatchedAtMs: 211},
    {observedAtMs: 209}, {completedAt: new Date(219).toISOString()}]) {
    errors.length = 0; validateCookieYesLegacyReceiptEnvelope(proof, {...envelope, ...extra}, ctx); assert.equal(errors.length, 1);
  }
});

test("initial and terminal evidence carry the same category proof without changing registration", async context => {
  let now = 215; context.mock.method(Date, "now", () => now);
  for (const [index, action] of [[0, "accept"], [1, "reject"]] as const) {
    const state = verifyLegacyCookieYesReceipt(input(index))!;
    const read = terminalConsentDecisionRead({action, authorizedTargetSha256: sha(url), parentScanStartedAtMs: 0,
      dispatchedAtEpochMs: 200, observationWindowMs: 100, targetStillAuthorized: () => true, read: async () => state});
    read.start(); await Promise.resolve(); now = 300;
    const capture: AfterActionCapture = {policyVersion: "bounded_after_action_capture.v1", action,
      activationStatus: "completed", actionDispatchedAtMs: 200, captureEndedAtMs: 300, requestedWindowMs: 100,
      stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
      storageWriteCoverage: "bounded_main_document_sample", storageWrites: [], requestIds: []};
    const retained = read.retained(capture); assert.ok(retained);
    assert.deepEqual(retained.evidence.cookieYesLegacyReceiptEvidence, state.cookieYesLegacyReceiptEvidence);
    assert.equal(retained.evidence.decision, action === "accept" ? "granted" : "denied");
    now = 215;
  }
});

for (const [index, action] of [[0, "accept"], [1, "reject"]] as const) test(`${action} packet and canonical report projection retain validated current-category proof`, () => {
  const state = verifyLegacyCookieYesReceipt(input(index))!;
  const decisionEvidence = {policyVersion: "semantic_consent_registration.v2", basis: "verified_state", decision: state.decision,
    observedStateSha256: state.stateHash, observedAtMs: 210, timestampBasis: "instrumented_state_write",
    cookieYesLegacyReceiptEvidence: state.cookieYesLegacyReceiptEvidence};
  const registration = {status: "confirmed", [action === "accept" ? "acceptanceExercised" : "refusalExercised"]: true,
    actionDispatchedAtMs: 200, [action === "accept" ? "acceptanceRegisteredAtMs" : "refusalRegisteredAtMs"]: 210,
    witnesses: [{witnessType: "cmp_cookie_state", observedAtMs: 210, key: state.key,
      expectedState: state.decision, observedStateHash: state.stateHash, corroboratingOnly: false}]};
  const packet = {artifactVersion: action === "accept" ? "certscore.post_accept_evidence.v2" : "certscore.post_refusal_evidence.v2",
    artifactOnly: true, productionProjectable: false, scanId: "documented-category-fixture", targetUrl: url, normalizedUrl: url,
    observationBranch: action === "accept" ? "accept_only" : "reject_only", phase: "post_action", consentAction: action,
    startedAt: new Date(0).toISOString(), completedAt: new Date(300).toISOString(),
    resolver: {found: true, method: "cmp_registry_recipe", confidence: 1, recipeId: "fixture-current-categories", cmpId: "CookieYes"},
    actionControlProof: {contractVersion: "certscore.consent_action_control_proof.v1", action, observedAtMs: 99,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text", actionSemantics: "direct_label",
      classifierIntent: action, classifierConfidence: 1, cmpId: "CookieYes", recipeId: "fixture-current-categories",
      selectorHint: "#cookie-law-info-bar button", frameIdentitySha256: sha(url), visible: true, enabled: true, uniquelyActionable: true},
    [action === "accept" ? "acceptanceRegistration" : "refusalRegistration"]: registration,
    decisionEvidence, captureCoverage: {requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0}, observationWindowMs: 100,
    timing: {dispatchDelayMs: 0, navigationMs: 0, resolverMs: 0, confirmationMs: 10, observationMs: 90, totalMs: 300, readyAtMs: 300},
    network: {requests: [], [action === "accept" ? "postAcceptNonEssentialRequests" : "postRefusalNonEssentialRequests"]: [],
      [action === "accept" ? "activeRequestIdsAtAcceptanceRegistration" : "activeRequestIdsAtRefusalRegistration"]: []},
    storage: {preAction: [], postAction: [], preActionCapturedAtMs: 100, postActionCapturedAtMs: 300,
      [action === "accept" ? "writesAfterAccept" : "writesAfterRefusal"]: [],
      [action === "accept" ? "itemsCreatedOrChangedAfterAccept" : "nonEssentialItemsPersistingAfterRefusal"]: []},
    observations: [], cancellation: {requested: false, outcome: "not_requested"}, limitations: ["synthetic_documented_fixture"]};
  const parsed = action === "accept" ? postAcceptEvidencePacketSchema.parse(packet) : postRefusalEvidencePacketSchema.parse(packet);
  const projection = action === "accept" ? projectPostAcceptEvidenceForReport({packet: parsed as ReturnType<typeof postAcceptEvidencePacketSchema.parse>, packetSha256: "b".repeat(64)})
    : projectPostRefusalEvidenceForReport({packet: parsed as ReturnType<typeof postRefusalEvidencePacketSchema.parse>, packetSha256: "b".repeat(64)});
  assert.deepEqual(projection.decisionEvidence, decisionEvidence);
  const projectionSchema = action === "accept" ? postAcceptReportProjectionSchema : postRefusalReportProjectionSchema;
  assert.equal(projectionSchema.safeParse({...projection, packetSha256: undefined}).success, false);
  assert.equal(projectionSchema.safeParse({...projection, actionControlProof: {...projection.actionControlProof, cmpId: "other"}}).success, false);
  const schema = action === "accept" ? postAcceptEvidencePacketSchema : postRefusalEvidencePacketSchema;
  assert.equal(schema.safeParse({...packet, actionControlProof: {...packet.actionControlProof, cmpId: "other"}}).success, false);
  assert.equal(schema.safeParse({...packet, actionControlProof: {...packet.actionControlProof, frameIdentitySha256: "a".repeat(64)}}).success, false);
});
