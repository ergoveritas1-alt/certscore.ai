import assert from "node:assert/strict";
import test from "node:test";
import {runInNewContext} from "node:vm";
import type {Page} from "playwright";
import {readDocumentedConsentApi} from "./documented-consent-api";
import {evaluateCmpApiConfirmation} from "./cmp-api-confirmation";
import fixtures from "../../certscore-contracts/src/test-fixtures/cookie-information-protocol.json";

function fixture(active: string[], state: Record<string, unknown>) {
  let calls = 0, evaluations = 0, now = 10;
  const listeners = new Map<string, Array<() => void>>();
  const window: Record<string, any> = {cicl: [...active], cicc: {...state}, CookieInformation: {
    getConsentGivenFor: (key: string) => {calls++; return window.cicc[key];},
  }, addEventListener: (name: string, callback: () => void) => listeners.set(name, [...(listeners.get(name) ?? []), callback])};
  const document = {querySelectorAll: () => [{}]};
  const sandbox = {window, document, Date: {now: () => now}};
  const scope = {evaluate: async (fn: Function, argument: unknown) => {
    evaluations++; return runInNewContext(`(${fn.toString()})(argument)`, {...sandbox, argument});
  }} as unknown as Page;
  return {scope, window, calls: () => calls, evaluations: () => evaluations,
    emit: () => {now = 100; for (const callback of listeners.get("CookieInformationConsentGiven") ?? []) callback();}};
}

test("Cookie Information current active categories include Unclassified and configured subsets", async () => {
  for (const source of fixtures.cases) {
    const f = fixture(source.activeCategories, source.loadedState);
    const result = await readDocumentedConsentApi(f.scope, "cookie_information");
    assert.equal(result?.decision, source.expectedDecisionWithLoadedConfiguration, source.name);
    assert.equal(f.evaluations(), 1);
    assert.equal(f.calls(), 0, "Already-loaded own data replaces the old getters without an extra SDK call.");
  }
});

test("Cookie Information configuration/state accessors and incomplete or unsupported universes fail closed", async () => {
  const valid = fixtures.cases[0]!;
  for (const mode of ["missing_config", "duplicate", "unknown", "empty", "necessary_only", "missing_state", "partial_state", "necessary_false", "category_accessor", "state_accessor", "array_accessor", "over_cap", "tcf", "missing_api"]) {
    const f = fixture(valid.activeCategories, valid.loadedState);
    if (mode === "missing_config") delete f.window.cicl;
    if (mode === "duplicate") f.window.cicl.push(f.window.cicl[1]);
    if (mode === "unknown") f.window.cicl[1] = "cookie_cat_custom";
    if (mode === "empty") f.window.cicl = [];
    if (mode === "necessary_only") f.window.cicl = ["cookie_cat_necessary"];
    if (mode === "missing_state") delete f.window.cicc;
    if (mode === "partial_state") delete f.window.cicc.cookie_cat_unclassified;
    if (mode === "necessary_false") f.window.cicc.cookie_cat_necessary = false;
    if (mode === "category_accessor") Object.defineProperty(f.window, "cicl", {get() {throw Error("Must not invoke configuration getter");}});
    if (mode === "state_accessor") Object.defineProperty(f.window.cicc, "cookie_cat_marketing", {get() {throw Error("Must not invoke state getter");}});
    if (mode === "array_accessor") Object.defineProperty(f.window.cicl, "0", {get() {throw Error("Must not invoke array getter");}});
    if (mode === "over_cap") f.window.cicl = Array(100).fill("cookie_cat_marketing");
    if (mode === "tcf") f.window.__tcfapi = () => {throw Error("No TCF API call allowed");};
    if (mode === "missing_api") delete f.window.CookieInformation;
    assert.equal(await readDocumentedConsentApi(f.scope, "cookie_information"), undefined, mode);
  }
});

test("Cookie Information still requires a fresh event and stable configured universe for confirmation", async () => {
  const active = fixtures.cases[0]!.activeCategories;
  const f = fixture(active, Object.fromEntries(active.map(key => [key, key === "cookie_cat_necessary"])));
  const before = await readDocumentedConsentApi(f.scope, "cookie_information"); assert.ok(before);
  f.window.cicc = {...fixtures.cases[0]!.loadedState};
  const changed = await readDocumentedConsentApi(f.scope, "cookie_information"); assert.ok(changed);
  const baseline = {canonicalState: before.canonicalState, configurationSha256: before.configurationSha256, eventSequence: before.eventSequence};
  assert.equal(evaluateCmpApiConfirmation({provider: "cookie_information", baseline, snapshot: changed, decision: "granted", actionDispatchedAtEpochMs: 50}).eligible, false);
  f.emit();
  const saved = await readDocumentedConsentApi(f.scope, "cookie_information"); assert.ok(saved);
  assert.equal(evaluateCmpApiConfirmation({provider: "cookie_information", baseline, snapshot: saved, decision: "granted", actionDispatchedAtEpochMs: 50}).eligible, true);
  f.window.cicl = ["cookie_cat_necessary", "cookie_cat_marketing"];
  assert.equal(await readDocumentedConsentApi(f.scope, "cookie_information"), undefined, "A saved event cannot be reused after the category universe changes.");
  assert.equal(f.calls(), 0);
});
