import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  extractCandidates, policySurfaceObservationsFromRetainedRenderedLinks,
  assessPolicyDocumentRoleForChildSelection, isFetchablePolicyCandidateForPolicySurface,
} from "./scanners/policy-surface-scanner";

const base = "https://certscore.ai/";
const study = `${base}insights/privacy-policy-transparency-study-2026`;
const privacy = `${base}privacy`;

test("HTML and retained rendered discovery keep the governing privacy link, excluding the study and its PDF equivalent", () => {
  const links = [
    { href: privacy, linkText: "Privacy Policy" },
    { href: study, linkText: "Your data can outlast your account by years" },
    { href: `${study}.pdf`, linkText: "Privacy Policy" },
  ];
  const html = `<footer>${links.map(link => `<a href="${link.href}">${link.linkText}</a>`).join("")}</footer>`;
  const extracted = extractCandidates(base, html, links.map(link => link.linkText).join(" "));
  assert.deepEqual(extracted.map(row => row.normalizedUrl), [privacy]);
  const retained = policySurfaceObservationsFromRetainedRenderedLinks({ links: links.map(link => ({ ...link, pageUrl: base, domLocation: "footer" as const, linkVisibility: "visible" as const, accessibleNameSource: "text" as const })) });
  assert.deepEqual(retained.map(row => row.normalizedUrl), [privacy]);
});

test("an already selected research candidate cannot become a policy document or be fetched as one", () => {
  const candidate = extractCandidates(base, '<a href="/privacy">Privacy Policy</a>', "Privacy Policy")[0]!;
  const result = assessPolicyDocumentRoleForChildSelection({ ...candidate, url: study, normalizedUrl: study }, { fetchCandidates: [], observedChildCandidates: [] }, { substantiveDisclosureSignalCount: 8 });
  assert.equal(result.role, "unknown");
  assert.deepEqual(result.reasonCodes, ["research_or_reference_not_policy_document"]);
  assert.equal(isFetchablePolicyCandidateForPolicySurface({ baseUrl: base, href: study, normalizedUrl: study, surfaceType: "privacy_policy", matchStrength: "direct", linkText: "Privacy Policy" }), false);
});

test("the repository's actual research article is not rediscovered as its own governing privacy policy", () => {
  const html = readFileSync(new URL("../../../content/insights/privacy-policy-transparency-study-2026.html", import.meta.url), "utf8");
  assert.match(html, /name="description" content="Privacy-policy wording from 5,000 website reports/);
  // Includes a canonical self-link and policy quotations: neither makes this a
  // governing disclosure. Keep real footer policy links discoverable.
  const candidates = extractCandidates(study, html, "Privacy Policy Transparency Study. Research and methodology.");
  assert.ok(candidates.every(row => row.normalizedUrl.split("#")[0] !== study));
});
