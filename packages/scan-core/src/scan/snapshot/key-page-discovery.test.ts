import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKeyPageDiscoveryState,
  buildKeyPageDiscoverySummary,
  toKeyPageFetchTargets
} from "./key-page-discovery";

test("buildKeyPageDiscoveryState combines localized rendered links with sitemap candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://www.leparisien.fr/sitemap.xml") {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://www.leparisien.fr/politique-de-confidentialite</loc></url>
          <url><loc>https://www.leparisien.fr/cookies</loc></url>
        </urlset>`,
        { status: 200, headers: { "content-type": "application/xml" } }
      );
    }

    throw new Error(`Unexpected fetch for ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const state = await buildKeyPageDiscoveryState({
      homepageLanguage: "fr",
      homepageUrl: "https://www.leparisien.fr/",
      renderedLinks: [
        {
          href: "https://www.leparisien.fr/mentions-legales",
          text: "Mentions légales"
        }
      ],
      renderedSource: "rendered_link",
      robotsTxtBody: "Sitemap: https://www.leparisien.fr/sitemap.xml"
    });

    const termsCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "terms_of_service" && candidate.candidateUrl === "https://www.leparisien.fr/mentions-legales"
    );
    const privacyCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "privacy_policy" &&
        candidate.candidateUrl === "https://www.leparisien.fr/politique-de-confidentialite"
    );

    assert(state.localeHints.includes("fr"));
    assert.equal(termsCandidate?.discoveredFrom, "rendered_link");
    assert.equal(privacyCandidate?.discoveredFrom, "sitemap");
    assert.deepEqual(state.sitemapFilesFetched, ["https://www.leparisien.fr/sitemap.xml"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildKeyPageDiscoveryState discovers same-brand legal pages on sibling subdomains", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://wiki.liveinternet.ru/") {
      return new Response(
        `
        <html lang="ru">
          <body>
            <a href="/ServisDnevnikovLiveInternet/PrivacyPolicy">Privacy Policy</a>
            <a href="/ServisDnevnikovLiveInternet/Pravila">Terms of service</a>
          </body>
        </html>
        `,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }

    throw new Error(`Unexpected fetch for ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const state = await buildKeyPageDiscoveryState({
      homepageLanguage: null,
      homepageUrl: "https://www.liveinternet.ru/",
      renderedLinks: [],
      renderedSource: "rendered_link",
      sitemapUrls: [],
      sourceUrl: "https://www.liveinternet.ru/"
    });

    const privacyCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "privacy_policy" &&
        candidate.candidateUrl === "https://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/PrivacyPolicy"
    );
    const termsCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "terms_of_service" &&
        candidate.candidateUrl === "https://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/Pravila"
    );

    assert.equal(privacyCandidate?.discoveredFrom, "same_brand_subdomain");
    assert.equal(privacyCandidate?.hostRelation, "same_brand_subdomain");
    assert.equal(termsCandidate?.discoveredFrom, "same_brand_subdomain");
    assert.deepEqual(state.sameBrandSubdomainHostsInspected, ["https://wiki.liveinternet.ru/"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildKeyPageDiscoveryState classifies Russian same-brand legal pages on sibling subdomains", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://wiki.liveinternet.ru/") {
      return new Response(
        `
        <html lang="ru">
          <body>
            <a href="/ServisDnevnikovLiveInternet">Сервис дневников</a>
          </body>
        </html>
        `,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }

    if (url === "https://wiki.liveinternet.ru/ServisDnevnikovLiveInternet") {
      return new Response(
        `
        <html lang="ru">
          <body>
            <a href="/ServisDnevnikovLiveInternet/PrivacyPolicy">Политика конфиденциальности</a>
            <a href="/ServisDnevnikovLiveInternet/Pravila">Правила</a>
            <a href="/KontaktyLiveInternet">Контакты</a>
          </body>
        </html>
        `,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }

    throw new Error(`Unexpected fetch for ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const state = await buildKeyPageDiscoveryState({
      homepageLanguage: null,
      homepageUrl: "https://www.liveinternet.ru/",
      renderedLinks: [],
      renderedSource: "rendered_link",
      sitemapUrls: [],
      sourceUrl: "https://www.liveinternet.ru/"
    });

    const privacyCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "privacy_policy" &&
        candidate.candidateUrl === "https://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/PrivacyPolicy"
    );
    const termsCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "terms_of_service" &&
        candidate.candidateUrl === "https://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/Pravila"
    );
    const contactCandidate = state.candidates.find(
      (candidate) =>
        candidate.pageType === "contact" && candidate.candidateUrl === "https://wiki.liveinternet.ru/KontaktyLiveInternet"
    );

    assert(state.localeHints.includes("ru"));
    assert.equal(privacyCandidate?.discoveredFrom, "same_brand_subdomain");
    assert.equal(termsCandidate?.discoveredFrom, "same_brand_subdomain");
    assert.equal(contactCandidate?.discoveredFrom, "same_brand_subdomain");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildKeyPageDiscoveryState rejects unrelated external hosts", async () => {
  const state = await buildKeyPageDiscoveryState({
    homepageLanguage: "en",
    homepageUrl: "https://example.com/",
    renderedLinks: [
      {
        href: "https://policies.examplecdn.net/privacy",
        text: "Privacy policy"
      }
    ],
    renderedSource: "rendered_link",
    sitemapUrls: [],
    sourceUrl: "https://example.com/"
  });

  assert.equal(
    state.candidates.some((candidate) => candidate.candidateUrl === "https://policies.examplecdn.net/privacy"),
    false
  );
});

