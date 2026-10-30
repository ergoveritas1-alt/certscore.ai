import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { evaluateCmpApiConfirmation, type CmpApiConfirmationBaseline } from "./cmp-api-confirmation.js";
import type { CmpApiConsentProvider, CmpApiConsentSnapshot } from "./cmp-api-consent-state.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";

const baseline = { canonicalState: "before", configurationSha256: "a".repeat(64), eventSequence: 2 };
const providers: CmpApiConsentProvider[] = ["borlabs", "osano", "hubspot", "drupal_eu_cookie", "didomi", "cookie_information", "cookiescript", "finsweet"];

for (const provider of providers) for (const decision of ["granted", "denied"] as const) {
  test(`${provider} ${decision}: shared API gate requires complete fresh action-bound evidence`, () => {
    const snapshot: CmpApiConsentSnapshot = { canonicalState: "after", configurationSha256: baseline.configurationSha256,
      decision, eventSequence: 3, eventObservedAtEpochMs: 100 };
    const evaluate = (state = snapshot, before: CmpApiConfirmationBaseline = baseline) => evaluateCmpApiConfirmation({provider, snapshot: state,
      baseline: before, decision, actionDispatchedAtEpochMs: 100});
    assert.deepEqual(evaluate(), {eligible: true});
    assert.deepEqual(evaluate({...snapshot, canonicalState: baseline.canonicalState}), {eligible: true}, "fresh saved choice may repeat the prior decision");
    for (const configurationSha256 of [undefined, "b".repeat(64)]) {
      assert.deepEqual(evaluate({...snapshot, configurationSha256}), {eligible:false, reason:"configuration_changed"});
    }
    for (const eventSequence of [0, 2]) {
      assert.deepEqual(evaluate({...snapshot, eventSequence}), {eligible:false, reason:"api_saved_event_unverified"}, "missing or reset event cannot reuse another session's state");
    }
    assert.deepEqual(evaluate({...snapshot, eventObservedAtEpochMs: 99}), {eligible:false, reason:"api_saved_event_unverified"});
    assert.deepEqual(evaluate(snapshot, {...baseline, canonicalState:undefined}), {eligible:false, reason:"api_saved_event_unverified"});
    assert.deepEqual(evaluate({...snapshot, eventObservedAtEpochMs: undefined}), provider === "borlabs"
      ? {eligible:true} : {eligible:false, reason:"api_saved_event_unverified"});
    for (const state of ["unknown", "mixed", decision === "granted" ? "denied" : "granted"] as const) {
      assert.deepEqual(evaluate({...snapshot, decision:state}), {eligible:false,
        reason:state === "unknown" ? "no_registered_complete_decision" : "opposite_or_mixed_decision"});
    }
  });
}

test("API gate preserves existing Termly/Transcend getter semantics without inventing saved-event proof", () => {
  for (const provider of ["termly", "transcend"] as const) {
    for (const decision of ["granted", "denied"] as const) {
      const input = {provider, baseline:{canonicalState:"before",eventSequence:0}, decision, actionDispatchedAtEpochMs:100};
      assert.deepEqual(evaluateCmpApiConfirmation({...input, snapshot:{canonicalState:"after",decision,eventSequence:0}}), {eligible:true});
      assert.deepEqual(evaluateCmpApiConfirmation({...input, snapshot:{canonicalState:"before",decision,eventSequence:0}}), {eligible:false,reason:"no_fresh_decision"});
      assert.deepEqual(evaluateCmpApiConfirmation({...input, snapshot:{canonicalState:"after",decision,eventSequence:1,eventObservedAtEpochMs:99}}), {eligible:false,reason:"api_saved_event_unverified"});
    }
  }
});

test("preexisting API snapshots without a configured-category fingerprint retain their supported semantics", () => {
  for (const provider of ["hubspot", "osano", "drupal_eu_cookie", "didomi"] as const) {
    assert.deepEqual(evaluateCmpApiConfirmation({provider,baseline:{canonicalState:"before",eventSequence:0},
      snapshot:{canonicalState:"after",decision:"denied",eventSequence:1,eventObservedAtEpochMs:100},
      decision:"denied",actionDispatchedAtEpochMs:100}), {eligible:true});
  }
});

