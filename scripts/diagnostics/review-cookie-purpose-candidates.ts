import { readFileSync } from "node:fs";
import {
  COOKIE_PURPOSE_CANDIDATE_VERSION,
  resolveCanonicalCookieKnowledge,
  resolveCanonicalCookiePurposeCandidate,
} from "../../packages/certscore-vendor-resolver/src/cookie-knowledge-base";

// Metadata-only local review. No scanner invocation, database access, persistence,
// finding construction or score calculation is available in this command.
const file = process.argv[2];
if (!file || process.argv.length !== 3) throw new Error("Usage: review-cookie-purpose-candidates.ts <metadata.json>");
const bytes = readFileSync(file);
if (bytes.length > 256 * 1024) throw new Error("Cookie metadata exceeds the local review limit");
const input: unknown = JSON.parse(bytes.toString("utf8"));
if (!Array.isArray(input) || input.length > 512) throw new Error("Expected at most 512 cookie metadata records");
const observations = input.map((value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid cookie metadata record");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => key !== "name" && key !== "domain")) throw new Error("Only cookie name and domain metadata are accepted");
  if (typeof row.name !== "string" || row.name.length === 0 || row.name.length > 256) throw new Error("Invalid cookie name");
  if (row.domain !== undefined && (typeof row.domain !== "string" || !/^[a-z0-9.-]{1,253}$/i.test(row.domain))) throw new Error("Invalid cookie domain");
  const name = row.name;
  const domain = typeof row.domain === "string" ? row.domain : null;
  const context = { cookieDomain: domain };
  return {
    name,
    domain,
    current: resolveCanonicalCookieKnowledge(name, context),
    candidate: resolveCanonicalCookiePurposeCandidate(name, context),
  };
});
console.log(JSON.stringify({
  artifactVersion: COOKIE_PURPOSE_CANDIDATE_VERSION,
  mode: "local_review",
  productionProjectable: false,
  scoreEffect: "none",
  originalReportsModified: false,
  observations,
}, null, 2));
