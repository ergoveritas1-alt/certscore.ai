import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { classifyConsentControlLabel, CONSENT_ACTION_CONTROL_PROOF_VERSION, UNSW_NECESSARY_ONLY_REJECT, type ConsentActionControlProof } from "@certscore/contracts";
import { buildWorkerDiscoveredClick, verifyWorkerDiscoveredClick } from "./worker-discovered-click";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const url = "https://fixture.example.com/";
const scanId = "842f5466-1781-4939-bc2f-3d9ee981976b";

for (const action of ["accept", "reject"] as const) {
  test(`worker-discovered ${action} receipt binds the exact completed click to its retained packet`, () => {
    const control = {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION, action, actionSemantics: "direct_label",
      classifierIntent: action, classifierConfidence: 0.91, classifierReasonCodes: [], observedAtMs: 125,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text",
      selectorHint: "#confirmed", recipeId: "reviewed fixture", visible: true, enabled: true, uniquelyActionable: true,
      authorizedTargetSha256: sha(url), frameIdentitySha256: sha(url),
    } satisfies ConsentActionControlProof;
    const binding = { scanId, action, parentDispatchSha256: sha("dispatch"), requestedUrl: url };
    const packet = { parentScanId: scanId, targetUrl: url, normalizedUrl: url, actionControlProof: control,
      interactionDiagnostics: { click: { outcome: "completed" } } };
    const packetBytes = Buffer.from(JSON.stringify(packet));
    const click = { control, recheckedAtMs: 1100, dispatchedAtMs: 1102, completedAtMs: 1120, deadlineAtMs: 1320 };
    const body = buildWorkerDiscoveredClick(binding, click, packetBytes);
    assert.ok(body);
    const input = { body, metadataSha256: sha(body), packetBytes, packetSha256: sha(packetBytes),
      binding, workerDispatchedAtMs: 1000, readAtMs: 1350 };
    assert.equal(verifyWorkerDiscoveredClick(input)?.reserveMs, 200);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, workerDispatchedAtMs: 1101 }), undefined);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, readAtMs: 1119 }), undefined);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, packetSha256: sha("changed packet") }), undefined);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, binding: { ...binding, parentDispatchSha256: sha("other parent") } }), undefined);
    assert.equal(buildWorkerDiscoveredClick(binding, { ...click, deadlineAtMs: 1319 }, packetBytes), undefined);
    assert.equal(buildWorkerDiscoveredClick(binding, { ...click, control: { ...control, selectorHint: "#different" } }, packetBytes), undefined);
    assert.equal(buildWorkerDiscoveredClick(binding, click, Buffer.from(JSON.stringify({ ...packet, targetUrl: url + "changed" }))), undefined);
    const lucidLogin = "https://lucid.app/users/login";
    const lucidControl = {
      ...control, cmpId: "Osano",
      authorizedTargetSha256: sha(lucidLogin), frameIdentitySha256: sha(lucidLogin + "#/login"),
    };
    const lucidPacket = { ...packet, targetUrl: lucidLogin, actionControlProof: lucidControl };
    const lucidBytes = Buffer.from(JSON.stringify(lucidPacket));
    const lucidClick = { ...click, control: lucidControl };
    const lucidReceipt = buildWorkerDiscoveredClick(binding, lucidClick, lucidBytes);
    assert.ok(lucidReceipt);
    assert.equal(verifyWorkerDiscoveredClick({
      ...input, body: lucidReceipt, metadataSha256: sha(lucidReceipt), packetBytes: lucidBytes, packetSha256: sha(lucidBytes),
    })?.reserveMs, 200);

    for (const changed of [
      { ...lucidControl, frameIdentitySha256: sha(lucidLogin + "#/settings") },
      { ...lucidControl, cmpId: "Cookiebot" },
    ]) {
      assert.equal(buildWorkerDiscoveredClick(binding, { ...click, control: changed },
        Buffer.from(JSON.stringify({ ...lucidPacket, actionControlProof: changed }))), undefined);
    }
  });
}


