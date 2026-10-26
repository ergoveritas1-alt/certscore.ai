import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyPrivacySurface } from "@certscore/contracts";
import {
  capPolicyCandidatesWithSurfaceDiversity,
  classifyPolicyDocumentOwnership,
  dedupeCandidates,
  deterministicFetchFallback,
  extractCandidates,
  mergeSupplementalPolicyCandidates,
  prioritizePolicyCandidateEvaluation,
  type PolicySurfaceCandidate,
} from "./scanners/policy-surface-scanner.js";

type RetainedSummary = Pick<PolicySurfaceCandidate,
  "clickable" | "discoveryMethod" | "domLocation" | "fetchable" | "linkText" |
  "mayLeadToConsentControls" | "normalizedUrl" | "observationOnly" | "seedSource"
> & {
  surfaceType: PolicySurfaceCandidate["deterministicSurfaceType"];
  classifierProvenance: PolicySurfaceCandidate["deterministicClassifierProvenance"];
  classifierReasonCodes: string[];
  matchedConcept?: string;
  matchedLocale?: PolicySurfaceCandidate["deterministicMatchedLocale"];
  matchStrength?: PolicySurfaceCandidate["deterministicMatchStrength"];
};
const retained = JSON.parse(readFileSync(new URL(
  "./test-fixtures/policy-candidate-selection-retained.json", import.meta.url,
), "utf8")) as { cases: Array<{
  site: string; scanId: string; sourcePath: string; sourceSha256: string;
  observedUrl: string; candidateSummary: RetainedSummary[];
}> };

// Exact summary fields are kept in the fixture with their source hash. IDs,
// original hrefs, scores and sameOrigin were not retained: reconstruct them for
// selection only, with current classifier confidence, never as historical proof.
function reconstruct(site: string, summary: RetainedSummary, index: number): PolicySurfaceCandidate {
  return {
    ...summary,
    cmpDiscovery: undefined,
    candidateId: `reconstructed_${index}`,
    url: summary.normalizedUrl,
    sameOrigin: new URL(summary.normalizedUrl).origin === new URL(`https://${site}/`).origin,
    rankedFromCommonPath: summary.discoveryMethod === "guessed_common_path",
    deterministicSurfaceType: summary.surfaceType,
    deterministicScore: classifyPrivacySurface({ linkText: summary.linkText, url: summary.normalizedUrl }).confidence,
    deterministicKeywordMatches: summary.classifierReasonCodes,
    deterministicClassifierReasonCodes: summary.classifierReasonCodes,
    deterministicClassifierProvenance: summary.classifierProvenance,
    deterministicMatchedConcept: summary.matchedConcept,
    deterministicMatchedLocale: summary.matchedLocale,
    deterministicMatchStrength: summary.matchStrength,
  };
}

function select(candidates: PolicySurfaceCandidate[], limit = 6) {
  const all = dedupeCandidates(candidates);
  return prioritizePolicyCandidateEvaluation(mergeSupplementalPolicyCandidates(
    deterministicFetchFallback(all), all, limit,
  ));
}

for (const fixture of retained.cases) {
  test(`reconstructed retained selection keeps ${fixture.site}'s observed destination within six slots`, () => {
    assert.equal(fixture.candidateSummary.length, 9);
    const candidates = fixture.candidateSummary.map((row, i) => reconstruct(fixture.site, row, i));
    const observed = candidates.find(row => row.normalizedUrl === fixture.observedUrl)!;
    assert.ok(observed.fetchable && observed.clickable && !observed.observationOnly);
    assert.ok(observed.deterministicScore >= 0.5, "reconstructed confidence meets the existing gate");
    const selected = select(candidates);
    assert.equal(selected.length, 6);
    assert.equal(selected[0]?.normalizedUrl, fixture.observedUrl);
    assert.ok(selected.some(row => row.deterministicSurfaceType === "cookie_policy"));
    assert.ok(selected.some(row => row.deterministicSurfaceType === "your_privacy_choices"));
    assert.deepEqual(selected.find(row => row.normalizedUrl === fixture.observedUrl), observed);
    assert.deepEqual(select([...candidates].reverse()), selected, "deterministic rank does not depend on summary order");

    // Also exercise the merge/cap independently of the repaired initial rank:
    // the observed candidate may have been absent from an earlier shortlist.
    const guesses = candidates.filter(row => row !== observed);
    const merged = mergeSupplementalPolicyCandidates(deterministicFetchFallback(guesses), candidates, 6);
    assert.ok(merged.some(row => row.normalizedUrl === fixture.observedUrl));
    assert.equal(merged.length, 6);
  });
}

