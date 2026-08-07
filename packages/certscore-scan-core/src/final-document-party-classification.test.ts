import assert from "node:assert/strict";
import test from "node:test";
import type {
  CookieEvent,
  IframeEvent,
  NetworkEvent,
  NetworkResponseEvent,
  ScriptEvent,
} from "@certscore/contracts";
import { applyFinalDocumentPartyClassification } from "./scanners/pre-consent-runtime-scanner.js";

test("final document party classification rebases redirected site traffic without hiding external traffic", () => {
  const networkEvents = [
    {
      eventId: "request-final-site",
      eventType: "network_request",
      requestId: "request-final-site",
      requestUrl: "https://www.final-brand.example/app.js",
      url: "https://www.final-brand.example/app.js",
      hostname: "www.final-brand.example",
      sourceScanner: "fixture",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      timestampMs: 1,
      method: "GET",
      thirdParty: true,
      isThirdParty: true,
      evidenceRefs: [],
      confidence: 1,
      directVsInferred: "direct",
      queryParamNames: [],
      identifierParamNames: [],
      advertisingClickIdParamNames: [],
      tagContainerParamNames: [],
      redirectChainRequestIds: [],
      cookieNamesSent: [],
      hasIdentifierLikeParameters: false,
      hasAdvertisingClickIdParameters: false,
      hasTagContainerParameters: false,
      cookieHeaderPresent: false,
      authorizationHeaderPresent: false,
      collectionEndpointObserved: false,
      requestPayloadSignals: undefined,
    },
    {
      eventId: "request-external",
      eventType: "network_request",
      requestId: "request-external",
      requestUrl: "https://analytics.vendor.test/collect",
      url: "https://analytics.vendor.test/collect",
      hostname: "analytics.vendor.test",
      sourceScanner: "fixture",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      timestampMs: 2,
      method: "GET",
      thirdParty: true,
      isThirdParty: true,
      evidenceRefs: [],
      confidence: 1,
      directVsInferred: "direct",
      queryParamNames: [],
      identifierParamNames: [],
      advertisingClickIdParamNames: [],
      tagContainerParamNames: [],
      redirectChainRequestIds: [],
      cookieNamesSent: [],
      hasIdentifierLikeParameters: false,
      hasAdvertisingClickIdParameters: false,
      hasTagContainerParameters: false,
      cookieHeaderPresent: false,
      authorizationHeaderPresent: false,
      collectionEndpointObserved: true,
      endpointCategory: "analytics_collection",
    },
  ] as NetworkEvent[];
  const cookieEvents = [{
    eventId: "cookie-final-site",
    eventType: "cookie",
    timestampMs: 3,
    sourceScanner: "fixture",
    scenario: "fresh_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    cookieName: "session",
    cookieDomain: ".final-brand.example",
    cookieParty: "third_party",
    cookieClassificationBasis: ["third_party", "browser_snapshot"],
    operation: "browser_snapshot",
    vendorAssociated: false,
    cookiePurpose: "unknown",
    valueRedacted: true,
    evidenceRefs: [],
    confidence: 1,
    directVsInferred: "direct",
  }] as CookieEvent[];

  const result = applyFinalDocumentPartyClassification({
    finalDocumentUrl: "https://www.final-brand.example/home",
    networkEvents,
    networkResponseEvents: [] as NetworkResponseEvent[],
    cookieEvents,
    scriptEvents: [] as ScriptEvent[],
    iframeEvents: [] as IframeEvent[],
  });

  assert.equal(result.firstPartyDomain, "final-brand.example");
  assert.equal(networkEvents[0]?.firstParty, true);
  assert.equal(networkEvents[0]?.thirdParty, false);
  assert.equal(networkEvents[0]?.attributionStatus, "ignored_noise");
  assert.equal(networkEvents[1]?.thirdParty, true);
  assert.equal(cookieEvents[0]?.cookieParty, "first_party");
  assert.deepEqual(cookieEvents[0]?.cookieClassificationBasis, [
    "browser_snapshot",
    "first_party",
    "final_document_party",
    "canonical_cookie_kb:unknown",
  ]);
});

test("final document party classification leaves evidence unchanged without a usable final origin", () => {
  const networkEvents = [{ thirdParty: true }] as NetworkEvent[];
  const result = applyFinalDocumentPartyClassification({
    finalDocumentUrl: null,
    networkEvents,
    networkResponseEvents: [],
    cookieEvents: [],
    scriptEvents: [],
    iframeEvents: [],
  });
  assert.deepEqual(result, { firstPartyDomain: null, firstPartyHostname: null });
  assert.equal(networkEvents[0]?.thirdParty, true);
});

test("final document party classification retains typed Microsoft Clarity cookie knowledge", () => {
  const cookieEvents = [
    ["CLID", ".clarity.ms", 1_350],
    ["MUID", ".clarity.ms", 1_350],
    ["MR", ".c.bing.com", 2_150],
    ["SRM_B", ".c.bing.com", 2_150],
  ].map(([cookieName, cookieDomain, timestampMs], index) => ({
    eventId: `cookie-microsoft-${index}`,
    eventType: "cookie",
    timestampMs,
    sourceScanner: "fixture",
    scenario: "fresh_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    cookieName,
    cookieDomain,
    cookieParty: "unknown",
    cookieClassificationBasis: ["browser_snapshot"],
    operation: "periodic_cookie_snapshot",
    vendorAssociated: false,
    cookiePurpose: "unknown",
    cookieEssentiality: "unknown",
    cookieEssentialityReasonCodes: [],
    valueRedacted: true,
    evidenceRefs: [],
    confidence: 1,
    directVsInferred: "direct",
  })) as CookieEvent[];

  applyFinalDocumentPartyClassification({
    finalDocumentUrl: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
    networkEvents: [],
    networkResponseEvents: [],
    cookieEvents,
    scriptEvents: [],
    iframeEvents: [],
  });

  assert.deepEqual(
    cookieEvents.map((event) => [
      event.cookieName,
      event.cookiePurpose,
      event.cookieEssentiality,
      event.cookieEssentialityReasonCodes,
    ]),
    [
      ["CLID", "analytics", "non_essential", ["canonical_cookie_kb:analytics"]],
      ["MUID", "advertising", "non_essential", ["canonical_cookie_kb:advertising"]],
      ["MR", "advertising", "non_essential", ["canonical_cookie_kb:advertising"]],
      ["SRM_B", "unknown", "unknown", ["canonical_cookie_knowledge_no_match"]],
    ],
  );
  assert.ok(cookieEvents.every((event) => event.cookieParty === "third_party"));
});
