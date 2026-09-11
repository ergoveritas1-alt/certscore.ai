import { gpcRuntimeFixture } from "../../../certscore-contracts/src/test-fixtures/gpc-runtime.js";
import { gpcDocumentHash } from "../gpc-signal-capture.js";
import { buildObservedJourneys } from "../journey-builder.js";

/** A real canonical journey combining an early bootstrap and purpose-bearing endpoint. */
export function gpcJourneyWindowFixture(enabled: boolean, purpose: "advertising" | "analytics", atMs = 1500) {
  const bundle = gpcRuntimeFixture({ enabled, vendors: [
    { name: "Example Vendor", purpose: "tag_management", atMs: 200 },
    { name: "Example Vendor", purpose, atMs },
  ] });
  bundle.normalizedVendorObservations[0]!.product = "Tag Manager";
  bundle.normalizedVendorObservations[1]!.product = "Collection";
  bundle.observedJourneys = buildObservedJourneys(bundle);
  return bundle;
}

/** The first response is a redirect; the retained final document includes query identity. */
export function redirectGpcFixture(bundle: ReturnType<typeof gpcRuntimeFixture>) {
  const finalUrl = "https://www.example.test/landing?region=us";
  const initial = bundle.networkEvents[0]!;
  bundle.networkEvents.splice(1, 0, { ...initial, eventId: `${initial.eventId}_final`,
    requestId: `${initial.requestId}_final`, requestUrl: finalUrl, url: finalUrl, timestampMs: 100 });
  bundle.gpcSignalObservation!.documentUrlSha256 = gpcDocumentHash(finalUrl);
  bundle.gpcSignalObservation!.frames[0]!.documentUrlSha256 = gpcDocumentHash(finalUrl);
  return bundle;
}