const base = "https://publisher.example/";
function observed(path: string, label = "Privacy Policy"): PolicySurfaceCandidate {
  const candidate = extractCandidates(base, `<footer><a href="${path}">${label}</a></footer>`, label)[0];
  assert.ok(candidate);
  return candidate;
}
function guess(path: string, label = "Privacy Policy"): PolicySurfaceCandidate {
  return { ...observed(path, label), candidateId: `guess_${path}`, clickable: false,
    discoveryMethod: "guessed_common_path", rankedFromCommonPath: true,
    seedSource: "canonical_legal_surface_hint" };
}
const guesses = () => [
  ...Array.from({ length: 10 }, (_, i) => guess(`/guessed-${i}/privacy`)),
  guess("/cookie-policy", "Cookie Policy"),
  guess("/privacy/choices", "Your Privacy Choices"),
];

test("initial truncation protects observed links from more than eight higher-confidence exact-label guesses", () => {
  const link = { ...observed("/legal/privacy", "Legal Center"), deterministicScore: 0.5 };
  const ranked = deterministicFetchFallback([...guesses(), link]);
  assert.equal(ranked.length, 8);
  assert.equal(ranked[0]?.normalizedUrl, link.normalizedUrl);
  assert.equal(select([...guesses(), link])[0]?.normalizedUrl, link.normalizedUrl);
});

test("multiple observed policies share the cap with cookie and choice surfaces, including a later warmed merge", () => {
  const policies = [observed("/legal/privacy", "Legal Center"), observed("/us/privacy"), observed("/eu/privacy")];
  const cookie = observed("/cookie-policy", "Cookie Policy");
  const choice = observed("/choices", "Your Privacy Choices");
  const selected = select([...guesses(), ...policies, cookie, choice]);
  for (const candidate of [...policies, cookie, choice]) {
    assert.ok(selected.some(row => row.normalizedUrl === candidate.normalizedUrl));
  }
  assert.equal(selected.length, 6);
  const warmed = observed("/warmed/privacy");
  const recapped = capPolicyCandidatesWithSurfaceDiversity(dedupeCandidates([warmed, ...selected]), 6);
  for (const candidate of [warmed, ...policies, cookie, choice]) {
    assert.ok(recapped.some(row => row.normalizedUrl === candidate.normalizedUrl));
  }
  assert.equal(recapped.length, 6);
  assert.deepEqual(capPolicyCandidatesWithSurfaceDiversity(recapped, 6), recapped);
});

for (const seeded of [true, false]) {
  test(`same-URL ${seeded ? "seed" : "plain guess"} cannot replace observed provenance at ranking, merge or deduplication`, () => {
    const link = { ...observed("/legal/privacy", "Legal Center"),
      linkVisibility: "visible" as const, accessibleNameSource: "text" as const,
      linkSourcePageUrl: base, renderedSourcePageUrl: base, selector: "footer a" };
    const seed = { ...guess("/legal/privacy"), deterministicScore: 1,
      seedSource: seeded ? "canonical_legal_surface_hint" as const : undefined };
    for (const input of [[seed, link], [link, seed]]) {
      const [deduped] = dedupeCandidates(input);
      assert.equal(dedupeCandidates(input).length, 1);
      assert.equal(deduped?.candidateId, link.candidateId);
      assert.equal(deduped?.linkText, link.linkText);
      assert.equal(deduped?.selector, link.selector);
      assert.equal(deduped?.linkSourcePageUrl, base);
      assert.equal(deduped?.discoveryMethod, "footer_link");
      assert.equal(deduped?.clickable, true);
      assert.ok(!deduped?.rankedFromCommonPath);
      assert.equal(deduped?.deterministicScore, link.deterministicScore);
      assert.equal(select([...guesses(), ...input]).filter(row => row.normalizedUrl === link.normalizedUrl).length, 1);
      assert.equal(mergeSupplementalPolicyCandidates([], input, 6)[0]?.candidateId, link.candidateId,
        "supplement-only merging also preserves the observed candidate");
    }
    const merged = mergeSupplementalPolicyCandidates([seed, ...guesses()], [link], 6);
    assert.equal(merged[0]?.candidateId, link.candidateId);
    assert.equal(merged[0]?.clickable, true);
  });
}

