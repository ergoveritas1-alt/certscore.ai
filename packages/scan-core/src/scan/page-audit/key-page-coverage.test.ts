import test from "node:test";
import assert from "node:assert/strict";
import { summarizeKeyPageCoverage } from "./key-page-coverage";

test("distinguishes detected key-page surfaces from successful fetches", () => {
  const coverage = summarizeKeyPageCoverage({
    pageSummaries: [
      {
        pageType: "privacy_policy",
        surfaceDetected: true,
        surfaceState: "linked_but_fetch_blocked",
        guessedOnly: false,
        bestCandidateUrl: "https://example.com/privacy",
        bestCandidateAnchorText: "Privacy policy",
        bestCandidateSourceUrl: "https://example.com/",
        bestCandidateHostRelation: "same_host",
        bestFetchOutcome: "not_found",
        successfulUrl: null,
        successfulPageTitle: null,
        successfulHostRelation: null,
        extractionOutcome: "not_attempted",
        attemptedUrls: ["https://example.com/privacy"],
        attemptCount: 1,
        bestDiscoverySource: "footer_link",
        stopReason: "all_attempts_failed"
      },
      {
        pageType: "terms_of_service",
        surfaceDetected: true,
        surfaceState: "linked_unverified",
        guessedOnly: false,
        bestCandidateUrl: "https://example.com/terms",
        bestCandidateAnchorText: "Terms",
        bestCandidateSourceUrl: "https://example.com/",
        bestCandidateHostRelation: "same_host",
        bestFetchOutcome: null,
        successfulUrl: null,
        successfulPageTitle: null,
        successfulHostRelation: null,
        extractionOutcome: "not_attempted",
        attemptedUrls: [],
        attemptCount: 0,
        bestDiscoverySource: "footer_link",
        stopReason: "budget_exhausted"
      },
      {
        pageType: "contact",
        surfaceDetected: true,
        surfaceState: "linked_and_verified",
        guessedOnly: false,
        bestCandidateUrl: "https://example.com/contact",
        bestCandidateAnchorText: "Contact",
        bestCandidateSourceUrl: "https://example.com/",
        bestCandidateHostRelation: "same_host",
        bestFetchOutcome: "ok",
        successfulUrl: "https://example.com/contact",
        successfulPageTitle: "Contact",
        successfulHostRelation: "same_host",
        extractionOutcome: "sufficient",
        attemptedUrls: ["https://example.com/contact"],
        attemptCount: 1,
        bestDiscoverySource: "footer_link",
        stopReason: "covered"
      }
    ],
    fetchedPages: [
      {
        fetchStatus: "not_found",
        finalUrl: "https://example.com/privacy",
        headers: {},
        html: "",
        language: "en",
        links: [],
        pageType: "privacy_policy",
        pageUrl: "https://example.com/privacy",
        redirected: false,
        scripts: [],
        statusCode: 404,
        textContent: "",
        title: null,
        forms: []
      },
      {
        fetchStatus: "ok",
        finalUrl: "https://example.com/contact",
        headers: {},
        html: "<html></html>",
        language: "en",
        links: [],
        pageType: "contact",
        pageUrl: "https://example.com/contact",
        redirected: false,
        scripts: [],
        statusCode: 200,
        textContent: "Contact us",
        title: "Contact",
        forms: []
      }
    ]
  });

  const privacy = coverage.find((row) => row.pageType === "privacy_policy");
  const terms = coverage.find((row) => row.pageType === "terms_of_service");
  const contact = coverage.find((row) => row.pageType === "contact");

  assert.equal(privacy?.surfaceDetected, true);
  assert.equal(privacy?.fetched, false);
  assert.equal(privacy?.surfaceState, "linked_but_fetch_blocked");
  assert.deepEqual(privacy?.failedPageUrls, ["https://example.com/privacy"]);

  assert.equal(terms?.surfaceDetected, true);
  assert.equal(terms?.fetched, false);
  assert.equal(terms?.surfaceState, "linked_unverified");

  assert.equal(contact?.surfaceDetected, true);
  assert.equal(contact?.fetched, true);
});

test("does not treat guessed-slug fetch failures as discovered surfaces", () => {
  const coverage = summarizeKeyPageCoverage({
    pageSummaries: [
      {
        pageType: "privacy_policy",
        surfaceDetected: false,
        surfaceState: "guessed_only",
        guessedOnly: true,
        bestCandidateUrl: "https://example.com/privacy",
        bestCandidateAnchorText: null,
        bestCandidateSourceUrl: "https://example.com/",
        bestCandidateHostRelation: "same_host",
        bestFetchOutcome: "not_found",
        successfulUrl: null,
        successfulPageTitle: null,
        successfulHostRelation: null,
        extractionOutcome: "not_attempted",
        attemptedUrls: ["https://example.com/privacy"],
        attemptCount: 1,
        bestDiscoverySource: "guessed_slug",
        stopReason: "guessed_only"
      }
    ],
    fetchedPages: [
      {
        fetchStatus: "not_found",
        finalUrl: "https://example.com/privacy",
        headers: {},
        html: "",
        language: "en",
        links: [],
        pageType: "privacy_policy",
        pageUrl: "https://example.com/privacy",
        redirected: false,
        scripts: [],
        statusCode: 404,
        textContent: "",
        title: null,
        forms: []
      }
    ]
  });

  const privacy = coverage.find((row) => row.pageType === "privacy_policy");

  assert.equal(privacy?.surfaceDetected, false);
  assert.equal(privacy?.fetched, false);
  assert.equal(privacy?.surfaceState, "guessed_only");
  assert.deepEqual(privacy?.failedPageUrls, []);
});

test("reports extraction-limited pages as detected without surfacing them as missing", () => {
  const coverage = summarizeKeyPageCoverage({
    pageSummaries: [
      {
        pageType: "privacy_policy",
        surfaceDetected: true,
        surfaceState: "linked_but_extraction_limited",
        guessedOnly: false,
        bestCandidateUrl: "https://example.com/privacy",
        bestCandidateAnchorText: "Privacy policy",
        bestCandidateSourceUrl: "https://example.com/",
        bestCandidateHostRelation: "related_party",
        bestFetchOutcome: "ok",
        successfulUrl: "https://example.com/privacy",
        successfulPageTitle: "Privacy Policy",
        successfulHostRelation: "related_party",
        extractionOutcome: "limited",
        attemptedUrls: ["https://example.com/privacy"],
        attemptCount: 1,
        bestDiscoverySource: "footer_link",
        stopReason: "covered"
      }
    ],
    fetchedPages: []
  });

  const privacy = coverage.find((row) => row.pageType === "privacy_policy");

  assert.equal(privacy?.surfaceDetected, true);
  assert.equal(privacy?.fetched, true);
  assert.equal(privacy?.extractionLimited, true);
  assert.deepEqual(privacy?.failedPageUrls, []);
});
