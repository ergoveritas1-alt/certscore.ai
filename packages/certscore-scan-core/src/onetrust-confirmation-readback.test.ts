import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import { captureOneTrustBaseline, verifyOneTrustCookieDecision } from "./onetrust-consent-state";
import { verifiedChangedOneTrustDecision, verifiedCookieDecision, verifiedCanonicalStateWrite } from "./consent-action-semantic-state";

for (const name of ["OptanonConsent", "OptanonConsent_tenant"]) {
  for (const value of ["groups=C0001:1,C0002:1", "groups=C0001:1,C0002:0"]) {
    test(`generic write verification cannot infer OneTrust completeness from ${name} ${value}`, async () => {
      const f=fixture();f.cookie().name=name;f.cookie().value=value;
      f.setWrites([{storageType:"cookie",name,value,observedAtEpochMs:101,sequence:1}]);
      const reasons: string[]=[];
      assert.equal(await verifiedCookieDecision({context:f.context,scope:f.scope,cookieName:name,
        actionAt:100,onDiagnostic:reason=>reasons.push(reason)}),undefined);
      assert.equal(await verifiedCanonicalStateWrite({context:f.context,scope:f.scope,actionAt:100,
        registeredKeys:[name],onDiagnostic:reason=>reasons.push(reason)}),undefined);
      assert.ok(reasons.includes("configuration_missing"));
      assert.equal(f.counts().cookieReads,0,"a generic path cannot establish the missing category universe with a cookie read");
    });
  }
}

test("an unsupported OneTrust write does not cancel an independent complete registered decision", async () => {
  const writes=[
    {storageType:"cookie",name:"OptanonConsent",value:"groups=C0001:1,C0002:0",observedAtEpochMs:101,sequence:1},
    {storageType:"local_storage",name:"consent_choice",value:"accepted_all",observedAtEpochMs:102,sequence:2},
  ];
  const scope={url:()=>"https://example.test/",evaluate:async(fn:Function)=>
    String(fn).includes("__certscoreReadPostAcceptWrites")?writes:"accepted_all"} as unknown as Page;
  const context={cookies:async()=>{throw Error("unsupported receipt must not trigger a cookie read");}} as unknown as BrowserContext;
  const result=await verifiedCanonicalStateWrite({scope,context,actionAt:100,registeredKeys:["consent_choice"]});
  assert.equal(result?.decision,"granted");assert.equal(result?.key,"consent_choice");
});

function fixture() {
  let cookieReads = 0, configurationReads = 0, writeReads = 0;
  let config: unknown = [{id: "C0001", status: "always active"}, {id: "C0002", status: "inactive"}];
  let cookies = [{name: "OptanonConsent", value: "groups=C0001:1,C0002:0&receipt=before", domain: "example.test", path: "/"}];
  let readback: typeof cookies | undefined;
  const after = "groups=C0001:1,C0002:1&receipt=after";
  let writes = [{storageType: "cookie", name: "OptanonConsent", value: after, observedAtEpochMs: 101, sequence: 1}];
  const scope = {url: () => "https://example.test/", evaluate: async (fn: Function) => {
    if (String(fn).includes("__certscoreReadPostAcceptWrites")) { writeReads++; return writes; }
    configurationReads++; return config;
  }} as unknown as Page;
  const context = {cookies: async () => { cookieReads++; return cookieReads > 1 && readback ? readback : cookies; }} as unknown as BrowserContext;
  return {scope, context, after, cookie: () => cookies[0]!,
    setCookies: (value: typeof cookies) => { cookies = value; }, setConfig: (value: unknown) => { config = value; },
    setReadback: (value: typeof cookies) => { readback = value; }, setWrites: (value: typeof writes) => { writes = value; },
    reset: () => { cookieReads = 0; configurationReads = 0; writeReads = 0; },
    counts: () => ({cookieReads, configurationReads, writeReads})};
}

test("OneTrust shares the changed candidate read and preserves independent receipt/configuration verification", async () => {
  const f = fixture(), baseline = await captureOneTrustBaseline(f.context, f.scope);
  assert.equal(baseline?.status, "verified");
  if (baseline?.status !== "verified") throw Error("fixture baseline");
  f.cookie().value = f.after;
  const input = {context: f.context, scope: f.scope, cookieName: "OptanonConsent" as const, actionAt: 100, oneTrustBaseline: baseline};
  f.reset();
  await f.context.cookies(f.scope.url()); // The former outer changed-receipt gate.
  const previous = await verifiedCookieDecision(input);
  assert.equal(f.counts().cookieReads, 3);
  f.reset();
  const current = await verifiedChangedOneTrustDecision(input);
  assert.deepEqual(current, previous);
  assert.equal(current?.decision, "granted");
  assert.deepEqual(f.counts(), {cookieReads: 2, configurationReads: 1, writeReads: 1});
});

