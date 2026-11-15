import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseArgs} from "node:util";
import {reviewRetainedConsentControls, sha256} from "./lib/retained-consent-control-review";

const {positionals: [dashboard, day, out, ...extra], values} = parseArgs({
  allowPositionals: true,
  options: {"first-layer-opt-out": {type: "boolean"}, since: {type: "string"}},
});
if (!dashboard || !day || !out || extra.length) {
  throw Error("Usage: review-retained-consent-controls.ts DASHBOARD_JSON LA_DATE NEW_OUTPUT_JSON [--first-layer-opt-out] [--since UTC]");
}
const bytes = readFileSync(dashboard);
const review = reviewRetainedConsentControls(JSON.parse(bytes.toString("utf8")), day, {
  firstLayerOptOut: values["first-layer-opt-out"], sinceUtc: values.since,
});
writeFileSync(out, JSON.stringify({...review, sourceDashboard: {file: resolve(dashboard), sha256: sha256(bytes)}}, null, 2) + "\n", {flag: "wx"});
console.log(JSON.stringify({reviewed: review.reviewed, comparisons: review.comparisons, mismatches: review.mismatches,
  counts: review.counts, diagnosticAvailable: review.diagnosticAvailable, firstLayerOptOut: review.firstLayerOptOut}));
