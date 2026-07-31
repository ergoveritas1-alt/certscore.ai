import assert from "node:assert/strict";
import test from "node:test";
import type { CookieEvent } from "@certscore/contracts";
import { applyFinalDocumentPartyClassification } from "./scanners/pre-consent-runtime-scanner";

function cookie(cookieName: string, cookieDomain: string): CookieEvent {
  return {
    artifactId: `cookie-${cookieName}`,
    consentStateAtTime: "pre_consent",
    cookieClassificationBasis: [],
    cookieDomain,
    cookieName,
    cookieParty: "unknown",
    cookiePurpose: "unknown",
    eventId: `event-${cookieName}`,
    eventType: "cookie",
    evidenceRefs: [],
    firstParty: false,
    hostname: cookieDomain,
    operation: "set_cookie_header",
    thirdParty: false,
    timestampMs: 100,
    topLevelUrl: "https://www.nbcnews.com/",
    url: `https://${cookieDomain}/`,
    valueRedacted: true,
    vendorAssociated: false
  };
}

test("NBCNews 0112a54a applies final-document PSL party attribution to cookie domains", () => {
  const cookieEvents = [
    cookie("demdex", "demdex.net"),
    cookie("cto_bundle", "criteo.com"),
    cookie("test_cookie", "doubleclick.net"),
    cookie("datadome", "taboola.com"),
    {
      ...cookie("_gcl_au", "nbcnews.com"),
      initiatorChain: ["https://securepubads.g.doubleclick.net/tag/js/gpt.js"],
      setByThirdPartyScript: true,
      setterScriptUrl: "https://securepubads.g.doubleclick.net/tag/js/gpt.js"
    }
  ];

  applyFinalDocumentPartyClassification({
    cookieEvents,
    finalDocumentUrl: "https://www.nbcnews.com/",
    iframeEvents: [],
    networkEvents: [],
    networkResponseEvents: [],
    scriptEvents: []
  });

  assert.deepEqual(cookieEvents.slice(0, 4).map((event) => event.cookieParty), [
    "third_party",
    "third_party",
    "third_party",
    "third_party"
  ]);
  assert.equal(cookieEvents[4]?.cookieParty, "first_party");
  assert.equal(cookieEvents[4]?.setByThirdPartyScript, true);
});