for (const mode of ["unchanged", "missing", "ambiguous", "reversed", "identity", "drift", "partial", "foreign", "partial_baseline_no_write"] as const) {
  test(`OneTrust optimized confirmation preserves ${mode} safeguards`, async () => {
    const f = fixture();
    if (mode === "partial_baseline_no_write") f.cookie().value = "groups=C0001:1&receipt=before";
    const baseline = await captureOneTrustBaseline(f.context, f.scope);
    if (baseline?.status !== "verified") throw Error("fixture baseline");
    const before = {...f.cookie()}; f.cookie().value = f.after; f.reset();
    if (mode === "unchanged") f.cookie().value = before.value;
    if (mode === "missing") f.setCookies([]);
    if (mode === "ambiguous") f.setCookies([f.cookie(), {...f.cookie(), path: "/other"}]);
    if (mode === "reversed") f.setReadback([{...f.cookie(), value: "groups=C0001:1,C0002:0&receipt=reversed"}]);
    if (mode === "identity") f.setReadback([{...f.cookie(), path: "/other"}]);
    if (mode === "drift") f.setConfig([{id: "C0001", status: "always active"}, {id: "C0003", status: "inactive"}]);
    if (mode === "partial") f.cookie().value = "groups=C0001:1&receipt=after";
    if (mode === "foreign") f.cookie().value = "groups=C0001:1,OTHER:1&receipt=after";
    if (mode === "partial_baseline_no_write") f.setWrites([]);
    assert.equal(await verifiedChangedOneTrustDecision({context: f.context, scope: f.scope, cookieName: "OptanonConsent",
      actionAt: 100, oneTrustBaseline: baseline}), undefined);
    assert.ok(f.counts().cookieReads <= 2);
    if (["unchanged", "missing", "ambiguous"].includes(mode)) assert.deepEqual(f.counts(), {cookieReads: 1, configurationReads: 0, writeReads: 0});
  });
}

test("OneTrust baseline diagnostics distinguish missing, ambiguous and malformed receipts without new reads", async () => {
  for (const [mode, expected] of [["missing", "receipt_missing"], ["ambiguous", "receipt_ambiguous"], ["malformed", "receipt_malformed"]] as const) {
    const f = fixture();
    if (mode === "missing") f.setCookies([]);
    if (mode === "ambiguous") f.setCookies([f.cookie(), {...f.cookie(), path: "/other"}]);
    if (mode === "malformed") f.cookie().value = "groups=C0001:1,C0001:0";
    const baseline = await captureOneTrustBaseline(f.context, f.scope);
    assert.equal(baseline?.status, "invalid");
    if (!baseline) throw Error("fixture baseline");
    const reasons: string[] = []; f.reset();
    assert.equal(await verifyOneTrustCookieDecision(f.context, f.scope, baseline, reason => reasons.push(reason)), undefined);
    assert.deepEqual(reasons, [expected]);
    assert.deepEqual(f.counts(), {cookieReads: 0, configurationReads: 0, writeReads: 0});
  }
});

for (const identity of ["domain", "path", "partitionKey"] as const) {
  test(`OneTrust rejects a changed candidate ${identity} even if the original identity returns at readback`, async () => {
    const f = fixture();
    const baseline = await captureOneTrustBaseline(f.context, f.scope);
    if (baseline?.status !== "verified") throw Error("fixture baseline");
    const original = {...f.cookie(), value: f.after};
    const replacement = {...original, [identity]: identity === "domain" ? ".example.test"
      : identity === "path" ? "/other" : "https://publisher.test"};
    f.setCookies([replacement]);
    f.setReadback([original]);
    f.reset();
    const reasons: string[] = [];
    const result = await verifiedChangedOneTrustDecision({context: f.context, scope: f.scope,
      cookieName: "OptanonConsent", actionAt: 100, oneTrustBaseline: baseline,
      onDiagnostic: reason => reasons.push(reason)});
    assert.equal(result, undefined);
    assert.deepEqual(reasons, ["receipt_identity_changed"]);
    assert.deepEqual(f.counts(), {cookieReads: 1, configurationReads: 0, writeReads: 0});
    f.reset(); reasons.length = 0;
    assert.equal(await verifiedCookieDecision({context: f.context, scope: f.scope,
      cookieName: "OptanonConsent", actionAt: 100, oneTrustBaseline: baseline,
      onDiagnostic: reason => reasons.push(reason)}), undefined);
    assert.deepEqual(reasons, ["receipt_identity_changed"]);
    assert.deepEqual(f.counts(), {cookieReads: 1, configurationReads: 0, writeReads: 1});
  });
}
