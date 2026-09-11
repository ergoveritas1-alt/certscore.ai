import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { consentDecisionEvidenceSchema, projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { parseOneTrustCookieGroups } from "./onetrust-consent-state.js";
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
  for (const variant of ["matching", "opposite", "partial", "unknown_group", "configuration_drift", "duplicate_cookie", "unverifiable_configuration", "incomplete_baseline", "added_configuration_group"] as const) {
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
          ${variant === "incomplete_baseline" ? "groups.push({CustomGroupId:'C0005',Status:'inactive'});" : ""}
          window.OneTrust={GetDomainData:()=>({Groups:groups})};
          ${variant === "unverifiable_configuration" ? "groups[3].Status='unknown';" : ""}
          document.cookie='OptanonConsent=groups=C0001:1,C0003:1,C0002:0,gad:0&receipt=before; Path=/';
          document.querySelector('button').onclick=()=>{
            const grant=${variant === "opposite" ? action !== "accept" : action === "accept"} ? 1 : 0;
            ${variant === "added_configuration_group" ? "groups.push({CustomGroupId:'C0005',Status:'inactive'});" : ""}
            ${variant === "configuration_drift" ? "groups[1].Status='inactive';" : ""}
            document.cookie='OptanonConsent=groups=C0001:1,C0003:1,C0002:'+grant+${variant === "partial" ? "''" : variant === "unknown_group" ? "',unregistered:'+grant" : "',gad:'+grant"}+'&receipt=after; Path=/';
            ${variant === "duplicate_cookie" ? "document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=duplicate; Path=/fixture';" : ""}
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
        assert.equal(registration.status, variant === "matching" ? "confirmed" : "unconfirmed");
        if (variant === "matching" || variant === "opposite") {
          const evidence = packet.decisionEvidence!;
          assert.ok(evidence.oneTrustGroupEvidence);
          assert.equal(evidence.oneTrustGroupEvidence.groups.find((g) => g.id === "C0003")?.alwaysActive, true);
          assert.equal(evidence.timestampBasis, "instrumented_state_write");
          assert.equal(consentDecisionEvidenceSchema.safeParse({ ...evidence, observedStateSha256: "0".repeat(64) }).success, false);
          const proof = evidence.oneTrustGroupEvidence;
          for (const invalid of [
            { ...evidence, decision: evidence.decision === "granted" ? "denied" : "granted" },
            { ...evidence, tcfApiSource: "addEventListener" },
            { ...evidence, oneTrustGroupEvidence: { ...proof, beforeValueSha256: proof.afterValueSha256 } },
            { ...evidence, oneTrustGroupEvidence: { ...proof, configuredGroupIds: [...proof.configuredGroupIds, "omitted"] } },
            { ...evidence, oneTrustGroupEvidence: { ...proof, baselineGroupIds: proof.baselineGroupIds.slice(1) } },
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