// Explicit loopback recipes exercise the existing typed API branch without
// enabling a new production recipe or turning provider presence into consent.
for (const provider of ["cookiescript", "cookie_information", "finsweet"] as const) {
  for (const mode of ["saved", "missing_event", "wrong_document", "partial", "mixed", "inapplicable", "configuration_changed"] as const) {
    if (mode === "configuration_changed" && provider !== "cookiescript") continue;
    test(`Accept API ${provider}: ${mode}`, async () => {
      const scope = provider === "cookiescript" ? 'id="cookiescript_injected"'
        : provider === "cookie_information" ? 'id="coiOverlay"' : 'fs-consent-element="banner"';
      const event = provider === "cookiescript" ? "CookieScriptAcceptAll" : provider === "cookie_information" ? "CookieInformationConsentGiven" : "consentpro:consent-updated";
      let clicks = 0;
      const server = createServer((req, res) => {
        if (req.url === "/click") { clicks++; res.writeHead(204).end(); return; }
        res.setHeader("content-type", "text/html");
        if (req.url === "/child") { res.end("<html><body>Separate document</body></html>"); return; }
        res.end(`<section ${scope}><p>Choose optional cookies</p><button id="accept">Accept all</button></section>
          ${mode === "wrong_document" ? '<iframe src="/child"></iframe>' : ''}<script>
          const provider=${JSON.stringify(provider)},mode=${JSON.stringify(mode)};
          window.categories=['performance','targeting'];
          window.state=provider==='cookiescript'?{categories:[]}:provider==='finsweet'?{essential:true,analytics:false,marketing:false,personalization:false}:false;
          window.CookieScript={instance:{categories:()=>window.categories,currentState:()=>window.state}};
          window.CookieInformation={getConsentGivenFor:key=>window.state&&typeof window.state==='object'?window.state[key]:window.state};
          window.FinsweetConsentPro={consents:{get:()=>window.state}};
          document.querySelector('button').onclick=()=>{
            fetch('/click');document.querySelector('section').hidden=true;
            if(provider==='cookiescript'){
              window.state={action:'accept',categories:mode==='partial'?['unknown']:mode==='mixed'?['performance']:['performance','targeting']};
              if(mode==='inapplicable')window.categories=['strict'];
              if(mode==='configuration_changed'){window.categories=['performance'];window.state.categories=['performance'];}
            }else if(provider==='finsweet')window.state=mode==='partial'?{essential:true,analytics:true}:mode==='inapplicable'?{essential:true}:{essential:true,analytics:true,marketing:mode!=='mixed',personalization:true};
            else window.state=mode==='partial'?{cookie_cat_statistic:true}:mode==='inapplicable'?undefined:mode==='mixed'?{cookie_cat_functional:true,cookie_cat_marketing:false,cookie_cat_statistic:true}:true;
            if(mode==='missing_event')return;
            if(mode==='wrong_document'){const child=document.querySelector('iframe').contentWindow;child.dispatchEvent(new child.Event('${event}'));return;}
            ${provider === "finsweet" ? "document.documentElement" : "window"}.dispatchEvent(new Event('${event}'));
          };
          </script>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      try {
        const packet = await runPostAcceptObserver({scanId:`api-gate-${provider}-${mode}`,url:`http://127.0.0.1:${address.port}/`,
          recipe:{artifactVersion:"certscore.post_accept_action_recipe.v1",recipeId:`local-api-gate-${provider}`,controlSelector:"#accept",
            confirmation:{kind:"cmp_api_consent_state_changed",provider}},
          interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"},
          actionSearchTimeoutMs:3000,confirmationTimeoutMs:100,observationWindowMs:350});
        const confirmed = mode === "saved";
        assert.equal(clicks, 1, JSON.stringify(packet.limitations));
        assert.equal(packet.acceptanceRegistration.status, confirmed ? "confirmed" : "unconfirmed", JSON.stringify(packet.confirmationDiagnostics));
        if (["missing_event", "wrong_document"].includes(mode)) {
          assert.ok(packet.confirmationDiagnostics?.reasons.includes("api_saved_event_unverified"));
          assert.equal(packet.terminalDecisionEvidence, undefined);
        }
        if (provider === "cookiescript" && mode === "configuration_changed") {
          assert.ok(packet.confirmationDiagnostics?.reasons.includes("configuration_changed"));
        }
      } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    });
  }
}
