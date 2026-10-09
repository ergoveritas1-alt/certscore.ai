import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { consentDecisionEvidenceSchema, projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { captureOneTrustBaseline, parseOneTrustCookieGroups } from "./onetrust-consent-state.js";
import { verifiedCookieDecision } from "./consent-action-semantic-state.js";
import { chromium } from "playwright";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";

test("OneTrust parsing requires one complete bounded groups field without duplicate identities", () => {
  assert.deepEqual([...parseOneTrustCookieGroups("groups=C0001%3A1%2Cgad%3A0")!], [["C0001", true], ["gad", false]]);
  for (const value of ["groups=", "groups=C0001:1&groups=gad:0", "groups=C0001:1,gad:0,gad:1", "groups=gad:false", "groups=gad:0,", "groups=%2567ad:0", "x".repeat(4097)]) {
    assert.equal(parseOneTrustCookieGroups(value), undefined, value.slice(0, 80));
  }
});

for (const action of ["accept", "reject"] as const) {
  for (const variant of ["matching", "opposite", "partial", "unknown_group", "configuration_drift", "duplicate_cookie", "unverifiable_configuration", "incomplete_baseline", "added_configuration_group", "partial_baseline_completed", "partial_baseline_opposite", "partial_baseline_unchanged", "partial_baseline_drift", "partial_baseline_duplicate", "partial_baseline_identity", "unknown_baseline_group", "unchanged_value"] as const) {
    test(`${action}: configured OneTrust groups ${variant}`, async () => {
      let clicks = 0;
      const server = createServer((request, response) => {
        if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
        response.setHeader("content-type", "text/html");
        response.end(`<!doctype html><section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent">
          <p>Choose whether to allow optional analytics cookies.</p>
          <button id="onetrust-${action === "accept" ? "accept-btn" : "reject-all"}-handler">${action === "accept" ? "Accept all" : "Reject all"}</button></section><script>
          const groups=[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0003',Status:'always active'},
            {CustomGroupId:'C0002',Status:'inactive'},{CustomGroupId:'gad',Status:'inactive'}];
          ${variant === "incomplete_baseline" || variant.startsWith("partial_baseline") ? "groups.push({CustomGroupId:'C0005',Status:'inactive'});" : ""}
          window.OneTrust={GetDomainData:()=>({Groups:groups})};
          ${variant === "unverifiable_configuration" ? "groups[3].Status='unknown';" : ""}
          document.cookie='OptanonConsent=groups=C0001:1,C0003:1,C0002:0,gad:0${variant === 'unknown_baseline_group' ? ',alien:0' : ''}&receipt=before; Path=/';
          document.querySelector('button').onclick=()=>{
            const grant=${(variant === "opposite" || variant === "partial_baseline_opposite") ? action !== "accept" : action === "accept"} ? 1 : 0;
            ${variant === "added_configuration_group" ? "groups.push({CustomGroupId:'C0005',Status:'inactive'});" : ""}
            ${(variant === "configuration_drift" || variant === "partial_baseline_drift") ? "groups[1].Status='inactive';" : ""}
            ${variant === 'partial_baseline_identity' ? "document.cookie='OptanonConsent=;Max-Age=0;Path=/';" : ''}
            ${variant === 'partial_baseline_unchanged' || variant === 'unchanged_value' ? '' : `document.cookie='OptanonConsent=groups=C0001:1,C0003:1,C0002:'+grant+${variant === "partial" ? "''" : variant === "unknown_group" ? "',unregistered:'+grant" : "',gad:'+grant"}+'${variant.startsWith('partial_baseline') ? ',C0005:'+ (variant === 'partial_baseline_opposite' ? (action === 'accept' ? 0 : 1) : (action === 'accept' ? 1 : 0)) : ''}&receipt=after; Path=${variant === 'partial_baseline_identity' ? '/fixture' : '/'}';`}
            ${(variant === "duplicate_cookie" || variant === "partial_baseline_duplicate") ? "document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=duplicate; Path=/fixture';" : ""}
            document.querySelector('section').hidden=true;fetch('/click');
          };</script>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const common = { url: `http://127.0.0.1:${address.port}/fixture`, scanId: `onetrust-groups-${action}`,
        actionSearchTimeoutMs: 1000, confirmationTimeoutMs: 100, observationWindowMs: 50,
        interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" } as const };
      try {
        const packet = action === "accept"
          ? await runPostAcceptObserver({ ...common, recipe: buildCanonicalPostAcceptActionRecipes().find((r) => r.cmpId === "OneTrust")! })
          : await runPostRefusalObserver({ ...common, recipe: buildCanonicalPostRefusalActionRecipes().find((r) => r.cmpId === "OneTrust")! });
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        assert.equal(clicks, 1);
        assert.equal(registration.status, (variant === "matching" || variant === "partial_baseline_completed") ? "confirmed" : "unconfirmed");
        if (variant === "unknown_baseline_group") assert.ok(packet.limitations.includes("onetrust_confirmation_baseline:cookie_groups_unconfigured"));
        if (variant === "unverifiable_configuration") assert.ok(packet.limitations.includes("onetrust_confirmation_baseline:configuration_unverifiable"));
        if (variant === "matching") assert.ok(!packet.limitations.some(reason => reason.startsWith("onetrust_confirmation_baseline:")));
        if (["matching", "opposite", "partial_baseline_completed", "partial_baseline_opposite"].includes(variant)) {
          const evidence = packet.decisionEvidence!;
          assert.ok(evidence.oneTrustGroupEvidence);
          assert.equal(evidence.oneTrustGroupEvidence.policyVersion,variant.startsWith("partial_baseline") ? "onetrust_cookie_groups.v2" : "onetrust_cookie_groups.v1");
          assert.equal(evidence.oneTrustGroupEvidence.groups.find((g) => g.id === "C0003")?.alwaysActive, true);
          assert.equal(evidence.timestampBasis, "instrumented_state_write");
          assert.equal(consentDecisionEvidenceSchema.safeParse({ ...evidence, observedStateSha256: "0".repeat(64) }).success, false);
          const proof = evidence.oneTrustGroupEvidence;
          for (const invalid of [
            { ...evidence, decision: evidence.decision === "granted" ? "denied" : "granted" },
            { ...evidence, tcfApiSource: "addEventListener" },
            { ...evidence, oneTrustGroupEvidence: { ...proof, beforeValueSha256: proof.afterValueSha256 } },
            { ...evidence, oneTrustGroupEvidence: { ...proof, configuredGroupIds: [...proof.configuredGroupIds, "omitted"] } },
            { ...evidence, oneTrustGroupEvidence: { ...proof, baselineGroupIds: [...proof.baselineGroupIds,"unknown"] } },
            { ...evidence, oneTrustGroupEvidence: { ...proof, groups: proof.groups.slice(1) } },
            { ...evidence, oneTrustGroupEvidence: { ...proof, groups: proof.groups.map((group) => ({ ...group, alwaysActive: true })) } },
          ]) assert.equal(consentDecisionEvidenceSchema.safeParse(invalid).success, false);

          const projection = "acceptanceRegistration" in packet
            ? projectPostAcceptEvidenceForReport({ packet }) : projectPostRefusalEvidenceForReport({ packet });
          assert.deepEqual(projection.decisionEvidence, evidence);
        } else assert.equal(packet.decisionEvidence?.oneTrustGroupEvidence, undefined);
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    });
  }
}

test("partial-baseline confirmation requires the exact complete value written after dispatch", async () => {
  const server = createServer((_request,response)=>response.end("<!doctype html>"));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address && typeof address!=="string");
  const browser = await chromium.launch({headless:true});
  try {
    const context=await browser.newContext(), page=await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.evaluate(()=>{
      const target=window as any;
      target.OneTrust={GetDomainData(){return {Groups:[{CustomGroupId:"C0001",Status:"always active"},{CustomGroupId:"C0002",Status:"inactive"}]};}};
      document.cookie="OptanonConsent=groups=C0001:1&receipt=before;path=/";
      target.__certscoreReadPostAcceptWrites=function(){return target.fixtureWrites??[];};
    });
    const baseline=await captureOneTrustBaseline(context,page);assert.equal(baseline?.status,"verified");
    const actionAt=Date.now();
    await page.evaluate(()=>{document.cookie="OptanonConsent=groups=C0001:1,C0002:0&receipt=after;path=/";});
    const common={context,scope:page,cookieName:"OptanonConsent",actionAt,oneTrustBaseline:baseline};
    assert.equal(await verifiedCookieDecision(common),undefined,"a changed value without a bound write is insufficient");
    for (const [time,value,expected] of [
      [actionAt-1,"groups=C0001:1,C0002:0&receipt=after",false],
      [actionAt+1,"groups=C0001:1,C0002:1&receipt=other",false],
      [actionAt+1,"groups=C0001:1,C0002:0&receipt=after",true],
    ] as const) {
      await page.evaluate(({time,value})=>{(window as any).fixtureWrites=[{storageType:"cookie",name:"OptanonConsent",value,observedAtEpochMs:time,sequence:1}];},{time,value});
      const result=await verifiedCookieDecision(common);
      assert.equal(Boolean(result),expected);
      if(result){assert.equal(result.decision,"denied");assert.equal(result.oneTrustGroupEvidence?.policyVersion,"onetrust_cookie_groups.v2");}
    }
  } finally {await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
