import {createHash} from "node:crypto";
import {observedJourneySchema} from "../index";

/** New synthetic retained context, with repeated arrays beyond gzip's window.
 * No historical receipt or captured source is changed to build this fixture. */
export function canonicalWideJourneyFixture(observedAtMs=500) {
  const scripts=Array.from({length:600},(_,i)=>`https://static.example.test/asset/${createHash("sha256").update(`fixture-asset-${i}`).digest("hex")}.js`);
  return Array.from({length:60},(_,i)=>observedJourneySchema.parse({
    journeyId:`wide-infrastructure-${i}`,journeyType:"script",key:`wide-script-${i}`,displayName:"Fixture infrastructure",
    purpose:"infrastructure",sourceScanner:"pre_consent_runtime",firstObservedAtMs:observedAtMs,lastObservedAtMs:observedAtMs,
    firstObservedConsentState:"pre_consent",firstPartyOrThirdParty:"first_party",confidence:1,directVsInferred:"direct",
    relatedScripts:scripts,
  }));
}