test("guessed-only fallback retains its ordering and caps", () => {
  const fixture = retained.cases[0]!;
  const candidates = fixture.candidateSummary.filter(row => !row.clickable)
    .map((row, i) => reconstruct(fixture.site, row, i));
  const ranked = deterministicFetchFallback(candidates);
  assert.equal(ranked.length, 8);
  assert.deepEqual(ranked.map(row => new URL(row.normalizedUrl).pathname), [
    "/privacy-notice", "/privacy-policy", "/legal/privacy", "/privacy",
    "/cookie-policy", "/cookies", "/privacy/choices", "/privacy-rights",
  ]);
  for (const limit of [0, 1, 6, 8]) {
    assert.deepEqual(mergeSupplementalPolicyCandidates(ranked, candidates, limit), ranked.slice(0, limit));
  }
});

test("evaluation deduplicates slash variants in favor of the observed link", () => {
  const link = observed("/legal/privacy/", "Legal Center");
  const seed = guess("/legal/privacy");
  const selected = select([seed, link]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.candidateId, link.candidateId);
  assert.equal(selected[0]?.discoveryMethod, link.discoveryMethod);
});

test("caps stay deterministic when observed policies alone exceed capacity", () => {
  const candidates = Array.from({ length: 12 }, (_, i) => observed(`/region-${i}/privacy`));
  for (const limit of [0, 1, 6, 8]) {
    const selected = select([...candidates, ...guesses()], limit);
    assert.equal(selected.length, limit);
    assert.ok(selected.every(row => row.clickable));
    assert.deepEqual(select([...guesses(), ...candidates].reverse(), limit), selected);
    assert.equal(new Set(selected.map(row => row.normalizedUrl)).size, selected.length);
  }
});

test("observed provenance does not override fetchability, confidence or observation-only status", () => {
  const link = observed("/legal/privacy", "Legal Center");
  const blocked = { ...link, fetchable: false };
  const lowConfidence = { ...link, normalizedUrl: base + "low/privacy", deterministicScore: 0.49 };
  const control = { ...link, normalizedUrl: base + "control/privacy", fetchable: false, observationOnly: true, selector: "#control" };
  const commerce = { ...link, normalizedUrl: base + "product/privacy-screen" };
  assert.deepEqual(deterministicFetchFallback([blocked, lowConfidence, commerce]), []);
  assert.deepEqual(deterministicFetchFallback([control]), [control]);
  for (const candidate of [blocked, lowConfidence, control, commerce]) {
    const capped = capPolicyCandidatesWithSurfaceDiversity([...guesses(), candidate], 6);
    assert.ok(!capped.includes(candidate), "ineligible/observation-only privacy does not gain reserved priority");
  }
  assert.equal(blocked.fetchable, false);
  assert.equal(control.observationOnly, true);
});

test("unsafe and unrelated research references remain outside extracted policy candidates", () => {
  const candidates = extractCandidates(base, `<footer>
    <a href="javascript:alert(1)">Privacy Policy</a>
    <a href="/insights/privacy-policy-transparency-study-2026">Privacy Policy</a>
    <a href="https://unrelated.example/privacy">https://unrelated.example/privacy</a>
  </footer>`, "Privacy Policy");
  assert.deepEqual(select(candidates), []);
});

// Retained review counterexamples establish vendor attribution text, not original
// anchor markup or fetched policy bodies. URLs/markup/body below are synthetic
// negative fixtures; never splice the retained cue into target-ownership proof.
for (const fixture of [
  { site: "cricbet99.black", vendor: "Google", url: "https://policies.google.com/privacy",
    cue: "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply." },
  { site: "gate.cc", vendor: "Cloudflare", url: "https://www.cloudflare.com/privacypolicy/",
    cue: "Performance and Security by Cloudflare\nPrivacy" },
  { site: "sport5.co.il", vendor: "Taboola", url: "https://www.taboola.com/policies/privacy-policy",
    cue: "by TaboolaU.S. Privacy" },
]) {
  test(`retained ${fixture.vendor} reference does not become ${fixture.site}'s governing policy`, () => {
    const candidates = extractCandidates(`https://${fixture.site}/`,
      `<footer>${fixture.cue}<a href="${fixture.url}">Privacy Policy</a></footer>`, fixture.cue);
    const selected = select(candidates);
    assert.ok(selected.length > 0, "even a selected vendor link still requires ownership verification");
    const ownership = classifyPolicyDocumentOwnership({
      targetUrl: `https://${fixture.site}/`, documentUrl: selected[0]!.normalizedUrl,
      directlyLinkedFromScannedPage: true, documentTitle: `${fixture.vendor} Privacy Policy`,
      text: `${fixture.vendor} is the controller responsible for processing personal data for its own services.`,
    });
    assert.ok(!["target_controller", "first_party_brand"].includes(ownership.targetRelationship!));
    assert.equal((selected[0] as unknown as Record<string, unknown>).targetRelationship, undefined);
  });
}
