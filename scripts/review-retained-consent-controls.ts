import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {reviewRetainedConsentControls, sha256} from "./lib/retained-consent-control-review";

const [dashboard, day, out] = process.argv.slice(2);
if (!dashboard || !day || !out) throw Error("Usage: review-retained-consent-controls.ts DASHBOARD_JSON LA_DATE NEW_OUTPUT_JSON");
const bytes = readFileSync(dashboard);
const review = reviewRetainedConsentControls(JSON.parse(bytes.toString("utf8")), day);
writeFileSync(out, JSON.stringify({...review, sourceDashboard: {file: resolve(dashboard), sha256: sha256(bytes)}}, null, 2) + "\n", {flag: "wx"});
console.log(JSON.stringify({reviewed: review.reviewed, comparisons: review.comparisons, mismatches: review.mismatches, counts: review.counts, diagnosticAvailable: review.diagnosticAvailable}));
