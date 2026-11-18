import assert from "node:assert/strict";
import test from "node:test";
import { policySurfaceObservationSchema } from "@certscore/contracts";
import { fetchText, inspectFirstPartyTerms, policySurfaceScanner } from "./scanners/policy-surface-scanner.js";

const origin = "https://example.org";
const policyUrl = origin + "/published/privacy-policy";
const termsUrl = origin + "/terms";
const disclosure = "This Privacy Policy applies to example.org. We collect personal information to provide the service. " +
  "We retain account data for six months. You have the right to access or delete your personal information. ";
const body = disclosure.repeat(22).trim();

function termsEvidence(text: string) {
  const textArtifact = {
    artifactId: "policy_surface_text_terms", artifactType: "other" as const, path: "/test/terms.txt",
    sourceScanner: "policy_surface", scenario: "policy_surface_review", sensitivity: "redacted" as const,
  };
  const terms = policySurfaceObservationSchema.parse({
    observationId: "terms", surfaceType: "terms", url: termsUrl, finalUrl: termsUrl,
    status: "fetched", documentFetchState: "fetched", documentEvaluationState: "usable",
    httpStatus: 200, targetRelationship: "target_controller", traversalDepth: 0,
    directlyLinkedFromScannedPage: true, linkSourcePageUrl: origin,
    documentTextCoverage: { status: "complete", sourceTextChars: text.length, retainedTextChars: text.length },
    artifactRefs: [textArtifact], confidence: 0.9, directVsInferred: "direct",
  });
  return { terms, targetUrl: origin, text, textArtifact };
}

test("a substantive notice in terms uses the body heading and a source-bound excerpt", () => {
  const text = `1. Terms 2. Privacy Policy 3. Contact 1. Terms for site use. 2. Privacy Policy ${body} 3. Contact Contact us.`;
  const input = termsEvidence(text);
  const observation = inspectFirstPartyTerms(input)?.observation;
  assert.ok(observation);
  policySurfaceObservationSchema.parse(observation);
  assert.equal(observation.parentObservationId, input.terms.observationId);
  assert.equal(observation.finalUrl, termsUrl);
  assert.equal(observation.directlyLinkedFromScannedPage, false);
  assert.equal(observation.documentTextCoverage?.status, "unavailable");
  const section = observation.retainedPolicySections[0]!;
  assert.equal(section.charStart, text.lastIndexOf("2. Privacy Policy"));
  assert.equal(text.slice(section.charStart, section.charEnd), section.textExcerpt);
  assert(!section.textExcerpt.includes("3. Contact"));
  assert.equal(inspectFirstPartyTerms(termsEvidence("2. Privacy Policy Read the privacy policy elsewhere.")), undefined);
  assert.equal(inspectFirstPartyTerms({ ...input, terms: { ...input.terms, targetRelationship: "service_provider" } }), undefined);
});

test("a terms reference requires a unique exact first-party privacy URL", () => {
  const inspect = (text: string) => inspectFirstPartyTerms(termsEvidence(text));
  const named = `Our Privacy Policy, located at ${policyUrl} , is part of these terms.`;
  const candidate = inspect(named)?.candidate;
  assert.equal(candidate?.normalizedUrl, policyUrl);
  assert.equal(candidate?.parentSurfaceUrl, termsUrl);
  assert.equal(candidate?.traversalDepth, 1);
  assert.equal(candidate?.clickable, false);
  assert.equal(inspect(named + ` Privacy Policy: ${origin}/other/privacy-policy`), undefined);
  assert.equal(inspect("Our Privacy Policy, located at https://other.example.org/privacy-policy"), undefined);
  assert.equal(inspect(`Privacy Policy: ${policyUrl}?token=private`), undefined);
});

test("a declared policy uses the scanner's one-hop retrieval before the group completes", async t => {
  const requests: string[] = [];
  const respond = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "text/html" } });
  t.mock.method(globalThis, "fetch", async (request: string) => {
    const url = String(request);
    requests.push(url);
    switch (url) {
      case origin + "/": return respond('<footer><a href="/privacy-index">Privacy Policy</a><a href="/cookie-policy">Cookie Policy</a><a href="/terms">Terms of Service</a></footer>');
      case termsUrl: return respond(`<h1>Terms of Service</h1><p>Our Privacy Policy, located at ${policyUrl} , is part of these terms.</p>`);
      case policyUrl: return respond(`<title>Privacy Policy</title><main>${body}</main>`);
      default: return respond("Not Found", 404);
    }
  });
  const started = Date.now();
  const result = await policySurfaceScanner({
    url: origin + "/", normalizedUrl: origin + "/", scanStartedAtMs: started,
    internalBudgetMs: 12_000, absoluteDeadlineAtMs: started + 12_000, discoveryMode: "fast",
    artifactWriter: { baseDir: ".", artifactPath: name => name, writeTextArtifact: async name => name, writeJsonArtifact: async name => name },
  });
  assert.deepEqual(requests.filter(url => url === policyUrl), [policyUrl], JSON.stringify(result.policySurfaceObservations.find(o => o.surfaceType === "terms")));
  const policy = result.policySurfaceObservations.find(o => o.normalizedUrl === policyUrl);
  assert.equal(policy?.documentEvaluationState, "usable");
  assert.equal(policy?.parentSurfaceUrl, termsUrl);
});

test("the exact URL transport stops at the first redirect", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, {
    status: 307, headers: { location: origin + "/other/privacy-policy" },
  }));
  const result = await fetchText(policyUrl, 2_500, undefined, { exactUrlOnly: true });
  assert.equal(result.status, 307);
  assert.equal(result.ok, false);
  assert.equal(fetch.mock.callCount(), 1);
});
