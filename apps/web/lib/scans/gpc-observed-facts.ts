import type { GpcBoundedObservation } from "@certscore/contracts";

/** Describes an already-projected observation; never changes its outcome or score. */
export function describeGpcObservedFacts(observation?: GpcBoundedObservation) {
  if (!observation || observation.status === "unavailable" || !observation.sourceSha256 ||
    !observation.sessionSha256 || !observation.documentUrlSha256) return [];

  const facts: Array<{ label: string; value: string }> = [];
  const requests = observation.requests;
  if (requests.classifiedCount > 0) {
    facts.push({ label: "Activity with GPC", value: `${requests.classifiedCount} tracking request${requests.classifiedCount === 1 ? "" : "s"} observed with GPC` });
  } else if (observation.status === "complete" && requests.complete) {
    facts.push({ label: "Activity with GPC", value: "No classified tracking requests observed in this capture" });
  }
  if (observation.delivery.httpHeaderRetained && observation.delivery.mainNavigatorReadbackRetained) {
    facts.push({ label: "GPC signal", value: "Observed on the page request and in the browser" });
  }
  for (const [key, label] of [["sale", "Site-recorded sale opt-out"], ["sharing", "Site-recorded sharing opt-out"]] as const) {
    const state = observation.registration[key];
    if (state !== "unknown") facts.push({ label, value: state === "opted_out" ? "Opted out" : "Not opted out" });
  }
  if (observation.registration.cmpGpcSignal !== "unknown") {
    facts.push({ label: "Site-recorded GPC receipt", value: observation.registration.cmpGpcSignal === "received" ? "Received" : "Not received" });
  }
  if (observation.acknowledgment.observed) {
    facts.push({ label: "Visible GPC acknowledgment", value: "Observed" });
  }
  return facts;
}