const unsw = UNSW_NECESSARY_ONLY_REJECT;
for (const {site, requestedUrl, targetUrl, accessibleLabel, contextText, policyVersion} of [
  {site: "IATA", requestedUrl: "https://iata.org/", targetUrl: "https://www.iata.org/", accessibleLabel: "Accept Only Necessary",
    contextText: "Selecting Accept All enables tracking technologies. Selecting Accept Only Necessary or withdrawing your consent will disable them.",
    policyVersion: "label_bound_necessary_only_reject.v2"},
  {site: "UNSW", requestedUrl: unsw.requestedUrl, targetUrl: unsw.documentUrl, accessibleLabel: unsw.label,
    contextText: unsw.instruction, policyVersion: unsw.policyVersion},
] as const) {
  test(`${site}’s named necessary-only Reject receipt requires its exact route and banner instruction`, () => {
    const classification = classifyConsentControlLabel({label: accessibleLabel, usage: "observation",
      classifierProfile: "multilingual_v1", contextText, hasConsentContext: true});
    const control = {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION, action: "reject", actionSemantics: "canonical_necessary_only_recipe",
      classifierIntent: "reject", classifierConfidence: classification.confidence,
      classifierReasonCodes: classification.reasonCodes, matchStrength: classification.matchStrength, matchedLocale: classification.matchedLocale,
      observedAtMs: 125, accessibleLabel, labelSource: "visible_text",
      cmpId: "OneTrust", recipeId: "canonical-cmp:OneTrust:reject:v3",
      selectorHint: "#onetrust-reject-all-handler, #onetrust-banner-sdk.ot-close-btn-link button.onetrust-close-btn-handler.banner-close-button",
      labelBoundNecessaryOnly: {policyVersion, bannerSelector: "#onetrust-banner-sdk",
        controlSelector: "#onetrust-reject-all-handler", contextText},
      visible: true, enabled: true, uniquelyActionable: true, authorizedTargetSha256: sha(targetUrl), frameIdentitySha256: sha(targetUrl),
    } satisfies ConsentActionControlProof;
    const binding = {scanId, action: "reject" as const, parentDispatchSha256: sha("dispatch"), requestedUrl};
    const packet = {parentScanId: scanId, targetUrl, normalizedUrl: requestedUrl, actionControlProof: control,
      interactionDiagnostics: {click: {outcome: "completed"}}};
    const click = {control, recheckedAtMs: 1100, dispatchedAtMs: 1102, completedAtMs: 1120, deadlineAtMs: 1320};
    const packetBytes = Buffer.from(JSON.stringify(packet));
    const body = buildWorkerDiscoveredClick(binding, click, packetBytes);
    assert.ok(body);
    assert.equal(verifyWorkerDiscoveredClick({body, metadataSha256: sha(body), packetBytes, packetSha256: sha(packetBytes),
      binding, workerDispatchedAtMs: 1000, readAtMs: 1350})?.reserveMs, 200);

    for (const changed of [
      {...control, labelBoundNecessaryOnly: undefined},
      {...control, labelBoundNecessaryOnly: {...control.labelBoundNecessaryOnly, contextText: "We use cookies for analytics."}},
      {...control, selectorHint: "#onetrust-reject-all-handler"},
      {...control, labelBoundNecessaryOnly: {...control.labelBoundNecessaryOnly, policyVersion: "label_bound_necessary_only_reject.v1" as const}},
    ]) {
      assert.equal(buildWorkerDiscoveredClick(binding, {...click, control: changed},
        Buffer.from(JSON.stringify({...packet, actionControlProof: changed}))), undefined);
    }
    const otherRequest = requestedUrl + "unreviewed/";
    assert.equal(buildWorkerDiscoveredClick({...binding, requestedUrl: otherRequest}, click,
      Buffer.from(JSON.stringify({...packet, normalizedUrl: otherRequest}))), undefined);
    const otherTarget = targetUrl + "unreviewed/";
    const otherControl = {...control, authorizedTargetSha256: sha(otherTarget), frameIdentitySha256: sha(otherTarget)};
    assert.equal(buildWorkerDiscoveredClick(binding, {...click, control: otherControl},
      Buffer.from(JSON.stringify({...packet, targetUrl: otherTarget, actionControlProof: otherControl}))), undefined);
  });
}

for (const action of ["accept", "reject"] as const) {
  test(`worker-discovered ${action} receipt uses the verified exact redirect behind a redacted URL`, () => {
    const requestedUrl = "https://fixture.example.com/?locale=de";
    const finalTarget = "https://www.fixture.example.com/?locale=de&redirect=1";
    const exactTargetSha256 = sha(finalTarget);
    const control = {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION, action, actionSemantics: "direct_label",
      classifierIntent: action, classifierConfidence: 0.91, classifierReasonCodes: [], observedAtMs: 125,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text",
      selectorHint: "#confirmed", recipeId: "reviewed fixture", visible: true, enabled: true, uniquelyActionable: true,
      authorizedTargetSha256: exactTargetSha256, frameIdentitySha256: exactTargetSha256,
    } satisfies ConsentActionControlProof;
    const navigation = {documentCommitted: true, finalUrlAuthorized: true, redirectResolution: {
      status: "resolved", requestedTargetSha256: sha(requestedUrl), finalExactTargetSha256: exactTargetSha256,
    }};
    const packet = {parentScanId: scanId, targetUrl: "https://www.fixture.example.com/",
      normalizedUrl: "https://fixture.example.com/", exactTargetSha256, actionControlProof: control,
      interactionDiagnostics: {click: {outcome: "completed"}, navigation}};
    const binding = {scanId, action, parentDispatchSha256: sha("dispatch"), requestedUrl};
    const click = {control, recheckedAtMs: 1100, dispatchedAtMs: 1102, completedAtMs: 1120, deadlineAtMs: 1320};
    const packetBytes = Buffer.from(JSON.stringify(packet));
    const body = buildWorkerDiscoveredClick(binding, click, packetBytes);
    assert.ok(body);
    assert.doesNotMatch(body.toString(), /locale=|redirect=/);
    assert.equal(verifyWorkerDiscoveredClick({body, metadataSha256: sha(body), packetBytes, packetSha256: sha(packetBytes),
      binding, workerDispatchedAtMs: 1000, readAtMs: 1350})?.reserveMs, 200);
    for (const changed of [
      {...packet, exactTargetSha256: sha("wrong exact destination")},
      {...packet, exactTargetSha256: undefined},
      {...packet, normalizedUrl: "https://fixture.example.com/unrelated"},
      {...packet, interactionDiagnostics: {...packet.interactionDiagnostics, navigation: {...navigation, finalUrlAuthorized: false}}},
      {...packet, interactionDiagnostics: {...packet.interactionDiagnostics, navigation: {...navigation, redirectResolution: {
        ...navigation.redirectResolution, requestedTargetSha256: sha("different request"),
      }}}},
      {...packet, interactionDiagnostics: {...packet.interactionDiagnostics, navigation: {...navigation, redirectResolution: {
        ...navigation.redirectResolution, finalExactTargetSha256: sha("different destination"),
      }}}},
    ]) {
      assert.equal(buildWorkerDiscoveredClick(binding, click, Buffer.from(JSON.stringify(changed))), undefined);
    }
  });
}
