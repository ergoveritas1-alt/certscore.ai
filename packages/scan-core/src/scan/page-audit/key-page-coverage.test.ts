import test from "node:test";
import assert from "node:assert/strict";
import { summarizeKeyPageCoverage } from "./key-page-coverage";

test("distinguishes detected key-page surfaces from successful fetches", () => {
  const coverage = summarizeKeyPageCoverage({
    discoveredPageTypes: new Set(["privacy_policy", "terms_of_service", "accessibility_statement"]),
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
  assert.deepEqual(privacy?.failedPageUrls, ["https://example.com/privacy"]);

  assert.equal(terms?.surfaceDetected, true);
  assert.equal(terms?.fetched, false);

  assert.equal(contact?.surfaceDetected, true);
  assert.equal(contact?.fetched, true);
});

test("does not treat guessed-slug fetch failures as discovered surfaces", () => {
  const coverage = summarizeKeyPageCoverage({
    discoveredPageTypes: new Set(),
    failedAttemptedUrlsByPageType: {
      privacy_policy: ["https://example.com/privacy"]
    },
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
  assert.deepEqual(privacy?.failedPageUrls, ["https://example.com/privacy"]);
});

test("surfaces fetch failures from attempted urls even when no page artifact was retained", () => {
  const coverage = summarizeKeyPageCoverage({
    discoveredPageTypes: new Set(["privacy_policy"]),
    failedAttemptedUrlsByPageType: {
      privacy_policy: ["https://example.com/privacy"]
    },
    fetchedPages: []
  });

  const privacy = coverage.find((row) => row.pageType === "privacy_policy");

  assert.equal(privacy?.surfaceDetected, true);
  assert.equal(privacy?.fetched, false);
  assert.deepEqual(privacy?.failedPageUrls, ["https://example.com/privacy"]);
});