test("toKeyPageFetchTargets prioritizes missing types and respects attempt caps", () => {
  const selected = toKeyPageFetchTargets({
    attemptedUrls: new Set(["https://example.com/privacy"]),
    candidates: [
      {
        anchorText: "Privacy",
        candidateScore: 90,
        candidateUrl: "https://example.com/privacy",
        discoveredFrom: "rendered_link",
        hostRelation: "same_host",
        localeHints: ["en"],
        pageType: "privacy_policy",
        pageTypeConfidence: 0.95,
        sourceUrl: "https://example.com/"
      },
      {
        anchorText: "Terms",
        candidateScore: 88,
        candidateUrl: "https://example.com/terms",
        discoveredFrom: "rendered_link",
        hostRelation: "same_host",
        localeHints: ["en"],
        pageType: "terms_of_service",
        pageTypeConfidence: 0.95,
        sourceUrl: "https://example.com/"
      },
      {
        anchorText: "Cookies",
        candidateScore: 85,
        candidateUrl: "https://example.com/cookies",
        discoveredFrom: "rendered_link",
        hostRelation: "same_host",
        localeHints: ["en"],
        pageType: "cookie_policy",
        pageTypeConfidence: 0.92,
        sourceUrl: "https://example.com/"
      },
      {
        anchorText: "Privacy alt",
        candidateScore: 60,
        candidateUrl: "https://example.com/privacy-policy",
        discoveredFrom: "guessed_slug",
        hostRelation: "same_host",
        localeHints: ["en"],
        pageType: "privacy_policy",
        pageTypeConfidence: 0.4,
        sourceUrl: "https://example.com/"
      }
    ],
    fetchedPages: [],
    maxAttemptsPerType: 1,
    maxTotalAttempts: 2
  });

  assert.deepEqual(
    selected.map((candidate) => candidate.candidateUrl),
    ["https://example.com/terms", "https://example.com/cookies"]
  );
});

test("buildKeyPageDiscoverySummary marks guessed-only pages separately from discovered surfaces", () => {
  const summary = buildKeyPageDiscoverySummary({
    attemptedUrls: new Set(["https://example.com/privacy"]),
    candidates: [
      {
        anchorText: null,
        candidateScore: 20,
        candidateUrl: "https://example.com/privacy",
        discoveredFrom: "guessed_slug",
        hostRelation: "same_host",
        localeHints: ["en"],
        pageType: "privacy_policy",
        pageTypeConfidence: 0.3,
        sourceUrl: "https://example.com/"
      },
      {
        anchorText: "Contact",
        candidateScore: 80,
        candidateUrl: "https://example.com/contact",
        discoveredFrom: "rendered_link",
        hostRelation: "same_host",
        localeHints: ["en"],
        pageType: "contact",
        pageTypeConfidence: 0.9,
        sourceUrl: "https://example.com/"
      }
    ],
    fetchAttempts: new Map([
      [
        "https://example.com/privacy",
        {
          candidateUrl: "https://example.com/privacy",
          fetchOutcome: "not_found"
        }
      ]
    ]),
    fetchedPages: [
      {
        fetchStatus: "ok",
        pageType: "contact",
        pageUrl: "https://example.com/contact"
      }
    ],
    homepageUrl: "https://example.com/",
    localeHints: ["en"],
    sameBrandSubdomainHostsInspected: [],
    sitemapFilesFetched: [],
    sitemapIndexUrlsFetched: [],
    sitemapUrls: []
  });

  const privacySummary = summary.pageSummaries.find((page) => page.pageType === "privacy_policy");
  const contactSummary = summary.pageSummaries.find((page) => page.pageType === "contact");

  assert.equal(privacySummary?.surfaceDetected, false);
  assert.equal(privacySummary?.guessedOnly, true);
  assert.equal(privacySummary?.stopReason, "guessed_only");
  assert.equal(contactSummary?.successfulUrl, "https://example.com/contact");
  assert.equal(contactSummary?.successfulHostRelation, "same_host");
  assert.equal(contactSummary?.stopReason, "covered");
});
