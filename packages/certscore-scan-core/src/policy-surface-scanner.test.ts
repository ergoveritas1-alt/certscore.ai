import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import type { Browser } from "playwright";
import {
  classifyPrivacySurface,
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
} from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  assessPolicyDocumentSubstance,
  canonicalWwwPolicyUrlVariant,
  classifyPolicyDocumentOwnership,
  countRecoveredPolicySurfaceObservations,
  extractPolicyCookieDisclosures,
  extractPolicySections,
  gdprTransparencyTopicCandidatesFromRetainedPolicySections,
  isFetchablePolicyCandidateForPolicySurface,
  isFetchablePolicyHrefForPolicySurface,
  isFetchablePolicyUrlForPolicySurface,
  isGdprNoticeSupplementLink,
  mergePolicySurfaceObservations,
  POLICY_HOMEPAGE_FETCH_TIMEOUT_MS,
  policySurfaceObservationsFromRetainedRenderedLinks,
  retainedArticle13SectionEvidenceFromSections,
  recoverPolicyDocumentsFromRetainedRenderedLinks,
  resolvePolicyVisibleText,
  settlePolicyCandidateProcessingBeforeDeadline,
  shouldUseDirectPolicyDocumentText,
  stripConsentSurfacePreambleFromPolicyText,
  type PolicyNanoAssistProvider,
  policySurfaceScanner,
  wwwFallbackUrlForPolicyFetch,
} from "./scanners/policy-surface-scanner.js";
import { startStaticFixtureServer, type StaticFixturePage } from "./test-fixtures/static-server.js";

test("builds a bounded canonical www retry for policy notices", () => {
  assert.equal(canonicalWwwPolicyUrlVariant("https://publisher.example/legal/privacy-policy"), "https://www.publisher.example/legal/privacy-policy");
  assert.equal(canonicalWwwPolicyUrlVariant("https://edition.cnn.com/privacy"), "https://www.cnn.com/privacy");
  assert.equal(canonicalWwwPolicyUrlVariant("https://www.publisher.example/legal/privacy-policy"), null);
  assert.equal(canonicalWwwPolicyUrlVariant("http://publisher.example/legal/privacy-policy"), null);
});

test("removes consent-banner preambles before policy topic extraction", () => {
  const text = stripConsentSurfacePreambleFromPolicyText(
    "We value your privacy. We and our partners store and access information on a device using cookies. MORE OPTIONS AGREE Privacy Policy This Privacy Policy explains how we collect, use, retain, and share personal data."
  );
  assert.equal(text.startsWith("Privacy Policy This Privacy Policy explains"), true);
  assert.doesNotMatch(text, /MORE OPTIONS|AGREE/);
  assert.equal(
    stripConsentSurfacePreambleFromPolicyText("Our Privacy Policy explains how we process personal data and your rights."),
    "Our Privacy Policy explains how we process personal data and your rights."
  );
});

test("localized consent settings shells are not accepted as substantive privacy notices", async () => {
  const html = `<!doctype html>
    <html lang="sl">
      <head><title>Varstvo zasebnosti in piškotkov</title></head>
      <body>
        <section class="_iCD-banner js-CD-banner hidden" aria-label="Pasica za nastavitev piškotkov" data-controller="cookie-banner">
          Spletna stran uporablja piškotke v skladu z našo politiko varovanja zasebnosti.
          <button>Nastavitve</button><button>Naloži samo nujne</button><button>Naloži vse</button>
        </section>
        <main><h1>Varstvo zasebnosti in piškotkov</h1><button>Spremeni nastavitve</button></main>
      </body>
    </html>`;
  const resolved = await resolvePolicyVisibleText({
    html,
    baseUrl: "https://university.example/politika-varstva-zasebnosti-in-piskotkov",
    surfaceType: "privacy_policy",
    timeoutMs: 500,
  });
  const assessment = assessPolicyDocumentSubstance({
    surfaceType: "privacy_policy",
    title: "Varstvo zasebnosti in piškotkov",
    text: resolved,
  });

  assert.doesNotMatch(resolved, /Naloži vse|Naloži samo nujne/);
  assert.equal(assessment.matchesExpectedSurface, false);
  assert.equal(assessment.reasonCode, "consent_settings_shell");
});

test("substantive Slovenian policy text survives consent-shell exclusion", async () => {
  const substantiveText = Array.from({ length: 18 }, () => [
    "Upravljavec osebnih podatkov objavlja kontaktne podatke upravljavca in pooblaščene osebe za varstvo podatkov.",
    "Osebne podatke obdelujemo za naslednje namene in opisujemo pravno podlago za obdelavo osebnih podatkov.",
    "Navedeni so prejemniki osebnih podatkov, obdobje hrambe osebnih podatkov in pravice posameznika na katerega se nanašajo osebni podatki.",
    "Opisujemo mednarodne prenose osebnih podatkov in pravico do vložitve pritožbe pri nadzornem organu.",
  ].join(" ")).join(" ");
  const html = `<!doctype html><html lang="sl"><body>
    <section class="cookie-banner hidden"><button>Nastavitve</button><button>Naloži samo nujne</button><button>Naloži vse</button></section>
    <main><h1>Politika zasebnosti</h1><p>${substantiveText}</p></main>
  </body></html>`;
  const resolved = await resolvePolicyVisibleText({
    html,
    baseUrl: "https://university.example/politika-zasebnosti",
    surfaceType: "privacy_policy",
    timeoutMs: 500,
  });
  const assessment = assessPolicyDocumentSubstance({
    surfaceType: "privacy_policy",
    title: "Politika zasebnosti",
    text: resolved,
  });

  assert.ok(resolved.length >= 2_500);
  assert.doesNotMatch(resolved, /Naloži vse|Naloži samo nujne/);
  assert.equal(assessment.matchesExpectedSurface, true);
  assert.equal(assessment.reasonCode, "substantive_topic_match");
});

test("hidden multilingual policy accordions are not discarded as consent chrome", async () => {
  const accordionText = Array.from({ length: 12 }, () => [
    "Upravljavec osebnih podatkov je univerza, kontakt za varstvo podatkov pa je naveden v tem obvestilu.",
    "Opisujemo namene obdelave, pravno podlago, prejemnike, obdobje hrambe in pravice posameznika.",
    "Opisujemo tudi mednarodne prenose in pravico do pritožbe pri nadzornem organu.",
  ].join(" ")).join(" ");
  const resolved = await resolvePolicyVisibleText({
    html: `<!doctype html><html lang="sl"><body>
      <main><h1>Politika zasebnosti</h1></main>
      <section class="accordion-panel hidden" aria-hidden="true">
        <h2>Podrobnosti politike zasebnosti</h2><p>${accordionText}</p>
      </section>
    </body></html>`,
    baseUrl: "https://university.example/politika-zasebnosti",
    surfaceType: "privacy_policy",
    timeoutMs: 500,
  });

  assert.match(resolved, /Upravljavec osebnih podatkov/);
  assert.ok(resolved.length >= 2_500);
});

test("scanner retains a localized settings shell as fetched but insufficient policy evidence", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/politika-varstva-zasebnosti-in-piskotkov") {
      response.end(`<!doctype html><html lang="sl">
        <head><title>Varstvo zasebnosti in piškotkov</title></head><body>
        <section class="_iCD-banner js-CD-banner hidden" aria-label="Pasica za nastavitev piškotkov" data-controller="cookie-banner">
          Spletna stran uporablja piškotke v skladu z našo politiko varovanja zasebnosti.
          <button>Nastavitve</button><button>Naloži samo nujne</button><button>Naloži vse</button>
        </section>
        <main><h1>Varstvo zasebnosti in piškotkov</h1><button>Spremeni nastavitve</button></main>
        </body></html>`);
      return;
    }
    response.end(`<!doctype html><html lang="sl"><body><footer>
      <a href="/politika-varstva-zasebnosti-in-piskotkov">Politika zasebnosti</a>
    </footer></body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-slovenian-shell-"));
  try {
    const result = await policySurfaceScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 6_000,
      artifactWriter: await createArtifactWriter(tempRoot),
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl?.includes("politika-varstva-zasebnosti-in-piskotkov")
    );

    assert.equal(privacy?.linkObservationState, "observed");
    assert.equal(privacy?.documentFetchState, "fetched");
    assert.equal(privacy?.documentEvaluationState, "insufficient");
    assert.equal(privacy?.status, "failed");
    assert.equal(privacy?.fetchFailureReason, "consent_settings_shell");
    assert.deepEqual(privacy?.gdprTransparencyTopicCandidates, []);
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner recognizes bounded GDPR notice links from EU/EEA context", () => {
  assert.equal(
    isGdprNoticeSupplementLink(
      "Click here",
      "https://caltech.example/gdpr-notice",
      "For European Economic Area residents, additional rights and protections are described; click here for the GDPR notice."
    ),
    true,
  );
  assert.equal(
    isGdprNoticeSupplementLink("About us", "https://example.test/about", "Learn more about our team."),
    false,
  );
});

test("browser-recovered privacy links receive a bounded canonical document fetch", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-recovery-"));
  try {
    const homepageUrl = server.urlFor("generic-cdn-noise");
    const privacyUrl = server.urlFor("policy-article13-long");
    const artifactWriter = await createArtifactWriter(tempRoot);
    const links = [{
      domLocation: "footer" as const,
      href: `${privacyUrl}?nodeId=privacy-main&ref_=footer_privacy`,
      linkText: "Privacy Notice",
      pageUrl: homepageUrl,
    }];
    const existingObservations = policySurfaceObservationsFromRetainedRenderedLinks({ links });
    const recovered = await recoverPolicyDocumentsFromRetainedRenderedLinks({
      scannerInput: {
        url: homepageUrl,
        normalizedUrl: homepageUrl,
        scanStartedAtMs: Date.now(),
        internalBudgetMs: 6_000,
        artifactWriter,
        nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
      },
      links,
      existingObservations,
    });
    const privacy = recovered.observations.find((observation) =>
      observation.surfaceType === "privacy_policy"
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.documentEvaluationState, "usable");
    assert.match(privacy?.normalizedUrl ?? "", /nodeId=privacy-main/);
    assert.doesNotMatch(privacy?.normalizedUrl ?? "", /ref_=/);
    assert.ok((privacy?.gdprTransparencyTopicCandidates.length ?? 0) > 0);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("browser recovery primes the observed same-origin session and prioritizes the general privacy notice", async () => {
  const policyText = Array.from({ length: 12 }, () =>
    "This Privacy Notice explains how we process personal data for specified purposes and legal bases. " +
    "We disclose recipients, retention criteria, international transfers, controller contact details, and access, deletion, correction, portability, restriction, and objection rights."
  ).join(" ");
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "policy_session=ready; Path=/; SameSite=Lax",
      });
      response.end("<!doctype html><html><body><a href='/privacy'>Privacy Notice</a></body></html>");
      return;
    }
    const hasSession = /(?:^|;\s*)policy_session=ready(?:;|$)/.test(request.headers.cookie ?? "");
    if (request.url === "/privacy" && hasSession) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><body><h1>Privacy Notice</h1><p>${policyText}</p></body></html>`);
      return;
    }
    response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
    response.end("Access denied");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const homepageUrl = `http://127.0.0.1:${address.port}/`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-session-recovery-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const links = [
      {
        domLocation: "footer" as const,
        href: `${homepageUrl}consumer-health`,
        linkText: "Consumer Health Data Privacy Disclosure",
        pageUrl: homepageUrl,
      },
      {
        domLocation: "footer" as const,
        href: `${homepageUrl}privacy?ref_=footer_privacy`,
        linkText: "Privacy Notice",
        pageUrl: homepageUrl,
      },
    ];
    const recovered = await recoverPolicyDocumentsFromRetainedRenderedLinks({
      scannerInput: {
        url: homepageUrl,
        normalizedUrl: homepageUrl,
        scanStartedAtMs: Date.now(),
        internalBudgetMs: 6_000,
        artifactWriter,
        nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
      },
      links,
      existingObservations: policySurfaceObservationsFromRetainedRenderedLinks({ links }),
    });
    const privacy = recovered.observations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      canonicalWwwPolicyUrlVariant(observation.normalizedUrl ?? observation.url) === null &&
      /\/privacy(?:\?|$)/.test(observation.normalizedUrl ?? observation.url)
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.documentEvaluationState, "usable");
    assert.ok(requests.indexOf("/privacy") < requests.indexOf("/consumer-health"));
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner decodes compressed policy HTML before topic extraction", async () => {
  const policyText = Array.from({ length: 20 }, () =>
    "We process personal data for defined purposes under contract, consent, legal obligation, and legitimate interests. " +
    "Recipients include service providers. We retain data for defined periods. You may exercise access, deletion, correction, portability, restriction, and objection rights. " +
    "International transfers use standard contractual clauses. Contact the controller and data protection officer or complain to the supervisory authority."
  ).join(" ");
  const server = createServer((request, response) => {
    if (request.url === "/privacy") {
      const body = gzipSync(`<!doctype html><html><body><h1>Privacy Notice</h1><p>${policyText}</p></body></html>`);
      response.writeHead(200, {
        "content-encoding": "gzip",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(body);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end('<!doctype html><html><body><footer><a href="/privacy">Privacy Notice</a></footer></body></html>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-gzip-"));
  try {
    const url = `http://127.0.0.1:${address.port}/`;
    const result = await policySurfaceScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 6_000,
      artifactWriter: await createArtifactWriter(tempRoot),
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" && observation.status === "fetched"
    );

    assert.ok(privacy);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /\uFFFD/);
    assert.ok(privacy.gdprTransparencyTopicCandidates.length > 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("substantive direct policy text avoids supplemental policy resolution", async () => {
  const server = await startStaticFixtureServer();
  const substantivePolicyText = Array.from({ length: 18 }, (_, index) => [
    `Privacy policy section ${index + 1}.`,
    "We collect and use personal data to provide services and protect users.",
    "Our legal basis includes consent, contract, legal obligation, and legitimate interests.",
    "Recipients include processors and service providers, and we retain data only as long as necessary.",
    "You may exercise access, deletion, portability, restriction, and objection rights by contacting our privacy team.",
  ].join(" ")).join(" ");

  try {
    const supplementalPath = "/onetrust/supplemental-should-not-be-fetched.json";
    const resolved = await resolvePolicyVisibleText({
      html: `<!doctype html><html><head><script>OneTrust.NoticeApi.LoadNotices(["${server.baseUrl}${supplementalPath}"])</script></head><body><main><h1>Privacy Policy</h1><p>${substantivePolicyText}</p></main></body></html>`,
      baseUrl: `${server.baseUrl}/privacy-policy`,
      surfaceType: "privacy_policy",
      timeoutMs: 500,
    });

    assert.equal(substantivePolicyText.length >= 2_500, true);
    assert.equal(shouldUseDirectPolicyDocumentText(substantivePolicyText), true);
    assert.match(resolved, /legal basis includes consent/i);
    assert.equal(server.requestCountFor(supplementalPath), 0);
    assert.equal(shouldUseDirectPolicyDocumentText("Processing Error. Privacy Policy Cookie Settings."), false);
  } finally {
    await server.close();
  }
});

test("OneTrust retains the selected substantive notice before linked audience supplements", async () => {
  const adultPolicyText = Array.from({ length: 14 }, () => [
    "Warner Example Discovery Privacy Policy.",
    "Our services include Example News, and different members of our family of companies control information depending on the service used.",
    "We collect and use personal information for service delivery, security, analytics, and advertising.",
    "We explain legal bases, recipients, retention, international transfers, and rights of access, erasure, restriction, portability, and objection.",
    '<a href="/children-policy">Children\'s Privacy Policy</a>',
  ].join(" ")).join(" ");
  const childrenPolicyText = Array.from({ length: 14 }, () =>
    "Children's Privacy Policy. This supplement applies only to child-directed services and explains information collected from children and parents."
  ).join(" ");
  const server = createServer((request, response) => {
    response.setHeader("content-type", request.url?.endsWith(".json")
      ? "application/json; charset=utf-8"
      : "text/html; charset=utf-8");
    if (request.url === "/notice-index.json") {
      response.end(JSON.stringify({ languages: { "en-us": { policyUrl: "/notice-en-us.json" } } }));
      return;
    }
    if (request.url === "/notice-en-us.json") {
      response.end(JSON.stringify({ notices: [{ content: adultPolicyText }] }));
      return;
    }
    if (request.url === "/children-policy") {
      response.end(`<main>${childrenPolicyText}</main>`);
      return;
    }
    response.end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const resolved = await resolvePolicyVisibleText({
      html: `<main>Processing Error</main><script>OneTrust.NoticeApi.LoadNotices(["${baseUrl}/notice-index.json"])</script>`,
      baseUrl: `${baseUrl}/privacy-policy`,
      surfaceType: "privacy_policy",
      timeoutMs: 2_000,
    });

    assert.match(resolved, /Our services include Example News/i);
    assert.match(resolved, /legal bases, recipients, retention/i);
    assert.doesNotMatch(resolved, /^Children's Privacy Policy/i);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

test("cross-site corporate policy ownership recognizes a target brand in controller context", () => {
  const ownership = classifyPolicyDocumentOwnership({
    documentTitle: "en-us | Example Privacy Center",
    documentUrl: "https://privacy.example-parent.test/policycenter/consumer/en-us/",
    targetUrl: "https://examplenews.test/",
    text: [
      "Example Parent is a global family of companies whose services include ExampleNews.",
      "Different members of our family of companies control information depending on the services you use.",
      "Please consult the controller list to identify the relevant company.",
    ].join(" "),
  });

  assert.equal(ownership.targetRelationship, "first_party_brand");
  assert.equal(ownership.ownershipConfidence, 0.78);
  assert.deepEqual(ownership.ownershipReasonCodes, [
    "cross_site_document",
    "target_brand_named_in_controller_context",
  ]);
  assert.equal(ownership.documentOwnerEntity, "privacy.example-parent.test");
});

test("retained rendered links recover obvious policy surfaces when the separate policy browser is blocked", () => {
  const observations = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [
      {
        domLocation: "footer",
        href: "https://www.sony.example/en/privacy-policy/",
        linkText: "Privacy Policy",
        pageUrl: "https://www.sony.example/en/",
      },
      {
        domLocation: "body",
        href: "https://www.sony.example/en/cookie-policy/",
        linkText: "Cookie Policy",
        pageUrl: "https://www.sony.example/en/",
      },
    ],
    evidenceRef: {
      refId: "dom_text_pre_consent",
      artifactId: "dom_text_pre_consent",
      path: "/tmp/dom-text-pre-consent.txt",
    },
  });

  const privacy = observations.find((observation) => observation.surfaceType === "privacy_policy");
  const cookie = observations.find((observation) => observation.surfaceType === "cookie_policy");
  assert.equal(privacy?.status, "observed");
  assert.equal(privacy?.discoveryMethod, "footer_link");
  assert.equal(privacy?.normalizedUrl, "https://www.sony.example/en/privacy-policy/");
  assert.equal(privacy?.evidenceRefs[0]?.artifactId, "dom_text_pre_consent");
  assert.equal(privacy?.linkObservationState, "observed");
  assert.equal(privacy?.documentFetchState, "not_attempted");
  assert.equal(privacy?.documentEvaluationState, "not_attempted");
  assert.equal(cookie?.status, "observed");
  assert.deepEqual(privacy?.observedTopics, []);
});

test("retained rendered links produce typed privacy and cookie surfaces across all 40 registered locales", () => {
  assert.equal(PRIVACY_EVIDENCE_LOCALE_REGISTRY.length, 40);

  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    const privacyLabel = entry.privacyPolicyLabels[0];
    const cookieLabel = entry.cookiePolicyLabels[0];
    assert.ok(privacyLabel && cookieLabel, entry.locale);
    const observations = policySurfaceObservationsFromRetainedRenderedLinks({
      links: [
        {
          documentLanguage: entry.locale,
          domLocation: "footer",
          href: `https://example.test/${entry.locale}/privacy`,
          linkText: privacyLabel,
          pageUrl: "https://example.test/",
        },
        {
          documentLanguage: entry.locale,
          domLocation: "footer",
          href: `https://example.test/${entry.locale}/cookies`,
          linkText: cookieLabel,
          pageUrl: "https://example.test/",
        },
      ],
    });

    assert.equal(
      observations.some((observation) =>
        observation.surfaceType === "privacy_policy" && observation.matchedLocale === entry.locale
      ),
      true,
      `${entry.locale} privacy policy`,
    );
    assert.equal(
      observations.some((observation) =>
        observation.surfaceType === "cookie_policy" && observation.matchedLocale === entry.locale
      ),
      true,
      `${entry.locale} cookie policy`,
    );
  }
});

test("retained Slovenian combined privacy-cookie links project both typed surfaces", () => {
  const observations = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [{
      domLocation: "footer",
      href: "https://www.uni-lj.si/varstvo-zasebnosti",
      linkText: "Varstvo zasebnosti in piškotkov",
      pageUrl: "https://www.uni-lj.si/",
    }],
  });

  assert.deepEqual(
    observations.map((observation) => observation.surfaceType).sort(),
    ["cookie_policy", "privacy_policy"],
  );
  assert.equal(observations.every((observation) => observation.matchedLocale === "sl"), true);
  assert.equal(observations.every((observation) => observation.linkObservationState === "observed"), true);
});

test("retained consent-banner cookie notice links remain typed availability evidence", () => {
  const observations = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [{
      domLocation: "body",
      href: "https://example.com/legal/cookie-notice.pdf",
      linkText: "Cookie Notice",
      pageUrl: "https://example.com/",
    }],
  });

  const cookieNotice = observations.find((observation) => observation.surfaceType === "cookie_policy");
  assert.equal(cookieNotice?.status, "observed");
  assert.equal(cookieNotice?.linkObservationState, "observed");
  assert.equal(cookieNotice?.documentFetchState, "not_attempted");
  assert.equal(cookieNotice?.normalizedUrl, "https://example.com/legal/cookie-notice.pdf");
});

test("retained rendered links recover Russian personal-data fragment disclosures", () => {
  const observations = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [{
      domLocation: "footer",
      href: "https://life.example/legacy#persondata",
      linkText: "Обработка персональных данных",
      pageUrl: "https://life.example/",
    }],
  });

  const privacy = observations.find((observation) => observation.surfaceType === "privacy_policy");
  assert.ok(privacy);
  assert.equal(privacy.normalizedUrl, "https://life.example/legacy#persondata");
  assert.equal(privacy.matchedLocale, "ru");
  assert.equal(privacy.status, "observed");
});

test("retained combined privacy and cookie links produce both typed surfaces", () => {
  const observations = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [{
      domLocation: "footer",
      href: "https://www.wickes.example/privacy",
      linkText: "Privacy & Cookie Policy",
      pageUrl: "https://www.wickes.example/",
    }],
  });

  assert.deepEqual(
    observations.map((observation) => observation.surfaceType).sort(),
    ["cookie_policy", "privacy_policy"],
  );
  assert.equal(observations.every((observation) => observation.status === "observed"), true);
  assert.equal(observations.every((observation) => observation.linkObservationState === "observed"), true);
});

test("fetched policy evidence outranks a supplemental rendered-link observation", () => {
  const observed = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [{
      domLocation: "footer",
      href: "https://example.com/privacy-policy",
      linkText: "Privacy Policy",
      pageUrl: "https://example.com/",
    }],
  })[0];
  assert.ok(observed);
  const fetched = { ...observed, status: "fetched" as const, textExcerpt: "Substantive retained policy text." };
  const merged = mergePolicySurfaceObservations([fetched], [observed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.status, "fetched");
  assert.equal(merged[0]?.textExcerpt, "Substantive retained policy text.");
  assert.equal(countRecoveredPolicySurfaceObservations([fetched], [observed]), 0);
});

test("rendered-link diagnostics count only surfaces absent from usable dedicated policy evidence", () => {
  const rendered = policySurfaceObservationsFromRetainedRenderedLinks({
    links: [{
      domLocation: "footer",
      href: "https://example.com/privacy-policy",
      linkText: "Privacy Policy",
      pageUrl: "https://example.com/",
    }],
  })[0];
  assert.ok(rendered);
  const failed = { ...rendered, status: "failed" as const };
  assert.equal(countRecoveredPolicySurfaceObservations([failed], [rendered]), 1);
  assert.equal(countRecoveredPolicySurfaceObservations([], [rendered]), 1);
});

test("policySurfaceScanner discovers footer privacy links and bounded policy facts", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.discoveryMethod, "nano_assisted_link_classification");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.deepEqual(privacy?.mentionedVendors.sort(), ["Google Analytics", "Meta"]);
    assert.equal(privacy?.observedTopics.includes("analytics"), true);
    assert.equal(privacy?.observedTopics.includes("advertising"), true);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
    assert.equal(privacy?.sourceScanner, "policy_surface");
    assert.equal(privacy?.consentStateAtTime, "not_applicable");
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /Last updated: May 1, 2026/i);
    assert.match(retainedPolicySurfaceText, /Google Analytics and Meta/i);
    assert.doesNotMatch(retainedPolicySurfaceText, /<main|<script|<footer/i);
    assert.ok(retainedPolicySurfaceText.length <= 256_000);
  });
});

test("policySurfaceScanner protects one strong observed privacy link after the soft budget", async () => {
  const defaultNanoProvider = createDefaultMockNanoPolicyAssistProvider();
  const delayedNanoProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      await new Promise((resolve) => setTimeout(resolve, 5_150));
      return defaultNanoProvider.classifyLinks!(input);
    },
  };

  await withPolicyScan("policy-footer-privacy", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.documentFetchState, "fetched");
    assert.equal(diagnostics.funnel.protectedObservedFetchAttempts, 1);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy protected fetch")),
      true,
    );
  }, {
    internalBudgetMs: 5_000,
    nanoAssistProvider: delayedNanoProvider,
  });
});

test("policy candidate publication preserves fetched evidence that completes inside the bounded grace window", async () => {
  let documentFetched = false;
  const processingPromise = new Promise<string>((resolve) => {
    setTimeout(() => {
      documentFetched = true;
    }, 10);
    setTimeout(() => resolve("retained-evidence-published"), 40);
  });

  const result = await settlePolicyCandidateProcessingBeforeDeadline({
    processingPromise,
    shouldAwaitPublication: () => documentFetched,
    processingTimeoutMs: 25,
    publicationGraceMs: 100,
  });

  assert.deepEqual(result, {
    status: "completed",
    value: "retained-evidence-published",
  });
});

test("policy candidate publication still fails closed when no document was fetched before timeout", async () => {
  const result = await settlePolicyCandidateProcessingBeforeDeadline({
    processingPromise: new Promise<string>((resolve) => setTimeout(() => resolve("late"), 100)),
    shouldAwaitPublication: () => false,
    processingTimeoutMs: 10,
    publicationGraceMs: 100,
  });

  assert.deepEqual(result, { status: "timed_out" });
});

test("policySurfaceScanner preserves an exact privacy notice when Nano ranks commerce URL noise", async () => {
  const requestCounts = new Map<string, number>();
  const policyText = Array.from({ length: 28 }, () =>
    "This Privacy Notice explains how Example Company processes personal data for service delivery, analytics, and fraud prevention. " +
    "We rely on contract, consent, legal obligations, and legitimate interests. We share information with named service providers and recipient categories. " +
    "We retain personal data only as long as necessary, use standard contractual clauses for international transfers, and provide rights of access, correction, deletion, restriction, portability, and objection."
  ).join(" ");
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://fixture.test").pathname;
    requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (pathname === "/policies/privacy-notice") {
      response.end(`<!doctype html><html><body><h1>Privacy Notice</h1><main>${policyText}</main></body></html>`);
      return;
    }
    if (pathname === "/gp/product/Ultra-Thin-Protect-Privacy/dp/B0TEST") {
      response.end("<!doctype html><html><body><h1>Privacy screen protector</h1></body></html>");
      return;
    }
    response.end(`<!doctype html><html><body><main>Products</main><footer>
      <a href="/gp/product/Ultra-Thin-Protect-Privacy/dp/B0TEST">Ultra-Thin Protect Privacy Filter</a>
      <a href="/policies/privacy-notice">Privacy Notice</a>
    </footer></body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-commerce-noise-"));

  try {
    const result = await policySurfaceScanner({
      url: baseUrl,
      normalizedUrl: baseUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter: await createArtifactWriter(tempRoot),
      nanoAssistProvider: {
        async classifyLinks(input) {
          const commerceNoise = input.candidates.find((candidate) =>
            candidate.normalizedUrl.includes("/gp/product/"),
          );
          assert.ok(commerceNoise);
          return {
            assistId: input.assistId,
            rankedCandidates: [{
              candidateId: commerceNoise.candidateId,
              likelySurfaceType: "privacy_policy",
              shouldFetch: true,
              priorityRank: 1,
              confidence: 0.91,
              reason: "Fixture intentionally ranks a product whose URL contains privacy.",
            }],
          };
        },
      },
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/privacy-notice`,
    );

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.documentEvaluationState, "usable");
    assert.equal(requestCounts.get("/gp/product/Ultra-Thin-Protect-Privacy/dp/B0TEST") ?? 0, 0);
    assert.ok(privacy?.artifactRefs.some((ref) => ref.artifactId.startsWith("policy_surface_text_")));
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("a substantive governing policy remains a policy document when it links to privacy supplements", async () => {
  const substantivePolicyText = Array.from({ length: 20 }, () => [
    "Example University Privacy Notice.",
    "We collect and use personal data for education, research, service delivery, security, and legal compliance.",
    "The notice identifies the controller, processing purposes, legal bases, recipients, retention criteria, international transfers, and privacy rights.",
  ].join(" ")).join(" ");
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/privacy") {
      response.end(`<main><h1>Privacy Notice</h1><p>${substantivePolicyText}</p>
        <a href="/gdpr-notice">GDPR Privacy Notice</a>
        <a href="/state-privacy-notice">State Privacy Notice</a>
      </main>`);
      return;
    }
    if (request.url === "/gdpr-notice" || request.url === "/state-privacy-notice") {
      response.end("<main><h1>Supplemental Privacy Notice</h1><p>Additional jurisdiction-specific privacy information.</p></main>");
      return;
    }
    response.end('<footer><a href="/privacy">Privacy Notice</a></footer>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-substantive-parent-"));

  try {
    const result = await policySurfaceScanner({
      url: baseUrl,
      normalizedUrl: baseUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter: await createArtifactWriter(tempRoot),
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const policy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/privacy`
    );

    assert.equal(policy?.status, "fetched");
    assert.equal(policy?.documentRole, "policy_document");
    assert.equal(policy?.documentEvaluationState, "usable");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner strips script/config noise before retaining Article 13 policy evidence", async () => {
  await withPolicyScan("policy-google-script-noise", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "processing_purposes"), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "data_subject_rights"), true);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /this\.gbar_|Closure Library|Object\.defineProperties|CONFIG:\[\[\[/i);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /This policy explains how we collect, use, retain, share/i);
    assert.doesNotMatch(retainedPolicySurfaceText, /this\.gbar_|Closure Library|Object\.defineProperties|CONFIG:\[\[\[/i);
  });
});

test("policySurfaceScanner rejects script-only policy pages as unusable evidence", async () => {
  await withPolicyScan("policy-google-script-only", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/google-script-only`
    );

    assert.equal(privacy?.status, "failed");
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.observedTopics, []);
  });
});

test("policySurfaceScanner does not retain access challenge pages as fetched policy surfaces", async () => {
  await withPolicyScan("policy-client-challenge", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/client-challenge`
    );

    assert.equal(privacy?.status, "failed");
    assert.equal(privacy?.title, "Client Challenge");
    assert.match(privacy?.textExcerpt ?? "", /required part of this site couldn/i);
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.gdprTransparencyTopicCandidates, []);
  });
});

test("policySurfaceScanner treats localized CAPTCHA policy pages as access challenges", async () => {
  await withPolicyScan("policy-french-captcha-challenge", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/french-captcha-challenge`
    );

    assert.equal(privacy?.status, "failed");
    assert.match(privacy?.textExcerpt ?? "", /CAPTCHA audio/i);
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.gdprTransparencyTopicCandidates, []);
  });
});

test("policySurfaceScanner fast mode keeps rendered discovery when static links lack cookie settings controls", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(labels.includes("rendered discovery"), true);
    assert.equal(labels.includes("rendered discovery skipped"), false);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run in fast static coverage mode.");
      },
    },
  });
});

test("policySurfaceScanner fast mode retains warmed static policy evidence after rendered discovery consumes the soft budget", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(labels.includes("static policy fetch warmup"), true);
    assert.equal(labels.includes("rendered discovery"), true);
    assert.equal(labels.some((label) => label.startsWith("policy prefetched text resolution")), true);
    assert.equal(labels.some((label) => label.startsWith("policy text resolution")), false);
    assert.equal(labels.some((label) => label.startsWith("policy url-stub follow")), false);
    assert.equal(privacy?.status, "fetched");
  }, {
    discoveryMode: "fast",
    enableNanoPolicyAssist: true,
    internalBudgetMs: 1,
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run in fast static coverage mode.");
      },
      async extractTopics() {
        throw new Error("Nano topic extraction should not start after the soft policy budget.");
      },
    },
  });
});

test("policySurfaceScanner fast mode stops stalled rendered discovery at the soft budget and retains warmed policy evidence", async () => {
  const stalledBrowser = {
    async newContext() {
      return {
        async newPage() {
          return {
            async goto() {
              await new Promise<never>(() => undefined);
            },
          };
        },
        async close() {},
      };
    },
  } as unknown as Browser;

  const startedAtMs = Date.now();
  await withPolicyScan("policy-footer-privacy", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.ok(Date.now() - startedAtMs < 4_000);
  }, {
    browser: stalledBrowser,
    discoveryMode: "fast",
    internalBudgetMs: 1_800,
  });
});

test("policySurfaceScanner honors a parent absolute deadline and returns coverage-limited evidence", async () => {
  let contextClosed = false;
  let rejectNavigation: ((reason?: unknown) => void) | undefined;
  const stalledBrowser = {
    async newContext() {
      return {
        async newPage() {
          return {
            async goto() {
              return await new Promise<never>((_resolve, reject) => {
                rejectNavigation = reject;
              });
            },
          };
        },
        async close() {
          contextClosed = true;
          rejectNavigation?.(new Error("context closed after policy deadline"));
        },
      };
    },
  } as unknown as Browser;
  const startedAtMs = Date.now();
  await withPolicyScan("policy-no-links", async ({ result }) => {
    assert.ok(["partial", "skipped_budget"].includes(result.moduleRun.status));
    assert.match(result.moduleRun.errors.join(" "), /absolute .*deadline|coverage-limited/i);
    assert.equal(contextClosed, true);
    assert.ok(Date.now() - startedAtMs < 4_000);
  }, {
    absoluteDeadlineAtMs: Date.now() + 1_800,
    browser: stalledBrowser,
    internalBudgetMs: 60_000,
  }, { expectCompleted: false });
});

test("policySurfaceScanner fast mode skips rendered discovery when static core surfaces are present", async () => {
  await withPolicyScan("policy-static-core-surfaces", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const cookie = observedSurface(result.policySurfaceObservations, "cookie_policy");
    const terms = observedSurface(result.policySurfaceObservations, "terms");
    const choices = observedSurface(result.policySurfaceObservations, "your_privacy_choices");

    assert.equal(privacy?.status, "fetched");
    assert.equal(cookie?.status, "fetched");
    assert.equal(terms?.status, "fetched");
    assert.equal(choices?.status, "fetched");
    assert.equal(terms?.normalizedUrl, `${baseUrl}/terms`);
    assert.equal(labels.includes("rendered discovery"), false);
    assert.equal(labels.includes("rendered discovery skipped"), true);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when static core surfaces are complete.");
      },
    },
  });
});

test("policySurfaceScanner fast mode keeps rendered discovery for weak static policy shells", async () => {
  await withPolicyScan("policy-static-legacy-plus-rendered-canonical", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];

    assert.equal(labels.includes("rendered discovery"), true);
    assert.equal(labels.includes("rendered discovery skipped"), false);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run in fast static coverage mode.");
      },
    },
  });
});

test("policySurfaceScanner follows URL-only policy stubs to retain canonical policy text", async () => {
  await withPolicyScan("policy-url-stub-canonical", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/canonical-privacy`);
    assert.ok(privacy?.textExcerpt?.includes("personal data"));
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "processing_purposes"), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "legal_basis"), true);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /standard contractual clauses/i);
    assert.doesNotMatch(retainedPolicySurfaceText.trim(), /^https?:\/\//i);
    assert.equal(labels.some((label) => label.startsWith("policy url-stub follow")), true);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when deterministic fast discovery can follow URL-only policy stubs.");
      },
    },
  });
});

test("policySurfaceScanner classifies expected policy and control surfaces", async () => {
  const cases = [
    ["policy-cookie-link", "cookie_policy", "cookies"],
    ["policy-privacy-choices-link", "your_privacy_choices", "global_privacy_control"],
    ["policy-state-privacy-rights-link", "california_notice", "california_privacy_rights"],
    ["policy-do-not-sell-link", "do_not_sell_or_share", "do_not_sell_or_share"],
    ["policy-notice-at-collection-link", "notice_at_collection", "notice_at_collection"],
    ["policy-gpc-disclosure", "privacy_policy", "global_privacy_control"],
    ["policy-session-replay-disclosure", "privacy_policy", "session_replay_or_behavioral_analytics"],
    ["policy-ai-disclosure", "ai_disclosure", "ai_features"],
  ] as const;

  for (const [page, surfaceType, topic] of cases) {
    await withPolicyScan(page, async ({ result }) => {
      const surface = result.policySurfaceObservations.find((observation) =>
        observation.surfaceType === surfaceType &&
        observation.status === "fetched" &&
        observation.observedTopics.includes(topic),
      );
      assert.ok(surface, `${page} should observe ${surfaceType} with ${topic}`);
    });
  }
});

test("policySurfaceScanner uses canonical privacy-surface classifier across supported locales", async () => {
  await withPolicyScan("policy-multilingual-surfaces", async ({ result }) => {
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const summaryByText = new Map(diagnostics.candidateSummary.map((candidate) => [candidate.linkText, candidate]));
    const expected = [
      ["Privacy Policy", "en", "privacy_policy", "direct"],
      ["Datenschutzerklärung", "de", "privacy_policy", "direct"],
      ["Politique de confidentialité", "fr", "privacy_policy", "direct"],
      ["Política de privacidad", "es", "privacy_policy", "direct"],
      ["Informativa sulla privacy", "it", "privacy_policy", "direct"],
      ["Privacybeleid", "nl", "privacy_policy", "direct"],
      ["Polityka prywatności", "pl", "privacy_policy", "direct"],
      ["Cookiebeleid", "nl", "cookie_policy", "direct"],
      ["Polityka plików cookie", "pl", "cookie_policy", "direct"],
    ] as const;

    for (const [linkText, matchedLocale, surfaceType, matchStrength] of expected) {
      const summary = summaryByText.get(linkText);
      assert.ok(summary, `${linkText} should be retained in policy candidate diagnostics`);
      assert.equal(summary.surfaceType, surfaceType, linkText);
      assert.equal(summary.matchedLocale, matchedLocale, linkText);
      assert.equal(summary.matchStrength, matchStrength, linkText);
      assert.equal(summary.classifierProvenance, "privacy_surface_classifier.v1", linkText);
      assert.equal(summary.classifierReasonCodes.some((code) => code === `matched_${surfaceType}`), true, linkText);
    }
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for deterministic multilingual surface coverage.");
      },
    },
  });
});

test("policySurfaceScanner keeps footer policy links from oversized publisher homepages", async () => {
  await withPolicyScan("policy-large-homepage-legal-footer", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/legal/page/politique-de-confidentialite`
    );
    const cookies = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "cookie_policy" &&
      observation.normalizedUrl === `${baseUrl}/legal/le-figaro/info-cookies-lefigaro`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.ok(cookies);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.linkText === "Confidentialité" &&
        candidate.normalizedUrl === `${baseUrl}/legal/page/politique-de-confidentialite`
      ),
      true,
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not be needed for oversized footer policy links.");
      },
    },
  });
});

test("policySurfaceScanner keeps middle footer policy links from oversized publisher homepages", async () => {
  await withPolicyScan("policy-large-homepage-middle-legal-footer", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/corporate-site/datenschutz/datenschutz/artikel-datenschutz-54485502.bild.html`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.equal(privacy.title, "Datenschutz");
    assert.equal(diagnostics.corePolicySurfaceRetained, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.linkText === "Datenschutz" &&
        candidate.normalizedUrl === `${baseUrl}/corporate-site/datenschutz/datenschutz/artikel-datenschutz-54485502.bild.html`
      ),
      true,
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not be needed for middle oversized footer policy links.");
      },
    },
  });
});

test("policySurfaceScanner does not classify unrelated footer links from neighboring privacy text", async () => {
  await withPolicyScan("policy-neighboring-footer-privacy-noise", async ({ result, baseUrl }) => {
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const summaryByText = new Map(diagnostics.candidateSummary.map((candidate) => [candidate.linkText, candidate]));
    const contact = summaryByText.get("Contacto");
    const accessibility = summaryByText.get("Accesibilidad");
    const account = summaryByText.get("Konto");
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/politica-de-privacidad`
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "cookie_policy" &&
      observation.normalizedUrl === `${baseUrl}/politica-de-cookies`
    );

    assert.equal(contact?.surfaceType ?? "unknown", "unknown");
    assert.equal(account?.surfaceType ?? "unknown", "unknown");
    assert.equal(accessibility?.surfaceType ?? "accessibility_statement", "accessibility_statement");
    assert.equal(privacy?.status, "fetched");
    assert.equal(cookie?.status, "fetched");
    assert.equal(
      result.policySurfaceObservations.some((observation) =>
        observation.surfaceType === "privacy_policy" &&
        /contacto|accesibilidad|auth\/v1\/sso/i.test(observation.normalizedUrl)
      ),
      false,
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for deterministic neighboring-footer regression coverage.");
      },
    },
  });
});

test("policySurfaceScanner retains canonical GDPR Transparency topic candidates across supported locales without default production credit", async () => {
  await withPolicyScan("policy-multilingual-article13-topics", async ({ result, baseUrl }) => {
    const expectedTopics = [
      "controller_contact",
      "dpo_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ] as const;
    const expectedPolicies = [
      ["en", "/policies/article13-en"],
      ["de", "/policies/article13-de"],
      ["fr", "/policies/article13-fr"],
      ["es", "/policies/article13-es"],
      ["it", "/policies/article13-it"],
      ["nl", "/policies/article13-nl"],
      ["pl", "/policies/article13-pl"],
      ["pt", "/policies/article13-pt"],
    ] as const;

    for (const [locale, path] of expectedPolicies) {
      const privacy = result.policySurfaceObservations.find((observation) =>
        observation.status === "fetched" &&
        observation.surfaceType === "privacy_policy" &&
        observation.normalizedUrl === `${baseUrl}${path}`
      );
      assert.ok(privacy, `${locale} policy should be fetched`);

      for (const topic of expectedTopics) {
        const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
        assert.ok(
          candidate,
          `${locale} should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
        );
        assert.equal(candidate.status, "diagnostic_only", `${locale} ${topic}`);
        assert.equal(candidate.productionCredit, false, `${locale} ${topic}`);
        assert.equal(candidate.classifierProvenance, "gdpr_transparency_topic_classifier.v1", `${locale} ${topic}`);
        assert.equal(candidate.matchedLocale, locale, `${locale} ${topic}`);
        assert.ok(candidate.matchedTerm, `${locale} ${topic} should retain matched term`);
        assert.ok(candidate.matchStrength === "direct" || candidate.matchStrength === "equivalent", `${locale} ${topic}`);
        assert.equal(candidate.classifierReasonCodes?.includes(`matched_${topic}`), true, `${locale} ${topic}`);
        assert.ok(candidate.evidenceText.length <= 640, `${locale} ${topic} evidence should be bounded`);
      }

      assert.equal(
        privacy.article13DisclosureSignals.some((signal) => signal.classifierProvenance === "gdpr_transparency_topic_classifier.v1"),
        false,
        `${locale} classifier candidates must not be promoted to Article 13 signals by default`,
      );

      if (locale !== "en") {
        const productionArticle13Topics = expectedTopics.map((topic) =>
          topic === "automated_decision_making_or_profiling" ? "profiling_or_automated_decision_making" : topic
        );
        assert.deepEqual(privacy.article13DisclosureSignals, [], `${locale} classifier-only matches should not create Article 13 signals`);
        assert.equal(
          privacy.observedTopics.some((topic) => productionArticle13Topics.includes(topic)),
          false,
          `${locale} classifier-only matches should not create Article 13 observed topics`,
        );
      } else {
        assert.equal(
          privacy.article13DisclosureSignals.some((signal) => signal.disclosureType === "legal_basis"),
          true,
          "English legacy Article 13 extraction should still run",
        );
      }
    }
  });
});

test("policySurfaceScanner derives diagnostic GDPR Transparency candidates from retained French policy sections", () => {
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections([
    {
      heading: "2. QUI EST LE RESPONSABLE DES TRAITEMENTS MENTIONNÉS DANS LE PRÉSENT DOCUMENT ?",
      textExcerpt: "Le responsable du traitement est la Société éditrice du Monde. La déléguée à la protection des données du Groupe Le Monde est indiquée dans cette politique de confidentialité."
    },
    {
      heading: "5. PENDANT COMBIEN DE TEMPS CONSERVONS-NOUS VOS DONNÉES ?",
      textExcerpt: "La durée de conservation des données personnelles est conforme aux dispositions légales et proportionnelle aux finalités pour lesquelles elles ont été enregistrées."
    },
    {
      heading: "7. VOS DONNÉES SONT-ELLES TRANSFÉRÉES EN DEHORS DE L’UNION EUROPÉENNE ?",
      textExcerpt: "Certains traitements impliquent des transferts internationaux de données personnelles vers des sous-traitants situés dans d’autres pays. En cas de transfert, le traitement est encadré par les clauses contractuelles types."
    }
  ]);

  assert.equal(
    candidates.some((candidate) => candidate.topic === "controller_contact"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.topic === "data_retention"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.topic === "international_transfers"),
    true
  );
  assert.equal(
    candidates.every((candidate) =>
      candidate.status === "diagnostic_only" &&
      candidate.productionCredit === false &&
      candidate.classifierProvenance === "gdpr_transparency_topic_classifier.v1"
    ),
    true
  );
});

test("policy section extraction preserves structured table rows for canonical multilingual Article 13 evidence", () => {
  const sourceUrl = "https://example.test/informativa-privacy-generale";
  const html = `
    <main>
      <h1>Privacy Policy Generale</h1>
      <table>
        <tr>
          <th>Finalità del trattamento</th>
          <th>Base giuridica</th>
          <th>Destinatari e responsabili del trattamento</th>
          <th>Periodo di conservazione</th>
          <th>Diritti degli interessati</th>
          <th>Trasferimenti extra UE</th>
        </tr>
        <tr>
          <td>Gestione del rapporto contrattuale e delle richieste degli utenti</td>
          <td>Articolo 6, paragrafo 1, lettere a, b e f del GDPR</td>
          <td>Dipendenti, società affiliate, fornitori informatici e responsabili ex articolo 28</td>
          <td>Due anni, sei mesi o dieci anni secondo la finalità</td>
          <td>Accesso, rettifica, cancellazione, limitazione, portabilità e opposizione</td>
          <td>Paesi extra UE con le garanzie degli articoli 44 e seguenti</td>
        </tr>
      </table>
    </main>`;
  const sections = extractPolicySections({ html, sourceUrl, visibleText: "Privacy Policy Generale" });
  const tableRow = sections.find((section) => /Base giuridica: Articolo 6/i.test(section.textExcerpt));
  assert.ok(tableRow);
  assert.match(tableRow.textExcerpt, /Periodo di conservazione: Due anni/i);
  assert.match(tableRow.textExcerpt, /Trasferimenti extra UE: Paesi extra UE/i);

  const evidence = gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections);
  assert.deepEqual(
    new Set(evidence.map((row) => row.topic)),
    new Set([
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers"
    ])
  );
  assert.equal(evidence.every((row) => row.status === "diagnostic_only" && row.productionCredit === false), true);
});

test("policy section extraction retains canonical topic windows from a long headingless policy body", () => {
  const sourceUrl = "https://media.example/privacy";
  const visibleText = [
    "Privacy Policy. This policy describes how Media Example handles personal information when you use our services.",
    "Background information about our products and accounts. ".repeat(30),
    "How we use your personal information. We use your personal information to operate, provide, develop, and improve the products and services offered to customers.",
    "We share personal information with service providers, affiliates, analytics providers, and advertising partners that support the services.",
    "Personal information may be transferred to and processed in the United States or other countries using Standard Contractual Clauses and other appropriate safeguards.",
    "You may exercise rights to access, correct, delete, restrict, object to processing, and receive a portable copy of your personal information.",
  ].join(" ");
  const sections = extractPolicySections({
    html: `<main>${visibleText}</main>`,
    sourceUrl,
    visibleText,
  });
  const evidence = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  const row = (coverageArea: string) => evidence.find((candidate) =>
    candidate.coverageArea === coverageArea
  );

  assert.equal(row("processing_purposes")?.signalObserved, "observed");
  assert.equal(row("recipients_or_vendor_categories")?.signalObserved, "observed");
  assert.equal(row("international_transfers")?.signalObserved, "observed");
  assert.equal(row("data_subject_rights")?.signalObserved, "observed");
  assert.equal(
    sections.some((section) =>
      section.heading !== "Policy body" && section.extractionState === "complete"
    ),
    true,
  );
  assert.equal(
    sections.filter((section) => section.heading.startsWith("Policy body section ")).length >= 2,
    true,
  );
});

test("cookie disclosure extraction retains Oxfam-style named-cookie tables", () => {
  const sourceUrl = "https://www.oxfam.org/en/cookies";
  const html = `
    <main>
      <h1>Cookies</h1>
      <h2>Essential cookies</h2>
      <table>
        <tr><th>Cookie name</th><th>Provider</th><th>Expiry</th><th>Purpose</th></tr>
        <tr><td>__stripe_mid</td><td>Stripe</td><td>1 year</td><td>Necessary for credit card transactions.</td></tr>
        <tr><td>__stripe_sid</td><td>Stripe</td><td>1 year</td><td>Necessary for credit card transactions.</td></tr>
        <tr><td>_ga</td><td>google.com</td><td>2 years</td><td>Registers a unique analytics identifier.</td></tr>
        <tr><td>_gid</td><td>google.com</td><td>1 day</td><td>Registers a unique analytics identifier.</td></tr>
        <tr><td>_gat</td><td>google.com</td><td>1 day</td><td>Throttles the analytics request rate.</td></tr>
        <tr><td>fundraiseup_cid</td><td>Fundraise Up</td><td>10 years</td><td>Persistent anti-fraud and analytics identifier.</td></tr>
        <tr><td>fundraiseup_session</td><td>Fundraise Up</td><td>Session</td><td>Temporary session identifier.</td></tr>
        <tr><td>CookieConsent</td><td>Oxfam.org</td><td>1 year</td><td>Stores the user's consent state.</td></tr>
      </table>
      <h2>Non-essential cookies</h2>
      <table>
        <tr><th>Cookie name</th><th>Provider</th><th>Expiry</th><th>Purpose</th></tr>
        <tr><td>VISITOR_INFO1_LIVE</td><td>youtube.com</td><td>179 days</td><td>Estimates bandwidth for embedded videos.</td></tr>
      </table>
    </main>`;
  const retainedPolicySections = extractPolicySections({
    html,
    sourceUrl,
    visibleText: "Cookies Essential cookies Non-essential cookies",
  });
  const disclosures = extractPolicyCookieDisclosures({
    html,
    retainedPolicySections,
    sourceUrl,
  });

  assert.deepEqual(
    disclosures.map((row) => row.cookieName),
    [
      "__stripe_mid",
      "__stripe_sid",
      "_ga",
      "_gid",
      "_gat",
      "fundraiseup_cid",
      "fundraiseup_session",
      "CookieConsent",
      "VISITOR_INFO1_LIVE",
    ],
  );
  assert.equal(disclosures.find((row) => row.cookieName === "_ga")?.category, "essential");
  assert.equal(
    disclosures.find((row) => row.cookieName === "VISITOR_INFO1_LIVE")?.category,
    "non_essential",
  );
  assert.equal(
    disclosures.every((row) =>
      row.parserProvenance === "policy_cookie_table_dom.v1" &&
      row.sourceUrl === sourceUrl &&
      row.evidenceRef.startsWith("policy_cookie_")
    ),
    true,
  );
});

test("cookie disclosure extraction rejects generic non-cookie tables", () => {
  const html = `
    <table>
      <tr><th>Name</th><th>Provider</th><th>Description</th></tr>
      <tr><td>Donation service</td><td>Example</td><td>Processes donations.</td></tr>
    </table>`;
  assert.deepEqual(
    extractPolicyCookieDisclosures({
      html,
      retainedPolicySections: [],
      sourceUrl: "https://example.test/services",
    }),
    [],
  );
});

test("policySurfaceScanner derives all canonical GDPR Transparency candidates for the twenty-one expansion locales", () => {
  const policies = [
    ["ru", "Оператор персональных данных указывает контакт ответственного по защите данных. Мы описываем цели обработки персональных данных, правовые основания обработки персональных данных, категории получателей персональных данных, срок хранения персональных данных, права субъекта персональных данных, трансграничную передачу персональных данных, право подать жалобу в надзорный орган и автоматизированное принятие решений с использованием персональных данных."],
    ["ja", "個人データの管理者はデータ保護責任者への連絡先を示します。個人データを処理する目的、個人データ処理の法的根拠、個人データの受領者のカテゴリー、個人データの保存期間、データ主体の権利、個人データの国際移転、監督機関に苦情を申し立てる権利、個人データを用いた自動意思決定について説明します。"],
    ["zh", "个人数据控制者提供数据保护负责人的联系方式。我们说明处理个人数据的目的、处理个人数据的法律依据、个人数据接收方的类别、个人数据的保存期限、数据主体的权利、个人数据的跨境传输、向监管机构投诉的权利以及使用个人数据进行自动化决策。"],
    ["ar", "يقدم مراقب البيانات الشخصية بيانات الاتصال بمسؤول حماية البيانات. نشرح أغراض معالجة البيانات الشخصية والأساس القانوني لمعالجة البيانات الشخصية وفئات مستلمي البيانات الشخصية ومدة الاحتفاظ بالبيانات الشخصية وحقوق صاحب البيانات والنقل الدولي للبيانات الشخصية والحق في تقديم شكوى إلى سلطة رقابية واتخاذ القرارات الآلية باستخدام البيانات الشخصية."],
    ["sv", "Personuppgiftsansvarig anger kontaktuppgifter till dataskyddsombudet. Vi beskriver ändamålen med behandlingen av personuppgifter, rättslig grund för behandling av personuppgifter, kategorier av mottagare av personuppgifter, lagringstid för personuppgifter, den registrerades rättigheter, internationella överföringar av personuppgifter, rätt att lämna in klagomål till en tillsynsmyndighet och automatiserat beslutsfattande med personuppgifter."],
    ["ro", "Operatorul de date cu caracter personal furnizează datele de contact ale responsabilului cu protecția datelor. Explicăm scopurile prelucrării datelor cu caracter personal, temeiul juridic al prelucrării datelor cu caracter personal, categoriile de destinatari ai datelor cu caracter personal, perioada de păstrare a datelor cu caracter personal, drepturile persoanei vizate, transferurile internaționale de date cu caracter personal, dreptul de a depune o plângere la o autoritate de supraveghere și procesul decizional automatizat privind datele cu caracter personal."],
    ["cs", "Správce osobních údajů uvádí kontaktní údaje pověřence pro ochranu osobních údajů. Popisujeme účely zpracování osobních údajů, právní základ pro zpracování osobních údajů, kategorie příjemců osobních údajů, dobu uložení osobních údajů, práva subjektu údajů, mezinárodní předávání osobních údajů, právo podat stížnost u dozorového úřadu a automatizované rozhodování včetně profilování."],
    ["el", "Ο υπεύθυνος επεξεργασίας δεδομένων προσωπικού χαρακτήρα παρέχει τα στοιχεία επικοινωνίας του υπευθύνου προστασίας δεδομένων. Περιγράφουμε τους σκοπούς της επεξεργασίας δεδομένων προσωπικού χαρακτήρα, τη νομική βάση για την επεξεργασία δεδομένων προσωπικού χαρακτήρα, τις κατηγορίες αποδεκτών των δεδομένων προσωπικού χαρακτήρα, το διάστημα αποθήκευσης των δεδομένων προσωπικού χαρακτήρα, τα δικαιώματα του υποκειμένου των δεδομένων, τις διεθνείς διαβιβάσεις δεδομένων προσωπικού χαρακτήρα, το δικαίωμα υποβολής καταγγελίας σε εποπτική αρχή και την αυτοματοποιημένη λήψη αποφάσεων με δεδομένα προσωπικού χαρακτήρα."],
    ["hu", "A személyes adatok adatkezelője megadja az adatvédelmi tisztviselő elérhetőségeit. Ismertetjük a személyes adatok kezelésének célját, az adatkezelés jogalapját, a személyes adatok címzettjeinek kategóriáit, a személyes adatok tárolásának időtartamát, az érintett jogait, a személyes adatok nemzetközi továbbítását, a panasz benyújtásának jogát valamely felügyeleti hatósághoz és a személyes adatok felhasználásával történő automatizált döntéshozatalt."],
    ["da", "Den dataansvarlige angiver kontaktoplysninger for databeskyttelsesrådgiveren. Vi beskriver formålene med behandlingen af personoplysninger, retsgrundlaget for behandlingen af personoplysninger, kategorier af modtagere af personoplysninger, opbevaringsperioden for personoplysninger, den registreredes rettigheder, internationale overførsler af personoplysninger, retten til at indgive en klage til en tilsynsmyndighed og automatiserede afgørelser med personoplysninger."],
    ["fi", "Rekisterinpitäjän yhteystiedot ja tietosuojavastaavan yhteystiedot. Henkilötietojen käsittelyn tarkoitukset, henkilötietojen käsittelyn oikeusperuste, henkilötietojen vastaanottajaryhmät, henkilötietojen säilytysaika, rekisteröidyn oikeudet, henkilötietojen kansainväliset siirrot, oikeus tehdä valitus valvontaviranomaiselle ja automatisoitu päätöksenteko mukaan lukien profilointi."],
    ["sk", "Kontaktné údaje prevádzkovateľa a kontaktné údaje zodpovednej osoby. Účely spracúvania osobných údajov, právny základ spracúvania osobných údajov, kategórie príjemcov osobných údajov, doba uchovávania osobných údajov, práva dotknutej osoby, medzinárodné prenosy osobných údajov, právo podať sťažnosť dozornému orgánu a automatizované rozhodovanie vrátane profilovania."],
    ["bg", "Данни за контакт на администратора и данни за контакт на длъжностното лице по защита на данните. Целите на обработването на лични данни, правното основание за обработването на лични данни, категориите получатели на лични данни, срокът за съхранение на личните данни, правата на субекта на данните, международно предаване на лични данни, право на жалба до надзорен орган и автоматизирано вземане на решения включително профилиране."],
    ["hr", "Kontaktni podaci voditelja obrade i kontaktni podaci službenika za zaštitu podataka. Svrhe obrade osobnih podataka, pravna osnova za obradu osobnih podataka, kategorije primatelja osobnih podataka, razdoblje pohrane osobnih podataka, prava ispitanika, međunarodni prijenosi osobnih podataka, pravo na podnošenje pritužbe nadzornom tijelu i automatizirano donošenje odluka uključujući izradu profila."],
    ["nb", "Kontaktopplysninger til den behandlingsansvarlige og personvernombudets kontaktopplysninger. Formålene med behandlingen av personopplysninger, rettslig grunnlag for behandling av personopplysninger, kategorier av mottakere av personopplysninger, lagringsperiode for personopplysninger, den registrertes rettigheter, internasjonale overføringer av personopplysninger, rett til å klage til en tilsynsmyndighet og automatiserte avgjørelser herunder profilering."],
    ["sl", "Kontaktni podatki upravljavca in kontaktni podatki pooblaščene osebe za varstvo podatkov. Nameni obdelave osebnih podatkov, pravna podlaga za obdelavo osebnih podatkov, kategorije prejemnikov osebnih podatkov, obdobje hrambe osebnih podatkov, pravice posameznika na katerega se nanašajo osebni podatki, mednarodni prenosi osebnih podatkov, pravica do vložitve pritožbe pri nadzornem organu in avtomatizirano sprejemanje odločitev vključno z oblikovanjem profilov."],
    ["lt", "Duomenų valdytojo kontaktiniai duomenys ir duomenų apsaugos pareigūno kontaktiniai duomenys. Asmens duomenų tvarkymo tikslai, teisinis asmens duomenų tvarkymo pagrindas, asmens duomenų gavėjų kategorijos, asmens duomenų saugojimo laikotarpis, duomenų subjekto teisės, tarptautinis asmens duomenų perdavimas, teisė pateikti skundą priežiūros institucijai ir automatizuotas sprendimų priėmimas įskaitant profiliavimą."],
    ["lv", "Pārziņa kontaktinformācija un datu aizsardzības speciālista kontaktinformācija. Personas datu apstrādes nolūki, personas datu apstrādes juridiskais pamats, personas datu saņēmēju kategorijas, personas datu glabāšanas laikposms, datu subjekta tiesības, personas datu starptautiska nosūtīšana, tiesības iesniegt sūdzību uzraudzības iestādei un automatizēta lēmumu pieņemšana tostarp profilēšana."],
    ["et", "Vastutava töötleja kontaktandmed ja andmekaitsespetsialisti kontaktandmed. Isikuandmete töötlemise eesmärgid, isikuandmete töötlemise õiguslik alus, isikuandmete vastuvõtjate kategooriad, isikuandmete säilitamise ajavahemik, andmesubjekti õigused, isikuandmete rahvusvaheline edastamine, õigus esitada kaebus järelevalveasutusele ja automatiseeritud otsuste tegemine sealhulgas profiilianalüüs."],
    ["uk", "Контактні дані володільця персональних даних і контактні дані відповідальної особи із захисту даних. Цілі обробки персональних даних, правова підстава для обробки персональних даних, категорії одержувачів персональних даних, строк зберігання персональних даних, права суб'єкта персональних даних, міжнародна передача персональних даних, право подати скаргу до наглядового органу та автоматизоване прийняття рішень включаючи профілювання."],
    ["tr", "Veri sorumlusunun iletişim bilgileri ve veri koruma görevlisinin iletişim bilgileri. Kişisel verilerin işlenme amaçları, kişisel verilerin işlenmesinin hukuki dayanağı, kişisel veri alıcılarının kategorileri, kişisel verilerin saklama süresi, ilgili kişinin hakları, kişisel verilerin uluslararası aktarımı, denetim makamına şikayette bulunma hakkı ve otomatik karar verme ve profilleme."],
  ] as const;
  const expectedTopics = new Set([
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ]);

  for (const [locale, textExcerpt] of policies) {
    const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections([{ heading: "Privacy", textExcerpt }]);
    assert.deepEqual(new Set(candidates.map((candidate) => candidate.topic)), expectedTopics, locale);
    assert.equal(candidates.every((candidate) =>
      candidate.matchedLocale === locale &&
      candidate.status === "diagnostic_only" &&
      candidate.productionCredit === false &&
      candidate.classifierProvenance === "gdpr_transparency_topic_classifier.v1"
    ), true, locale);
  }
});

test("policySurfaceScanner fetches long policies and captures all canonical GDPR Transparency topics for the twenty-two expansion locales", async () => {
  const expectedTopics = new Set([
    "controller_contact",
    "dpo_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers",
    "supervisory_authority",
    "automated_decision_making_or_profiling",
  ]);
  const waves = [
    ["policy-gdpr-transparency-long-wave-one", ["pt", "ru", "ja", "zh", "ar", "sv"]],
    ["policy-gdpr-transparency-long-wave-two", ["cs", "el", "hu", "da", "fi"]],
    ["policy-gdpr-transparency-long-wave-three", ["sk", "bg", "hr", "nb", "sl"]],
    ["policy-gdpr-transparency-long-wave-four", ["lt", "lv", "et", "uk", "tr"]],
    ["policy-gdpr-transparency-long-wave-five", ["ro"]],
  ] as const;

  for (const [scenario, expectedPolicies] of waves) {
    await withPolicyScan(scenario, async ({ result, baseUrl }) => {
      for (const locale of expectedPolicies) {
        const normalizedUrl = `${baseUrl}/policies/article13-long-${locale}`;
        const privacy = result.policySurfaceObservations.find((observation) =>
          observation.status === "fetched" &&
          observation.surfaceType === "privacy_policy" &&
          observation.normalizedUrl === normalizedUrl
        );
        assert.ok(privacy, `${locale} long policy should be fetched`);
        assert.deepEqual(
          new Set(privacy.gdprTransparencyTopicCandidates.map((candidate) => candidate.topic)),
          expectedTopics,
          locale,
        );
        assert.equal(privacy.gdprTransparencyTopicCandidates.every((candidate) =>
          candidate.matchedLocale === locale &&
          candidate.status === "diagnostic_only" &&
          candidate.productionCredit === false &&
          candidate.evidenceText.length > 0 &&
          candidate.evidenceText.length <= 360
        ), true, locale);
        const lateTopic = privacy.gdprTransparencyTopicCandidates.find((candidate) =>
          candidate.topic === "automated_decision_making_or_profiling"
        );
        assert.ok(lateTopic, `${locale} should retain the topic placed after the former 40k cutoff`);
      }
    }, { internalBudgetMs: 30_000 });
  }
});

test("policySurfaceScanner retains diagnostic GDPR Transparency candidates from encoded fetched policy text", async () => {
  await withPolicyScan("policy-gdpr-transparency-encoded-it", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/article13-encoded-it`
    );
    assert.ok(privacy, "encoded Italian policy should be fetched");

    const expectedTopics = [
      "controller_contact",
      "processing_purposes",
      "recipients_or_vendor_categories",
    ] as const;
    for (const topic of expectedTopics) {
      const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
      assert.ok(
        candidate,
        `encoded Italian policy should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
      );
      assert.equal(candidate.status, "diagnostic_only");
      assert.equal(candidate.productionCredit, false);
      assert.equal(candidate.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
      assert.equal(candidate.matchedLocale, "it");
      assert.ok(candidate.evidenceText.length <= 640);
    }

    assert.deepEqual(
      privacy.article13DisclosureSignals.filter((signal) => signal.classifierProvenance === "gdpr_transparency_topic_classifier.v1"),
      [],
      "classifier-only encoded candidates must not become Article 13 signals by default",
    );
  });
});

test("policySurfaceScanner decodes declared non-UTF policy charsets before GDPR Transparency classification", async () => {
  await withPolicyScan("policy-gdpr-transparency-latin1-es", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/article13-latin1-es`
    );
    assert.ok(privacy, "Latin-encoded Spanish policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Política de protección de datos personales/);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /\uFFFD/);

    for (const topic of ["controller_contact", "dpo_contact", "processing_purposes", "legal_basis", "supervisory_authority"] as const) {
      const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
      assert.ok(
        candidate,
        `Latin-encoded Spanish policy should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
      );
      assert.equal(candidate.status, "diagnostic_only");
      assert.equal(candidate.productionCredit, false);
      assert.equal(candidate.matchedLocale, "es");
    }
  });
});

test("policySurfaceScanner treats compact Dutch privacy text as usable policy evidence", async () => {
  await withPolicyScan("policy-gdpr-transparency-compact-nl", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy-compact-nl`
    );
    assert.ok(privacy, "compact Dutch privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /omgaat met je persoonsgegevens/i);
    assert.match(privacy.textExcerpt ?? "", /\bAVG\b/);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /^Nieuws over de organisatie Journalistieke verantwoording/);
  });
});

test("policySurfaceScanner follows localized canonical policy links from thin privacy shells", async () => {
  await withPolicyScan("policy-localized-canonical-shell", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/datenschutz-shell`
    );
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.ok(privacy, "localized privacy shell should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Verantwortlicher für die Datenverarbeitung/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /^Datenschutzhinweis FOCUS online Webseite/);
    assert.ok(retainedPolicySurfaceTextRef?.path);

    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /Rechtsgrundlage für die Verarbeitung personenbezogener Daten/i);
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "controller_contact"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner uses rendered document text when direct fetch retains only a thin shell", async () => {
  await withPolicyScan("policy-browser-hydrated-document", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/browser-hydrated-policy/privacy`
    );

    assert.ok(privacy, "browser-hydrated privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Verantwortlicher für die Datenverarbeitung/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /^Datenschutzhinweis FOCUS online Webseite/);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered low-quality text fallback")),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner extracts policy body text from structured article metadata", async () => {
  await withPolicyScan("policy-jsonld-article-body", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/metadata-policy/privacy`
    );
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.ok(privacy, "structured metadata privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Verantwortlicher für die Datenverarbeitung/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /News Politik Sport Kultur Abo Suche/);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /Rechtsgrundlage für die Verarbeitung personenbezogener Daten/i);
    assert.match(retainedPolicySurfaceText, /Beschwerde bei einer Aufsichtsbehörde/i);
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "legal_basis"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner adopts rendered text when it adds canonical GDPR Transparency topics", async () => {
  await withPolicyScan("policy-rendered-article13-better", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/rendered-article13-better/privacy`
    );

    assert.ok(privacy, "rendered French privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /responsable du traitement/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /Centre de confidentialité\. Cette page présente des liens d'aide/i);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered low-quality text fallback")),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "controller_contact"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner retries a substantive but incomplete privacy policy in the rendered lane", async () => {
  await withPolicyScan("policy-rendered-incomplete-substantive", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/rendered-incomplete-substantive/privacy`
    );

    assert.ok(privacy, "the incomplete static privacy policy should remain a fetched surface");
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered low-quality text fallback")),
      true,
      "substantive text below the disclosure-review threshold should receive one bounded rendered retry",
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "dpo_contact"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "supervisory_authority"),
      true,
    );
  });
});

test("policySurfaceScanner uses Medal's rendered policy body and retains all nine GDPR transparency topics", async () => {
  await withPolicyScan("policy-medal-rendered-privacy", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/medal/privacy`
    );
    const topics = new Set(privacy?.gdprTransparencyTopicCandidates.map((candidate) => candidate.topic));

    assert.ok(privacy);
    assert.match(privacy.textExcerpt ?? "", /Medal B\.V\./i);
    assert.deepEqual([...topics].sort(), [
      "controller_contact",
      "data_retention",
      "data_subject_rights",
      "dpo_contact",
      "international_transfers",
      "legal_basis",
      "processing_purposes",
      "recipients_or_vendor_categories",
      "supervisory_authority"
    ]);
  });
});

test("policySurfaceScanner samples late GDPR sections beyond the opening classifier window", async () => {
  await withPolicyScan("policy-late-gdpr-sections", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/late-gdpr-sections/privacy`
    );
    const topics = new Set(privacy?.gdprTransparencyTopicCandidates.map((candidate) => candidate.topic));

    assert.ok(privacy);
    assert.equal(topics.has("controller_contact"), true);
    assert.equal(topics.has("legal_basis"), true);
    assert.equal(topics.has("data_retention"), true);
    assert.equal(topics.has("data_subject_rights"), true);
    assert.equal(topics.has("international_transfers"), true);
    assert.equal(topics.has("dpo_contact"), true);
    assert.equal(topics.has("supervisory_authority"), true);
  });
});

test("policySurfaceScanner follows a rendered dated privacy index and extracts the latest PDF", async () => {
  await withPolicyScan("policy-gdpr-transparency-pdf-nl", async ({ result, baseUrl }) => {
    assert.equal(result.moduleRun.status, "completed", JSON.stringify(result.moduleRun.errors));
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy-reglement-nl.pdf`
    );
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );
    const privacyIndex = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/privacy-index-pdf-nl`
    );

    assert.ok(privacy, "Dutch privacy PDF should be fetched");
    assert.equal(privacyIndex?.documentRole, "policy_index");
    assert.equal(privacy.documentRole, "policy_document");
    assert.equal(privacy.documentFormat, "pdf");
    assert.match(privacy.contentType ?? "", /application\/pdf/i);
    assert.equal(privacy.documentTextCoverage?.status, "complete");
    assert.equal(
      privacy.documentTextCoverage?.retainedTextChars,
      privacy.documentTextCoverage?.sourceTextChars,
    );
    assert.match(privacy.textExcerpt ?? "", /Privacy Reglement/i);
    assert.match(privacy.textExcerpt ?? "", /persoonsgegevens/i);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /functionaris voor gegevensbescherming/i);
    assert.ok(retainedPolicySurfaceText.length <= 256_000);

    for (const topic of ["controller_contact", "dpo_contact", "processing_purposes", "supervisory_authority"] as const) {
      const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
      assert.ok(
        candidate,
        `Dutch privacy PDF should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
      );
      assert.equal(candidate.status, "diagnostic_only");
      assert.equal(candidate.productionCredit, false);
      assert.equal(candidate.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
      assert.equal(candidate.matchedLocale, "nl");
      assert.ok(candidate.evidenceText.length <= 640);
    }

    assert.deepEqual(privacy.article13DisclosureSignals, [], "PDF classifier evidence must not create default Article 13 signals");
    assert.deepEqual(privacy.observedTopics, [], "PDF classifier evidence must not create default observed topics");
    assert.ok(
      privacy.retainedArticle13SectionEvidence.length > 0,
      "PDF sections should retain typed Article 13 evidence for canonical downstream review",
    );
    assert.equal(
      privacy.retainedArticle13SectionEvidence.every((row) => row.evidenceSource === "deterministic"),
      true,
    );
    assert.equal(privacy.traversalDepth, 1);
    assert.equal(privacy.selectionReasonCodes?.includes("latest_dated_privacy_document_link"), true);
  });
});

test("policySurfaceScanner keeps classifier-only TOC navigation and non-policy snippets diagnostic-only", async () => {
  await withPolicyScan("policy-gdpr-transparency-diagnostic-negatives", async ({ result, baseUrl }) => {
    const expectedPolicies = [
      `${baseUrl}/policies/article13-toc-de`,
      `${baseUrl}/policies/article13-nav-fr`,
      `${baseUrl}/policies/article13-support-pl`,
    ];

    for (const url of expectedPolicies) {
      const privacy = result.policySurfaceObservations.find((observation) =>
        observation.status === "fetched" &&
        observation.surfaceType === "privacy_policy" &&
        observation.normalizedUrl === url
      );
      assert.ok(privacy, `${url} should be fetched`);
      assert.equal(privacy.gdprTransparencyTopicCandidates.length > 0, true, `${url} should retain diagnostic candidates`);
      assert.equal(
        privacy.gdprTransparencyTopicCandidates.every((candidate) =>
          candidate.status === "diagnostic_only" &&
          candidate.productionCredit === false &&
          candidate.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
          candidate.evidenceText.length <= 640
        ),
        true,
        `${url} candidates should be bounded diagnostic-only classifier evidence`,
      );
      assert.deepEqual(privacy.article13DisclosureSignals, [], `${url} should not promote classifier-only candidates to Article 13 signals`);
      assert.deepEqual(privacy.observedTopics, [], `${url} should not promote classifier-only candidates to observed topics`);
    }
  });
});

test("policySurfaceScanner treats external terms links as fetchable policy surfaces", () => {
  const baseUrl = "https://www.nbcnews.com/";

  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://www.nbcuniversal.com/terms-of-service",
      "terms",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://www.nbcuniversal.com/privacy",
      "privacy_policy",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://polityka-prywatnosci.onet.pl/index.html",
      "privacy_policy",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://static.lefigaro.fr/confidentialite",
      "privacy_policy",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl: "https://www.antena3.com/",
      href: "https://statics.atresmedia.com/sites/assets/legal/proteccion.html",
      normalizedUrl: "https://statics.atresmedia.com/sites/assets/legal/proteccion.html",
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "Política de privacidad",
    }),
    true,
    "direct localized policy labels should keep static external legal assets fetchable",
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://www.nbcuniversal.com/about",
      "terms",
    ),
    false,
  );
});

test("reviewed privacy-policy misses remain discoverable across retained URL and locale shapes", () => {
  const reviewedMisses = [
    ["https://meshy.ai/", "https://www.meshy.ai/privacy-policy", "Privacy Policy"],
    ["https://mobiauto.com.br/", "https://www.mobiauto.com.br/institucional/privacidade", "Política de Privacidade"],
    ["https://userpilot.io/", "https://userpilot.com/privacy-policy/", "Privacy Policy"],
    ["https://nordea.com/", "https://www.nordea.com/en/privacy-policy", "Privacy Policy"],
    ["https://usabilla.com/", "https://www.surveymonkey.com/mp/legal/privacy/", "Privacy Policy"],
    ["https://500px.com/", "https://500px.com/privacy-policy", "Privacy Policy"],
    ["https://supermicro.com/", "https://www.supermicro.com/en/about/policies/privacy", "Privacy Policy"],
    ["https://indiewire.com/", "https://www.pmc.com/privacy-policy", "Privacy Policy"],
    ["https://adp.com/", "https://www.adp.com/about-adp/data-privacy.aspx", "Privacy Policy"],
    ["https://mercadopago.com.br/", "https://www.mercadopago.com.br/privacidade/declaracao-privacidade", "Declaração de Privacidade"],
    ["https://ambafrance.org/", "https://www.diplomatie.gouv.fr/fr/donnees-personnelles-et-cookies", "Données personnelles et cookies"],
    ["https://medpagetoday.com/", "https://www.medpagetoday.com/about/privacy", "Privacy Policy"],
    ["https://dal.ca/", "https://www.dal.ca/privacy.html", "Privacy Statement"],
    ["https://monotaro.com/", "https://www.monotaro.com/main/prvplc/", "プライバシーポリシー"],
    ["https://siemens.de/", "https://www.siemens.com/en-us/privacy-notice/", "Privacy Notice"],
    ["https://dable.io/", "https://dable.io/privacy-policy", "Privacy Policy"],
    ["https://whatsapp.com/", "https://www.whatsapp.com/legal/", "Privacy Policy"],
  ] as const;

  for (const [baseUrl, policyUrl, linkText] of reviewedMisses) {
    const classification = classifyPrivacySurface({ linkText, url: policyUrl });
    assert.equal(classification.surfaceType, "privacy_policy", `${baseUrl} should classify ${linkText}`);
    assert.equal(
      isFetchablePolicyCandidateForPolicySurface({
        baseUrl,
        href: policyUrl,
        normalizedUrl: policyUrl,
        surfaceType: classification.surfaceType,
        matchStrength: classification.matchStrength,
        linkText,
      }),
      true,
      `${baseUrl} should retain ${policyUrl} as a fetchable policy candidate`,
    );
  }
});

test("policySurfaceScanner treats external localized policy hash links as fetchable", () => {
  const baseUrl = "https://www.se.pl/";
  const href = "https://rodo.grupazpr.pl/#time-polityka-prywatnosci-cookies";
  const normalizedUrl = "https://rodo.grupazpr.pl/";

  assert.equal(
    isFetchablePolicyUrlForPolicySurface(baseUrl, normalizedUrl, "privacy_policy"),
    false,
    "normalized URL alone loses the privacy signal in the fragment",
  );
  assert.equal(
    isFetchablePolicyHrefForPolicySurface(baseUrl, href, normalizedUrl, "privacy_policy"),
    true,
    "original href fragment should preserve localized privacy/cookie evidence for fetchability",
  );
});

test("policySurfaceScanner treats encoded same-origin .htm privacy links as fetchable", () => {
  const baseUrl = "https://www.wordreference.com/";
  const href = "/english/Privacy%20Policy.htm";
  const normalizedUrl = "https://www.wordreference.com/english/Privacy%20Policy.htm";

  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "Privacy Policy",
    }),
    true,
  );
});

test("policySurfaceScanner treats direct localized policy labels as fetchable for opaque external URLs", () => {
  const baseUrl = "https://www.gazeta.pl/";
  const href = "https://pomoc.gazeta.pl/pomoc/7,192131,30837106,zgody-2.html#e=AFootLink#s=StLinks";
  const normalizedUrl = "https://pomoc.gazeta.pl/pomoc/7,192131,30837106,zgody-2.html";

  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "Polityka Prywatności",
    }),
    true,
  );
  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "equivalent",
      linkText: "Prywatność",
    }),
    false,
  );
  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "https://pomoc.gazeta.pl/pomoc/7,192131,30837106,zgody-2.html",
    }),
    false,
  );
});

test("policySurfaceScanner anchors bounded excerpts on high-value detected policy topics", async () => {
  await withPolicyScan("policy-gpc-disclosure-late", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.observedTopics.includes("global_privacy_control"), true);
    assert.match(privacy?.textExcerpt ?? "", /Global Privacy Control/);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
  });
});

test("policySurfaceScanner discovers delayed and accessible-attribute policy links", async () => {
  for (const page of ["policy-footer-privacy-delayed", "policy-link-aria-title"] as const) {
    await withPolicyScan(page, async ({ result, baseUrl }) => {
      const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

      assert.equal(privacy?.status, "fetched");
      assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
      assert.equal(privacy?.fetchable, true);
    });
  }
});

test("policySurfaceScanner discovers late-rendered localized privacy policy links", async () => {
  await withPolicyScan("policy-late-rendered-pl-privacy-links", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const cookie = observedSurface(result.policySurfaceObservations, "cookie_policy");
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const privacySummary = diagnostics.candidateSummary.find((candidate) =>
      candidate.normalizedUrl === `${baseUrl}/policies/privacy`
    );
    const cookieSummary = diagnostics.candidateSummary.find((candidate) =>
      candidate.normalizedUrl === `${baseUrl}/policies/cookies`
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.equal(privacy?.discoveryMethod, "nano_assisted_link_classification");
    assert.equal(cookie?.status, "fetched");
    assert.equal(cookie?.normalizedUrl, `${baseUrl}/policies/cookies`);
    assert.equal(privacySummary?.linkText, "Polityka Prywatności Gazeta.pl");
    assert.equal(privacySummary?.matchedLocale, "pl");
    assert.equal(privacySummary?.surfaceType, "privacy_policy");
    assert.equal(privacySummary?.classifierProvenance, "privacy_surface_classifier.v1");
    assert.equal(cookieSummary?.linkText, "Cookie Policy");
    assert.equal(cookieSummary?.fetchable, true);
    assert.equal(cookieSummary?.surfaceType, "cookie_policy");
  }, {
    internalBudgetMs: 8_000,
  });
});

test("policySurfaceScanner sends delayed global footer links to Nano before common-path fallback", async () => {
  const classifiedBatches: string[][] = [];
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifiedBatches.push(input.candidates.map((candidate) =>
        `${candidate.discoveryMethod}:${candidate.normalizedUrl}`,
      ));
      const rankedCandidates = input.candidates
        .filter((candidate) =>
          candidate.discoveryMethod !== "guessed_common_path" &&
          candidate.deterministicSurfaceType !== "unknown",
        )
        .map((candidate, index) => ({
          candidateId: candidate.candidateId,
          likelySurfaceType: candidate.deterministicSurfaceType,
          shouldFetch: true,
          priorityRank: index + 1,
          confidence: 0.9,
          reason: "Mock Nano selected hydrated global footer link.",
        }));
      return { assistId: input.assistId, rankedCandidates };
    },
  };

  await withPolicyScan("policy-global-footer-delayed", async ({ result, baseUrl }) => {
    const firstBatch = classifiedBatches[0] ?? [];

    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/policies/privacy`)), true);
    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/policies/cookies`)), true);
    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/privacy-center`)), true);
    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/do-not-sell-or-share`)), true);
    assert.equal(firstBatch.some((entry) => entry.startsWith("guessed_common_path:")), false);
    assert.equal(observedSurface(result.policySurfaceObservations, "privacy_policy")?.status, "fetched");
    assert.equal(observedSurface(result.policySurfaceObservations, "cookie_policy")?.status, "fetched");
    assert.equal(observedSurface(result.policySurfaceObservations, "consent_preferences")?.status, "observed");
    assert.equal(observedSurface(result.policySurfaceObservations, "do_not_sell_or_share")?.status, "fetched");
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner retains secondary CCPA and GPC policy surfaces when Nano only ranks privacy policy", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const privacy = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/policies/webmd-like-privacy"),
      );
      return {
        assistId: input.assistId,
        rankedCandidates: privacy
          ? [{
            candidateId: privacy.candidateId,
            likelySurfaceType: "privacy_policy",
            shouldFetch: true,
            priorityRank: 1,
            confidence: 0.94,
            reason: "Mock Nano under-selected the primary privacy policy only.",
          }]
          : [],
      };
    },
  };

  await withPolicyScan("policy-webmd-like-secondary-surfaces", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/webmd-like-privacy` &&
      observation.status === "fetched"
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/webmd-like-cookie-policy` &&
      observation.surfaceType === "cookie_policy" &&
      observation.status === "fetched"
    );
    const statePrivacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/webmd-like-state-privacy` &&
      observation.surfaceType === "california_notice" &&
      observation.status === "fetched"
    );

    assert.ok(privacy);
    assert.ok(cookie);
    assert.ok(statePrivacy);
    assert.equal(statePrivacy.observedTopics.includes("notice_at_collection"), true);
    assert.equal(statePrivacy.observedTopics.includes("global_privacy_control"), true);
    assert.equal(statePrivacy.observedTopics.includes("do_not_sell_or_share"), true);
    assert.match(statePrivacy.textExcerpt ?? "", /Information we collect|opt-out preference signal/);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner retains footer terms as a secondary policy surface alongside privacy links", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const privacy = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/privacy-policy"),
      );
      return {
        assistId: input.assistId,
        rankedCandidates: privacy
          ? [{
            candidateId: privacy.candidateId,
            likelySurfaceType: "privacy_policy",
            shouldFetch: true,
            priorityRank: 1,
            confidence: 0.94,
            reason: "Mock Nano under-selected the primary privacy policy only.",
          }]
          : [],
      };
    },
  };

  await withPolicyScan("policy-latimes-footer-surfaces", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/privacy-policy` &&
      observation.surfaceType === "privacy_policy" &&
      observation.status === "fetched"
    );
    const terms = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/terms` &&
      observation.surfaceType === "terms" &&
      observation.status === "fetched"
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.ok(terms);
    assert.equal(diagnostics.candidateSummary.some((candidate) =>
      candidate.surfaceType === "terms" &&
      candidate.normalizedUrl === `${baseUrl}/terms`
    ), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner retains localized privacy policies as high-value supplements when Nano ranks secondary surfaces", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const secondary = input.candidates.filter((candidate) =>
        candidate.normalizedUrl.endsWith("/politica-de-cookies") ||
        candidate.normalizedUrl.endsWith("/terms")
      );
      return {
        assistId: input.assistId,
        rankedCandidates: secondary.map((candidate, index) => ({
          candidateId: candidate.candidateId,
          likelySurfaceType: candidate.deterministicSurfaceType,
          shouldFetch: true,
          priorityRank: index + 1,
          confidence: 0.9,
          reason: "Mock Nano selected secondary localized policy links only.",
        })),
      };
    },
  };

  await withPolicyScan("policy-localized-privacy-supplement", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/politica-de-privacidad` &&
      observation.surfaceType === "privacy_policy" &&
      observation.status === "fetched"
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/politica-de-cookies` &&
      observation.surfaceType === "cookie_policy" &&
      observation.status === "fetched"
    );
    const terms = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/terms` &&
      observation.surfaceType === "terms" &&
      observation.status === "fetched"
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.ok(cookie);
    assert.ok(terms);
    assert.equal(diagnostics.candidateSummary.some((candidate) =>
      candidate.normalizedUrl === `${baseUrl}/politica-de-privacidad` &&
      candidate.surfaceType === "privacy_policy" &&
      candidate.matchedLocale === "es" &&
      candidate.matchStrength === "direct"
    ), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner records preference center controls as observation-only", async () => {
  await withPolicyScan("policy-cmp-preference-control", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");

    assert.equal(settings?.status, "observed");
    assert.equal(settings?.selector, "#ot-sdk-btn");
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-cmp-preference-control`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, true);
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(settings?.evidenceRefs.length, 0);
  });
});

test("policySurfaceScanner records footer Manage Cookies+ controls as cookie settings", async () => {
  await withPolicyScan("policy-manage-cookies-footer-control", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");

    assert.equal(settings?.status, "observed");
    assert.match(settings?.linkText ?? "", /Manage Cookies\+/);
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-manage-cookies-footer-control`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, true);
    assert.equal(settings?.mayLeadToConsentControls, true);
  });
});

test("policySurfaceScanner records placeholder footer Manage Cookies anchors as cookie settings", async () => {
  await withPolicyScan("policy-manage-cookies-footer-anchor", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(settings?.status, "observed");
    assert.match(settings?.linkText ?? "", /Manage Cookies/);
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-manage-cookies-footer-anchor`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, true);
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.surfaceType === "cookie_settings" &&
        /Manage Cookies/.test(candidate.linkText) &&
        candidate.observationOnly === true
      ),
      true,
    );
  });
});

test("policySurfaceScanner records embedded consent config Manage Cookies labels as cookie settings", async () => {
  await withPolicyScan("policy-manage-cookies-embedded-config", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(settings?.status, "observed");
    assert.match(settings?.linkText ?? "", /Manage Cookies\+/);
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-manage-cookies-embedded-config`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, false);
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.surfaceType === "cookie_settings" &&
        /Manage Cookies\+/.test(candidate.linkText) &&
        candidate.observationOnly === true
      ),
      true,
    );
  }, { discoveryMode: "fast" });
});

test("policySurfaceScanner records privacy center links without clicking preference flows", async () => {
  await withPolicyScan("policy-privacy-center-link", async ({ result, baseUrl }) => {
    const center = observedSurface(result.policySurfaceObservations, "consent_preferences");

    assert.equal(center?.status, "observed");
    assert.equal(center?.normalizedUrl, `${baseUrl}/privacy-center`);
    assert.equal(center?.fetchable, true);
    assert.equal(center?.clickable, true);
    assert.equal(center?.mayLeadToConsentControls, true);
  });
});

test("policySurfaceScanner uses common-path fallback when no homepage policy links exist", async () => {
  await withPolicyScan("policy-no-links", async ({ result, baseUrl }) => {
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.discoveryMethod === "guessed_common_path" &&
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`,
    );

    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
  });
});

test("policySurfaceScanner freshly validates a bounded prior policy seed when homepage discovery has no links", async () => {
  await withPolicyScan("policy-no-links", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.equal(privacy?.status, "fetched");
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    assert.equal(diagnostics.corePolicySurfaceRetained, true);
  }, {
    policySurfaceSeeds: [{
      confidence: 0.9,
      hintType: "privacy_policy",
      source: "prior_scan_hint",
      url: "/policies/privacy",
    }],
  });
});

test("policySurfaceScanner fetches an observed privacy link before unverified common-path seeds", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy`
    );

    assert.equal(privacy?.status, "fetched");
    assert.notEqual(privacy?.discoveryMethod, "guessed_common_path");
  }, {
    discoveryMode: "fast",
    policySurfaceSeeds: [
      { confidence: 0.7, hintType: "privacy_policy", source: "canonical_legal_surface_hint", url: "/privacy-notice" },
      { confidence: 0.7, hintType: "privacy_policy", source: "canonical_legal_surface_hint", url: "/privacy-policy" },
      { confidence: 0.7, hintType: "privacy_policy", source: "canonical_legal_surface_hint", url: "/legal/privacy" },
      { confidence: 0.7, hintType: "privacy_policy", source: "canonical_legal_surface_hint", url: "/privacy" },
    ],
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not be needed when a direct observed privacy link is available.");
      },
    },
  });
});

test("policySurfaceScanner uses common-path fallback when homepage fetch fails", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const targetUrl = `${server.baseUrl}/blocked-homepage?secret-token=must-not-be-retained`;
    const result = await policySurfaceScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/privacy`
    );

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
    assert.equal(result.moduleRun.errors.length, 0);
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    assert.equal(diagnostics.artifactVersion, "policy_surface_capture_diagnostics.v2");
    assert.equal(diagnostics.homepageFetch?.ok, false);
    assert.equal(diagnostics.homepageFetch?.httpStatus, 404);
    assert.equal(diagnostics.homepageFetch?.failureReason, "http_error");
    assert.doesNotMatch(JSON.stringify(diagnostics.homepageFetch), /secret-token|must-not-be-retained/);
    assert.equal(
      diagnostics.failedFetches.some((failure) =>
        failure.stage === "homepage" &&
        failure.httpStatus === 404 &&
        failure.failureReason === "http_error"
      ),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner keeps failed guessed paths coverage-limited after homepage failure", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><h1>Not found</h1></body></html>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const targetUrl = `http://127.0.0.1:${address.port}/missing-homepage`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-failed-guesses-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });

    assert.equal(result.moduleRun.status, "partial");
    assert.equal(
      result.policySurfaceObservations.some((observation) =>
        observation.status === "observed" ||
        observation.status === "fetched" ||
        observation.linkObservationState === "observed"
      ),
      false,
    );
    assert.match(result.moduleRun.errors.join(" "), /only failed or skipped candidates/i);
  } finally {
    server.close();
    await once(server, "close");
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner bounds a Ford-like stalled homepage fetch and continues rendered discovery", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const startedAt = Date.now();
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/stalled-policy-homepage`,
      normalizedUrl: `${server.baseUrl}/stalled-policy-homepage`,
      scanStartedAtMs: startedAt,
      internalBudgetMs: 10_000,
      artifactWriter,
      discoveryMode: "fast",
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const elapsedMs = Date.now() - startedAt;
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const homepageTiming = result.moduleRun.timingBreakdown?.find((timing) => timing.label === "homepage fetch");
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${server.baseUrl}/stalled-policy-homepage/privacy`
    );

    assert.equal(POLICY_HOMEPAGE_FETCH_TIMEOUT_MS, 5_000);
    assert.ok((homepageTiming?.durationMs ?? 0) >= 4_500);
    assert.ok((homepageTiming?.durationMs ?? Infinity) < 6_500);
    assert.ok(elapsedMs < 12_000, `expected bounded fallback completion; elapsed=${elapsedMs}`);
    assert.equal(diagnostics.homepageFetch?.failureReason, "timeout");
    assert.equal(diagnostics.homepageFetch?.ok, false);
    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.surfaceType, "privacy_policy");
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner keeps core common paths when Nano ranks only secondary controls after homepage failure", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  let commonPathRanked = false;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const secondary = input.candidates
        .filter((candidate) =>
          candidate.discoveryMethod === "guessed_common_path" &&
          (candidate.normalizedUrl.endsWith("/privacy-choices") || candidate.normalizedUrl.endsWith("/cookie-settings"))
        )
        .slice(0, 2);
      if (secondary.length > 0) {
        commonPathRanked = true;
      }
      return {
        assistId: input.assistId,
        rankedCandidates: secondary.map((candidate, index) => ({
          candidateId: candidate.candidateId,
          likelySurfaceType: candidate.normalizedUrl.endsWith("/cookie-settings")
            ? "cookie_settings"
            : "your_privacy_choices",
          shouldFetch: true,
          priorityRank: index + 1,
          confidence: 0.92,
          reason: "Mock Nano ranked secondary consent controls before core policy paths.",
        })),
      };
    },
  };

  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/blocked-homepage`,
      normalizedUrl: `${server.baseUrl}/blocked-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider,
    });

    const fetchedCorePolicy = result.policySurfaceObservations
      .filter((observation) => observation.status === "fetched")
      .some((observation) =>
        observation.surfaceType === "privacy_policy" &&
        observation.discoveryMethod === "guessed_common_path"
      );

    assert.equal(commonPathRanked, true);
    assert.equal(fetchedCorePolicy, true);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner uses rendered footer links before common-path fallback when homepage fetch is blocked", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const defaultNanoProvider = createDefaultMockNanoPolicyAssistProvider();
    const classificationOrder: string[] = [];
    const nanoAssistProvider: PolicyNanoAssistProvider = {
      async classifyLinks(input) {
        classificationOrder.push(input.candidates.every((candidate) => candidate.discoveryMethod === "guessed_common_path")
          ? "common_path"
          : "rendered");
        return defaultNanoProvider.classifyLinks!(input);
      },
    };
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/browser-visible-policy-homepage`,
      normalizedUrl: `${server.baseUrl}/browser-visible-policy-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 7_000,
      artifactWriter,
      nanoAssistProvider,
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/browser-visible-policy-homepage/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(privacy);
    assert.equal(privacy.surfaceType, "privacy_policy");
    assert.equal(diagnostics.renderedCandidateCount > 0, true);
    assert.equal(diagnostics.commonPathFallbackUsed, false);
    assert.equal(classificationOrder[0], "common_path");
    assert.equal(classificationOrder.includes("rendered"), true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.normalizedUrl === `${server.baseUrl}/browser-visible-policy-homepage/privacy`
      ),
      true,
    );
    assert.equal(privacy.httpStatus, 200);
    assert.equal(privacy.observedTopics.includes("data_retention"), true);
    assert.equal(
      diagnostics.failedFetches.some((failure) =>
        failure.stage === "candidate_direct" &&
        failure.httpStatus === 503 &&
        failure.failureReason === "http_error"
      ),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed rendered discovery")),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered fetch fallback")),
      true,
    );
    assert.equal(diagnostics.funnel.renderedRecoveryAttempts >= 1, true);
    assert.equal(diagnostics.funnel.renderedRecoverySuccesses >= 1, true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner uses rendered policy document fallback when direct policy fetch times out", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/browser-timeout-policy-homepage`,
      normalizedUrl: `${server.baseUrl}/browser-timeout-policy-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 12_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/browser-timeout-policy-homepage/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.equal(privacy.surfaceType, "privacy_policy");
    assert.equal(privacy.httpStatus, 200);
    assert.match(privacy.textExcerpt ?? "", /controller for this service/i);
    assert.equal(
      diagnostics.failedFetches.some((failure) =>
        failure.stage === "candidate_direct" &&
        failure.failureReason === "timeout" &&
        failure.candidateUrl === `${server.baseUrl}/browser-timeout-policy-homepage/privacy`
      ),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered fetch fallback")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner falls back to common paths when Nano declines observed generic links", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      const fallback = input.candidates.find((candidate) =>
        candidate.discoveryMethod === "guessed_common_path" &&
        candidate.normalizedUrl.endsWith("/privacy"),
      );
      if (!fallback) {
        return { assistId: input.assistId, rankedCandidates: [] };
      }
      return {
        assistId: input.assistId,
        rankedCandidates: [{
          candidateId: fallback.candidateId,
          likelySurfaceType: "privacy_policy",
          shouldFetch: true,
          priorityRank: 1,
          confidence: 0.94,
          reason: "Fallback common privacy path after generic observed links were declined.",
        }],
      };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`,
    );

    assert.equal(classifyCalls, 2);
    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner does not let Nano upgrade generic links without direct policy evidence", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      const generic = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/products")
      );
      if (generic) {
        return {
          assistId: input.assistId,
          rankedCandidates: [{
            candidateId: generic.candidateId,
            likelySurfaceType: "privacy_policy",
            shouldFetch: true,
            priorityRank: 1,
            confidence: 0.96,
            reason: "Mock Nano incorrectly upgraded a generic product link.",
          }],
        };
      }

      const fallback = input.candidates.find((candidate) =>
        candidate.discoveryMethod === "guessed_common_path" &&
        candidate.normalizedUrl.endsWith("/privacy"),
      );
      return {
        assistId: input.assistId,
        rankedCandidates: fallback
          ? [{
              candidateId: fallback.candidateId,
              likelySurfaceType: "privacy_policy",
              shouldFetch: true,
              priorityRank: 1,
              confidence: 0.94,
              reason: "Fallback common privacy path after generic observed links were rejected.",
            }]
          : [],
      };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const genericUpgrade = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/products` &&
      observation.surfaceType === "privacy_policy"
    );
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy` &&
      observation.surfaceType === "privacy_policy"
    );

    assert.equal(classifyCalls, 2);
    assert.equal(genericUpgrade, undefined);
    assert.ok(fallback);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner ignores external powered-by attribution links as policy surfaces", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      return {
        assistId: input.assistId,
        rankedCandidates: input.candidates
          .filter((candidate) => candidate.deterministicSurfaceType !== "unknown")
          .map((candidate, index) => ({
            candidateId: candidate.candidateId,
            likelySurfaceType: candidate.deterministicSurfaceType,
            shouldFetch: true,
            priorityRank: index + 1,
            confidence: Math.max(0.8, candidate.deterministicScore),
            reason: "Rank deterministic policy candidates.",
          })),
      };
    },
  };

  await withPolicyScan("policy-powered-by-attribution", async ({ result, baseUrl }) => {
    const attribution = result.policySurfaceObservations.find((observation) =>
      (observation.normalizedUrl ?? observation.url).includes("onetrust.com/products/cookie-consent")
    );
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy`
    );

    assert.equal(attribution, undefined);
    assert.ok(privacy);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner does not follow third-party privacy policy links from fetched policy pages", async () => {
  await withPolicyScan("policy-secondary-third-party-links", async ({ result, baseUrl }) => {
    const firstPartyCookie = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "cookie_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/cookies`
    );
    const thirdPartyPolicies = result.policySurfaceObservations.filter((observation) =>
      /facebook\.com\/privacy|linkedin\.com\/legal\/privacy-policy/i.test(observation.normalizedUrl ?? observation.url)
    );

    assert.ok(firstPartyCookie);
    assert.deepEqual(thirdPartyPolicies, []);
  }, { enableNanoPolicyAssist: true, internalBudgetMs: 8_000 });
});

test("policySurfaceScanner ignores external URL-only body privacy links as policy surfaces", async () => {
  await withPolicyScan("policy-homepage-external-url-only-policy-links", async ({ result, baseUrl }) => {
    const firstPartyPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy`
    );
    const rawExternalPolicies = result.policySurfaceObservations.filter((observation) =>
      /facebook\.com\/privacy|linkedin\.com\/legal\/privacy-policy/i.test(observation.normalizedUrl ?? observation.url)
    );

    assert.ok(firstPartyPrivacy);
    assert.deepEqual(rawExternalPolicies, []);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner keeps deterministic common paths when speculative Nano common-path ranking is poor", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      if (input.candidates.some((candidate) => candidate.discoveryMethod !== "guessed_common_path")) {
        return { assistId: input.assistId, rankedCandidates: [] };
      }
      const badCandidate = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/privacy-choices")
      );
      return {
        assistId: input.assistId,
        rankedCandidates: badCandidate
          ? [{
              candidateId: badCandidate.candidateId,
              likelySurfaceType: "privacy_policy",
              shouldFetch: true,
              priorityRank: 1,
              confidence: 0.91,
              reason: "Mock Nano over-prioritized a less reliable common path.",
            }]
          : []
      };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const retained = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(classifyCalls, 2);
    assert.ok(retained);
    assert.equal(retained.surfaceType, "privacy_policy");
    assert.equal(diagnostics.corePolicySurfaceRetained, true);
    assert.equal(diagnostics.commonPathFallbackUsed, true);
  }, { discoveryMode: "fast", enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner keeps core common paths when observed links are declined and Nano ranks secondary common paths", async () => {
  let commonPathRanked = false;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      if (input.candidates.some((candidate) => candidate.discoveryMethod !== "guessed_common_path")) {
        return { assistId: input.assistId, rankedCandidates: [] };
      }
      const secondary = input.candidates
        .filter((candidate) =>
          candidate.deterministicSurfaceType === "your_privacy_choices" ||
          candidate.deterministicSurfaceType === "cookie_settings"
        )
        .slice(0, 2);
      if (secondary.length > 0) {
        commonPathRanked = true;
      }
      return {
        assistId: input.assistId,
        rankedCandidates: secondary.map((candidate, index) => ({
          candidateId: candidate.candidateId,
          likelySurfaceType: candidate.deterministicSurfaceType,
          shouldFetch: true,
          priorityRank: index + 1,
          confidence: 0.91,
          reason: "Mock Nano ranked secondary common paths before core policy paths.",
        })),
      };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result }) => {
    const fetchedCorePolicy = result.policySurfaceObservations
      .filter((observation) => observation.status === "fetched")
      .some((observation) =>
        observation.surfaceType === "privacy_policy" &&
        observation.discoveryMethod === "guessed_common_path"
      );

    assert.equal(commonPathRanked, true);
    assert.equal(fetchedCorePolicy, true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner gold corpus retains core GDPR policy surfaces through bounded fallback", async () => {
  const cases = [
    {
      page: "policy-gold-ford-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-notice",
    },
    {
      page: "policy-gold-ikea-common-path",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/legal/privacy-cookie-statement",
    },
    {
      page: "policy-gold-nvidia-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-policy",
    },
    {
      page: "policy-gold-latimes-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-policy",
    },
    {
      page: "policy-gold-caltech-common-path",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-notice",
    },
  ] as const;

  for (const fixture of cases) {
    await withPolicyScan(fixture.page, async ({ result, baseUrl }) => {
      const fallbackObservations = result.policySurfaceObservations.filter((observation) =>
        observation.discoveryMethod === "guessed_common_path"
      );
      const retained = result.policySurfaceObservations.find((observation) =>
        observation.status === "fetched" &&
        observation.surfaceType === fixture.expectedSurfaceType &&
        observation.normalizedUrl === `${baseUrl}${fixture.expectedPath}`
      );

      assert.ok(retained, `${fixture.page} should retain ${fixture.expectedPath}`);
      assert.ok((retained.textExcerpt?.length ?? 0) > 80, `${fixture.page} should retain usable policy text`);
      assert.ok(fallbackObservations.length <= 18, `${fixture.page} should keep common-path fallback bounded`);
      const diagnostics = await readPolicyCaptureDiagnostics(result);
      assert.equal(diagnostics.corePolicySurfaceRetained, true);
      assert.equal(diagnostics.commonPathFallbackUsed, true);
      assert.ok(diagnostics.coreSurfaceTypes.includes(fixture.expectedSurfaceType));
      assert.ok(diagnostics.observedCandidateCount >= 1);
      assert.ok(diagnostics.fetchedCount >= 1);
      assert.ok(diagnostics.policyCaptureDurationMs >= 0);
    });
  }
});

test("policySurfaceScanner retains IKEA privacy-cookie statement as both privacy and cookie surfaces", async () => {
  await withPolicyScan("policy-gold-ikea-common-path", async ({ result, baseUrl }) => {
    const expectedUrl = `${baseUrl}/legal/privacy-cookie-statement`;
    const retainedTypes = new Set(result.policySurfaceObservations
      .filter((observation) =>
        observation.status === "fetched" &&
        observation.normalizedUrl === expectedUrl
      )
      .map((observation) => observation.surfaceType));

    assert.equal(retainedTypes.has("privacy_policy"), true);
    assert.equal(retainedTypes.has("cookie_policy"), true);
  });
});

test("policySurfaceScanner common-path fallback excludes site-specific brand paths", async () => {
  await withPolicyScan("policy-no-links", async ({ result }) => {
    const commonPathUrls = result.policySurfaceObservations
      .filter((observation) => observation.discoveryMethod === "guessed_common_path")
      .map((observation) => observation.normalizedUrl ?? observation.url);

    assert.ok(commonPathUrls.length > 0);
    assert.equal(commonPathUrls.some((url) => /about-nvidia|customer-service\/privacy-policy|global\/en\/customer-service/.test(url)), false);
    assert.equal(commonPathUrls.some((url) => /\/privacy(?:-policy|-notice)?\/?$/.test(new URL(url).pathname)), true);
  });
});

test("policySurfaceScanner does not let secondary-only surfaces satisfy core GDPR policy availability", async () => {
  await withPolicyScan("policy-gold-latimes-secondary-only", async ({ result }) => {
    const fetchedBeforeFallback = result.policySurfaceObservations.filter((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod !== "guessed_common_path" &&
      observation.directVsInferred !== "mixed"
    );
    const secondaryOnlyTypes = new Set(fetchedBeforeFallback.map((observation) => observation.surfaceType));
    const fallbackPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod === "guessed_common_path" &&
      observation.surfaceType === "privacy_policy"
    );

    assert.equal(secondaryOnlyTypes.has("privacy_policy"), false);
    assert.ok(fallbackPrivacy);
  });
});

test("policySurfaceScanner keeps no-locale common-path fallback bounded to core plus datenschutz", async () => {
  await withPolicyScan("policy-no-links", async ({ result, baseUrl }) => {
    const fetchedPrivacyPaths = new Set(result.policySurfaceObservations
      .filter((observation) =>
        observation.discoveryMethod === "guessed_common_path" &&
        observation.status === "fetched" &&
        observation.surfaceType === "privacy_policy"
      )
      .map((observation) => observation.normalizedUrl));

    assert.equal(fetchedPrivacyPaths.has(`${baseUrl}/datenschutz`), true);
    for (const excludedPath of ["/politica-de-privacidad", "/informativa-privacy", "/privacybeleid"]) {
      assert.equal(fetchedPrivacyPaths.has(`${baseUrl}${excludedPath}`), false, excludedPath);
    }
  });
});

test("policySurfaceScanner adds localized common paths only for the detected locale", async () => {
  await withPolicyScan("policy-no-links-es", async ({ result, baseUrl }) => {
    const fetchedUrls = new Set(result.policySurfaceObservations
      .filter((observation) => observation.discoveryMethod === "guessed_common_path")
      .map((observation) => observation.normalizedUrl));
    assert.equal(fetchedUrls.has(`${baseUrl}/politica-de-privacidad`), true);
    assert.equal(fetchedUrls.has(`${baseUrl}/informativa-privacy`), false);
    assert.equal(fetchedUrls.has(`${baseUrl}/privacybeleid`), false);
  });
});

test("policySurfaceScanner retains visible terms links across policy gold corpus", async () => {
  const cases = [
    ["policy-gold-caltech-common-path", ["/terms"]],
    ["policy-gold-ford-secondary-only", ["/terms"]],
    ["policy-gold-ikea-common-path", ["/terms"]],
    ["policy-gold-latimes-secondary-only", ["/gift-subscription-terms", "/subscriber-terms-and-conditions"]],
    ["policy-latimes-footer-surfaces", ["/terms"]],
  ] as const;

  for (const [page, expectedPaths] of cases) {
    await withPolicyScan(page, async ({ result, baseUrl }) => {
      const retainedTermsUrls = new Set(result.policySurfaceObservations
        .filter((observation) =>
          observation.surfaceType === "terms" &&
          observation.status === "fetched"
        )
        .map((observation) => observation.normalizedUrl));

      for (const expectedPath of expectedPaths) {
        assert.equal(
          retainedTermsUrls.has(`${baseUrl}${expectedPath}`),
          true,
          `${page} should retain ${expectedPath} as a terms surface`,
        );
      }
    });
  }
});

test("policySurfaceScanner dedupes slash variants per surface before applying common-path fallback cap", async () => {
  await withPolicyScan("policy-gold-ford-secondary-only", async ({ result, baseUrl }) => {
    const commonPathObservations = result.policySurfaceObservations
      .filter((observation) => observation.discoveryMethod === "guessed_common_path")
    const commonPathUrls = commonPathObservations
      .map((observation) => observation.normalizedUrl ?? observation.url);

    assert.ok(commonPathUrls.length <= 18);
    assert.equal(commonPathUrls.includes(`${baseUrl}/privacy-notice`), true);
    assert.equal(commonPathUrls.includes(`${baseUrl}/help/privacy/`), false);
    assert.equal(
      new Set(commonPathObservations.map((observation) =>
        `${observation.surfaceType}:${(observation.normalizedUrl ?? observation.url).replace(/\/$/, "")}`
      )).size,
      commonPathObservations.length,
      "expected common-path observations to be slash-normalized within each typed surface",
    );
  });
});

test("policySurfaceScanner preserves failed policy link attempts without marking them observed", async () => {
  await withPolicyScan("policy-broken-link", async ({ result }) => {
    const broken = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl?.endsWith("/policies/missing-privacy"),
    );

    assert.equal(broken?.status, "failed");
    assert.equal(broken?.httpStatus, 404);
    assert.equal(broken?.evidenceRefs.length, 0);
  });
});

test("policy surface fetch fallback only maps apex HTTPS URLs to same-site www URLs", () => {
  assert.equal(
    wwwFallbackUrlForPolicyFetch("https://caltech.edu/privacy-notice"),
    "https://www.caltech.edu/privacy-notice",
  );
  assert.equal(
    wwwFallbackUrlForPolicyFetch("https://caltech.edu/privacy-notice?source=footer#rights"),
    "https://www.caltech.edu/privacy-notice?source=footer#rights",
  );
  assert.equal(wwwFallbackUrlForPolicyFetch("https://www.caltech.edu/privacy-notice"), null);
  assert.equal(wwwFallbackUrlForPolicyFetch("https://privacy.caltech.edu/notice"), null);
  assert.equal(wwwFallbackUrlForPolicyFetch("http://caltech.edu/privacy-notice"), null);
});

test("policySurfaceScanner records mock Nano link ranking and topic extraction metadata", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const ambiguous = input.candidates.find((candidate) => candidate.linkText === "Your Choices");
      assert.ok(ambiguous);
      return {
        assistId: input.assistId,
        rankedCandidates: [{
          candidateId: ambiguous.candidateId,
          likelySurfaceType: "your_privacy_choices",
          shouldFetch: true,
          priorityRank: 1,
          confidence: 0.91,
          reason: "Ambiguous choices link likely maps to privacy choices.",
          uncertaintyNotes: ["Fixture ambiguity only."],
        }],
      };
    },
    async extractTopics(input) {
      assert.ok(input.excerpt.length <= 40_000);
      assert.doesNotMatch(input.excerpt, /<main|<script|<footer/i);
      if (input.surfaceType !== "your_privacy_choices") {
        return {
          assistId: input.assistId,
          observedTopics: [],
          mentionedVendors: [],
          mentionedPurposes: [],
          mentionedRights: [],
          mentionedControls: [],
          confidence: 0.5,
        };
      }
      return {
        assistId: input.assistId,
        observedTopics: ["global_privacy_control", "sale_or_share"],
        mentionedVendors: ["LiveRamp"],
        mentionedPurposes: ["targeted_advertising"],
        mentionedRights: ["do_not_sell_or_share"],
        mentionedControls: ["global_privacy_control"],
        confidence: 0.84,
        uncertaintyNotes: ["Alias detection came from bounded excerpt only."],
      };
    },
  };

  await withPolicyScan("policy-ambiguous-choices", async ({ result }) => {
    const choices = observedSurface(result.policySurfaceObservations, "your_privacy_choices");

    assert.equal(choices?.discoveryMethod, "nano_assisted_link_classification");
    assert.equal(choices?.directVsInferred, "mixed");
    assert.equal(choices?.assistMetadata.some((meta) => meta.assistType === "link_classification"), true);
    assert.equal(choices?.assistMetadata.some((meta) => meta.assistType === "topic_extraction"), true);
    assert.equal(choices?.assistMetadata.every((meta) => meta.usedForFinalFinding === false), true);
    assert.equal(choices?.mentionedVendors.includes("LiveRamp"), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner escalates when Nano provider is unavailable", async () => {
  await withPolicyScan("policy-vendor-mentions", async ({ result }) => {
    assert.equal(result.moduleRun.status, "failed");
    assert.equal(
      result.moduleRun.errors.some((error) => error.includes("Nano policy assist is required")),
      true,
    );
    assert.deepEqual(result.policySurfaceObservations, []);
  }, {}, { expectCompleted: false, useDefaultNanoProvider: false });
});

test("policySurfaceScanner escalates when Nano assist is explicitly disabled", async () => {
  await withPolicyScan("policy-vendor-mentions", async ({ result }) => {
    assert.equal(result.moduleRun.status, "failed");
    assert.equal(
      result.moduleRun.errors.some((error) => error.includes("cannot be disabled")),
      true,
    );
  }, { enableNanoPolicyAssist: false }, { expectCompleted: false });
});

test("policySurfaceScanner retains Nano Article 13 disclosure signals as bounded evidence", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async extractTopics(input) {
      return {
        assistId: input.assistId,
        observedTopics: ["legal_basis", "data_subject_rights", "international_transfers"],
        article13DisclosureSignals: [
          {
            disclosureType: "legal_basis",
            status: "observed",
            evidenceText: "We rely on consent, contract, and legitimate interests as lawful bases.",
            confidence: 0.91,
            source: "nano",
          },
          {
            disclosureType: "international_transfers",
            status: "partial",
            evidenceText: "We may transfer personal data outside your country.",
            confidence: 0.67,
            source: "nano",
          },
        ],
        mentionedControls: [],
        mentionedPurposes: ["analytics"],
        mentionedRights: ["access", "delete"],
        mentionedVendors: [],
        confidence: 0.9,
      };
    },
  };

  await withPolicyScan("policy-simple", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    assert.ok(privacy);
    assert.equal(privacy.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed" &&
      signal.source === "nano"
    ), true);
    assert.equal(privacy.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "partial" &&
      signal.source === "nano"
    ), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner gives Nano enough bounded text for distant Article 13 disclosures", async () => {
  let nanoExcerpt = "";
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async extractTopics(input) {
      nanoExcerpt = input.excerpt;
      return {
        assistId: input.assistId,
        observedTopics: ["data_retention", "data_subject_rights", "international_transfers"],
        article13DisclosureSignals: [
          {
            disclosureType: "data_retention",
            status: "observed",
            evidenceText: "We retain personal data only as long as necessary.",
            confidence: 0.91,
            source: "nano",
          },
          {
            disclosureType: "data_subject_rights",
            status: "observed",
            evidenceText: "You may exercise rights to access, rectification, erasure, restriction, portability, and objection.",
            confidence: 0.9,
            source: "nano",
          },
          {
            disclosureType: "international_transfers",
            status: "observed",
            evidenceText: "We may transfer personal data outside the European Economic Area using standard contractual clauses.",
            confidence: 0.89,
            source: "nano",
          },
        ],
        mentionedControls: [],
        mentionedPurposes: [],
        mentionedRights: ["access", "erasure", "objection"],
        mentionedVendors: [],
        confidence: 0.9,
      };
    },
  };

  await withPolicyScan("policy-article13-long", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.ok((privacy?.textExcerpt?.length ?? 0) > 1_000);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
    assert.ok(nanoExcerpt.length > 1_000);
    assert.ok(nanoExcerpt.length <= 40_000);
    assert.match(nanoExcerpt, /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_retention" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_subject_rights" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "observed"
    ), true);
    assert.match(
      privacy?.article13DisclosureSignals.find((signal) => signal.disclosureType === "legal_basis")?.evidenceText ?? "",
      /lawful bases|legitimate interests/i,
    );
    assert.match(
      privacy?.article13DisclosureSignals.find((signal) => signal.disclosureType === "data_retention")?.evidenceText ?? "",
      /retain personal data only as long as necessary/i,
    );
    assert.match(
      privacy?.article13DisclosureSignals.find((signal) => signal.disclosureType === "international_transfers")?.evidenceText ?? "",
      /standard contractual clauses|European Economic Area/i,
    );
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner confirms international transfer disclosure from recipient geography and safeguards", async () => {
  await withPolicyScan("policy-international-transfer-recipient-safeguards", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const transferSignal = privacy?.article13DisclosureSignals.find((signal) =>
      signal.disclosureType === "international_transfers"
    );

    assert.equal(privacy?.observedTopics.includes("international_transfers"), true);
    assert.equal(transferSignal?.status, "observed");
    assert.equal((transferSignal?.confidence ?? 0) >= 0.9, true);
    assert.match(transferSignal?.evidenceText ?? "", /Sometimes they may also be outside the EEA/i);
    assert.match(
      transferSignal?.evidenceText ?? "",
      /personal information is protected, both within and outside the EEA/i
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for static privacy policy fixture.");
      },
    },
  });
});

test("retained policy sections prefer the governing controller and retain passive processing-purpose disclosures", () => {
  const sourceUrl = "https://sits.example/privacy-policy/";
  const evidence = retainedArticle13SectionEvidenceFromSections([
    {
      sourceUrl,
      heading: "Information on the controller",
      textExcerpt: "Information on the controller pursuant to Art. 4 No. 7 GDPR: SITS Group AG, Etzelmatt 1, CH-5430 Wettingen. E-Mail: INFO@SITS.EXAMPLE.",
      charStart: 0,
      charEnd: 142,
      quality: "partial",
    },
    {
      sourceUrl,
      heading: "Data Privacy Solutions",
      textExcerpt: "Our DPO-as-a-Service provides a seamless approach to managing your data. Every organization can use our data protection services to support its compliance program.",
      charStart: 143,
      charEnd: 301,
      quality: "partial",
    },
    {
      sourceUrl,
      heading: "LinkedIn fanpage controller",
      textExcerpt: "Our LinkedIn fanpage is jointly operated with the platform operator. LinkedIn is a joint controller for its platform processing.",
      charStart: 302,
      charEnd: 425,
      quality: "partial",
    },
    {
      sourceUrl,
      heading: "Contact form and appointments",
      textExcerpt: "Your details from the form, including the contact details you provide, will be stored by us for the purpose of processing the enquiry and follow-up questions.",
      charStart: 426,
      charEnd: 580,
      quality: "partial",
    },
    {
      sourceUrl,
      heading: "Data transfers",
      textExcerpt: "Data transfers to third countries are secured by an adequacy decision pursuant to Art. 45 GDPR or by appropriate safeguards pursuant to Art. 46 GDPR. https://vendor.example/privacy https://vendor.example/help https://vendor.example/contact https://vendor.example/legal https://vendor.example/settings https://vendor.example/faq https://vendor.example/about https://vendor.example/more",
      charStart: 581,
      charEnd: 980,
      quality: "strong",
    },
  ]);

  const controller = evidence.find((row) => row.coverageArea === "controller_contact");
  const purposes = evidence.find((row) => row.coverageArea === "processing_purposes");
  const transfers = evidence.find((row) => row.coverageArea === "international_transfers");

  assert.equal(controller?.signalObserved, "observed");
  assert.equal(controller?.selectedPolicySectionHeading, "Information on the controller");
  assert.match(controller?.selectedPolicySectionExcerpt ?? "", /SITS Group AG|INFO@SITS\.EXAMPLE/i);
  assert.doesNotMatch(controller?.selectedPolicySectionExcerpt ?? "", /DPO-as-a-Service/i);
  assert.doesNotMatch(controller?.selectedPolicySectionExcerpt ?? "", /LinkedIn/i);
  assert.equal(purposes?.signalObserved, "observed");
  assert.equal(purposes?.selectedPolicySectionHeading, "Contact form and appointments");
  assert.match(purposes?.selectedPolicySectionExcerpt ?? "", /processing the enquiry and follow-up questions/i);
  assert.equal(transfers?.signalObserved, "observed");
  assert.match(transfers?.selectedPolicySectionExcerpt ?? "", /Art\. 45 GDPR|Art\. 46 GDPR/i);
  assert.doesNotMatch(transfers?.selectedPolicySectionExcerpt ?? "", /vendor\.example/i);
});

test("retained US-policy sections confirm direct recipients, transfers, controller contact, and privacy contact without inventing a DPO", () => {
  const sourceUrl = "https://studio.example/privacy";
  const evidence = retainedArticle13SectionEvidenceFromSections([
    {
      sourceUrl,
      heading: "How we disclose Personal Information",
      textExcerpt: "We share Personal Information with service providers, affiliates, analytics providers, advertising networks, social networks, platforms, and governmental authorities.",
      charStart: 0,
      charEnd: 170,
      quality: "strong",
    },
    {
      sourceUrl,
      heading: "International Transfer",
      textExcerpt: "Personal Information may be transferred to and processed in the United States or other jurisdictions. Courts, law enforcement, and national security authorities in those jurisdictions may access it.",
      charStart: 171,
      charEnd: 370,
      quality: "strong",
    },
    {
      sourceUrl,
      heading: "Contact Us",
      textExcerpt: "Example Studios Inc. operates these services. Questions about this Privacy Policy may be submitted through our privacy request form or mailed to 100 Example Avenue, Culver City, California, Attention: Privacy Officer.",
      charStart: 371,
      charEnd: 590,
      quality: "strong",
    },
  ], sourceUrl);
  const row = (coverageArea: string) => evidence.find((candidate) => candidate.coverageArea === coverageArea);

  assert.equal(row("recipients_or_vendor_categories")?.signalObserved, "observed");
  assert.match(row("recipients_or_vendor_categories")?.selectedPolicySectionExcerpt ?? "", /analytics providers|advertising networks/i);
  assert.equal(row("international_transfers")?.signalObserved, "observed");
  assert.match(row("international_transfers")?.selectedPolicySectionExcerpt ?? "", /United States or other jurisdictions/i);
  assert.equal(row("controller_contact")?.signalObserved, "observed");
  assert.match(row("controller_contact")?.selectedPolicySectionExcerpt ?? "", /Example Studios Inc|Privacy Officer/i);
  assert.notEqual(row("dpo_contact")?.signalObserved, "observed");
});

test("retained policy excerpts directly support controller, purposes, legal basis, retention, and privacy contact rows", () => {
  const sourceUrl = "https://foundation.example/privacy";
  const textExcerpt = [
    "Some service providers act as independent data controllers.",
    "Foundation Example is the controller for personal data described in this notice and can be contacted at privacy@foundation.example.",
    "We process account and event information to provide services, secure accounts, and communicate requested updates.",
    "Our lawful bases are performance of a contract, legitimate interests, legal obligations, and consent where required.",
    "We retain account records only as long as necessary for these purposes and then delete or anonymize them.",
    "Questions about privacy may be sent to our Privacy Office at privacy@foundation.example."
  ].join(" ");
  const evidence = retainedArticle13SectionEvidenceFromSections([{
    sourceUrl,
    heading: "Privacy information",
    textExcerpt,
    charStart: 0,
    charEnd: textExcerpt.length,
    quality: "strong"
  }], sourceUrl);
  const excerpt = (area: string) => evidence.find((row) => row.coverageArea === area)?.selectedPolicySectionExcerpt ?? "";

  assert.match(excerpt("controller_contact"), /Foundation Example is the controller.*privacy@foundation\.example/i);
  assert.doesNotMatch(excerpt("controller_contact"), /service providers act as independent/i);
  assert.match(excerpt("processing_purposes"), /process account and event information to provide services/i);
  assert.match(excerpt("legal_basis"), /lawful bases are performance of a contract.*legitimate interests/i);
  assert.match(excerpt("data_retention"), /retain account records only as long as necessary.*delete or anonymize/i);
  assert.match(excerpt("dpo_contact"), /Privacy Office at privacy@foundation\.example/i);
});

test("transfer excerpts prefer concrete cross-border safeguards over nearby framework complaint prose", () => {
  const sourceUrl = "https://events.example/privacy";
  const evidence = retainedArticle13SectionEvidenceFromSections([
    {
      sourceUrl,
      heading: "International transfers",
      textExcerpt: "We transfer personal information to service providers in other countries and protect those transfers using Standard Contractual Clauses and adequacy decisions where available.",
      charStart: 0,
      charEnd: 170,
      quality: "strong",
    },
    {
      sourceUrl,
      heading: "Data Privacy Framework complaints",
      textExcerpt: "Questions and unresolved complaints under the Data Privacy Framework may be referred to an independent dispute-resolution provider.",
      charStart: 171,
      charEnd: 310,
      quality: "strong",
    },
  ], sourceUrl);
  const transfer = evidence.find((row) => row.coverageArea === "international_transfers");
  assert.match(transfer?.selectedPolicySectionExcerpt ?? "", /transfer personal information.*other countries.*Standard Contractual Clauses/i);
  assert.doesNotMatch(transfer?.selectedPolicySectionExcerpt ?? "", /unresolved complaints|dispute-resolution/i);
});

test("policySurfaceScanner extracts late mature-policy GDPR transparency signals without promoting legal basis", async () => {
  let nanoExcerpt = "";
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async extractTopics(input) {
      nanoExcerpt = input.excerpt;
      return {
        assistId: input.assistId,
        observedTopics: [
          "controller_contact",
          "data_retention",
          "data_subject_rights",
          "international_transfers",
          "supervisory_authority",
          "automated_decision_making_or_profiling",
        ],
        article13DisclosureSignals: [],
        mentionedControls: [],
        mentionedPurposes: ["personalized ads"],
        mentionedRights: ["export", "delete"],
        mentionedVendors: [],
        confidence: 0.82,
      };
    },
  };

  await withPolicyScan("policy-google-like-late-sections", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const signals = privacy?.article13DisclosureSignals ?? [];
    const signalFor = (type: string) => signals.find((signal) => signal.disclosureType === type);
    const sectionHeadings = privacy?.retainedPolicySections?.map((section) => section.heading) ?? [];
    const sectionEvidence = privacy?.retainedArticle13SectionEvidence ?? [];
    const sectionEvidenceFor = (type: string) => sectionEvidence.find((evidence) => evidence.coverageArea === type);

    assert.ok(privacy);
    assert.match(nanoExcerpt, /Retaining your information/i);
    assert.match(nanoExcerpt, /Data transfers/i);
    assert.match(nanoExcerpt, /Compliance and cooperation with regulators/i);
    assert.equal(sectionHeadings.includes("Your privacy controls"), true);
    assert.equal(sectionHeadings.includes("Exporting and deleting your information"), true);
    assert.equal(sectionHeadings.includes("Retaining your information"), true);
    assert.equal(sectionHeadings.includes("Data transfers"), true);
    assert.equal(sectionHeadings.includes("Compliance and cooperation with regulators"), true);
    assert.equal(sectionEvidenceFor("data_retention")?.selectedPolicySectionHeading, "Retaining your information");
    assert.match(sectionEvidenceFor("data_retention")?.selectedPolicySectionExcerpt ?? "", /deleted or anonymized|retained as long as necessary/i);
    assert.equal(sectionEvidenceFor("data_subject_rights")?.signalObserved, "observed");
    assert.match(sectionEvidenceFor("data_subject_rights")?.selectedPolicySectionHeading ?? "", /privacy controls|exporting and deleting/i);
    assert.match(sectionEvidenceFor("data_subject_rights")?.selectedPolicySectionExcerpt ?? "", /update important privacy controls|Google Takeout|delete your information/i);
    assert.equal(sectionEvidenceFor("international_transfers")?.selectedPolicySectionHeading, "Data transfers");
    assert.equal(sectionEvidenceFor("supervisory_authority")?.selectedPolicySectionHeading, "Compliance and cooperation with regulators");
    assert.equal(sectionEvidenceFor("legal_basis")?.signalObserved, "not_confirmed");
    assert.equal(signalFor("data_retention")?.status, "observed");
    assert.equal(signalFor("data_retention")?.confidence, 0.9);
    assert.equal(signalFor("data_retention")?.selectedPolicySectionHeading, "Retaining your information");
    assert.match(signalFor("data_retention")?.evidenceText ?? "", /deleted or anonymized|retained as long as necessary/i);
    assert.equal(signalFor("data_subject_rights")?.status, "observed");
    assert.equal(signalFor("data_subject_rights")?.confidence, 0.8);
    assert.match(signalFor("data_subject_rights")?.selectedPolicySectionHeading ?? "", /privacy controls|exporting and deleting/i);
    assert.match(signalFor("data_subject_rights")?.evidenceText ?? "", /privacy controls|activity controls|ad settings|personalization settings|Google Takeout|delete your information|My Activity/i);
    assert.equal(signalFor("international_transfers")?.status, "observed");
    assert.equal(signalFor("international_transfers")?.confidence, 0.84);
    assert.equal(signalFor("international_transfers")?.selectedPolicySectionHeading, "Data transfers");
    assert.match(signalFor("international_transfers")?.evidenceText ?? "", /servers around the world|outside the country where you live|data privacy frameworks/i);
    assert.equal(signalFor("supervisory_authority")?.status, "partial");
    assert.equal(signalFor("supervisory_authority")?.confidence, 0.62);
    assert.equal(signalFor("supervisory_authority")?.selectedPolicySectionHeading, "Compliance and cooperation with regulators");
    assert.match(signalFor("supervisory_authority")?.evidenceText ?? "", /regulatory authorities|local data protection authorities|formal written complaints/i);
    assert.equal(signalFor("automated_decision_making_or_profiling")?.status, "partial");
    assert.equal(signalFor("automated_decision_making_or_profiling")?.confidence, 0.56);
    assert.equal(signalFor("automated_decision_making_or_profiling")?.selectedPolicySectionHeading, "Automated systems");
    assert.match(signalFor("automated_decision_making_or_profiling")?.evidenceText ?? "", /automated systems|algorithms|personalized ads/i);
    assert.equal(signalFor("controller_contact")?.status, "partial");
    assert.equal(signalFor("controller_contact")?.confidence, 0.62);
    assert.equal(signalFor("controller_contact")?.selectedPolicySectionHeading, "European requirements");
    assert.match(signalFor("controller_contact")?.evidenceText ?? "", /Google LLC|Google Ireland Limited|contact Google/i);
    assert.equal(signalFor("legal_basis"), undefined);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner does not classify deletion rights alone as retention disclosure", async () => {
  await withPolicyScan("policy-retention-rights-only", async ({ result }) => {
    const article13Signals = result.policySurfaceObservations.flatMap((observation) =>
      observation.surfaceType === "privacy_policy" ? observation.article13DisclosureSignals : []
    );
    const retention = article13Signals.find((signal) => signal.disclosureType === "data_retention");
    const rights = article13Signals.find((signal) => signal.disclosureType === "data_subject_rights");

    assert.equal(retention, undefined);
    assert.equal(rights?.status, "observed");
    assert.equal(rights?.confidence, 0.9);
    assert.match(rights?.evidenceText ?? "", /right to access, delete, erase/i);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner resolves OneTrust notice JSON when privacy page is an error shell", async () => {
  await withPolicyScan("policy-onetrust-notice-json", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Processing Error/i);
    assert.match(privacy?.textExcerpt ?? "", /legal bases for processing/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "controller_contact" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_retention" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_subject_rights" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner follows OneTrust index JSON to the final privacy notice", async () => {
  await withPolicyScan("policy-onetrust-index-json", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Processing Error/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_subject_rights" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner uses bounded Mini review to select one clearly labeled privacy-index child without requiring a date", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async selectPrivacyDocumentLink(input) {
      const selected = input.candidates.find((candidate) =>
        candidate.url.endsWith("/policies/privacy-notice-current")
      );
      return {
        assistId: input.assistId,
        selectedCandidateId: selected?.candidateId ?? null,
        shouldFetch: Boolean(selected),
        confidence: 0.94,
        reason: "The link clearly identifies the service privacy policy; a date is not required.",
        uncertaintyNotes: [],
      };
    },
  };

  await withPolicyScan("policy-privacy-document-index", async ({ result, baseUrl }) => {
    const selected = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/privacy-notice-current`
    );
    const unselected = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/privacy-notice-legacy`
    );

    assert.equal(selected?.status, "fetched");
    assert.equal(selected?.traversalDepth, 1);
    assert.equal(selected?.parentSurfaceUrl, `${baseUrl}/policies/privacy-index`);
    assert.match(selected?.parentObservationId ?? "", /^policy_surface_/);
    assert.equal(
      selected?.selectionReasonCodes.includes("mini_semantic_privacy_document_selection"),
      true,
    );
    assert.equal(
      selected?.assistMetadata.some((metadata) =>
        metadata.modelAssistRole === "review" &&
        metadata.modelAssistProvider === "mini"
      ),
      true,
    );
    assert.equal(unselected?.status, "observed");
    assert.equal(unselected?.documentFetchState, "not_attempted");
    assert.equal(unselected?.documentEvaluationState, "not_attempted");
    assert.equal(unselected?.traversalDepth, 1);
    assert.equal(unselected?.parentSurfaceUrl, `${baseUrl}/policies/privacy-index`);
    assert.equal(
      unselected?.selectionReasonCodes.includes("not_selected_for_bounded_fetch"),
      true,
    );
  }, { nanoAssistProvider });
});

test("policySurfaceScanner does not follow links from the selected privacy-index child", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async selectPrivacyDocumentLink(input) {
      const selected = input.candidates.find((candidate) =>
        candidate.url.endsWith("/policies/privacy-notice-legacy")
      );
      return {
        assistId: input.assistId,
        selectedCandidateId: selected?.candidateId ?? null,
        shouldFetch: Boolean(selected),
        confidence: 0.9,
        reason: "Fixture selection for one-hop failure coverage.",
        uncertaintyNotes: [],
      };
    },
  };

  await withPolicyScan("policy-privacy-document-index", async ({ result, baseUrl }) => {
    const selected = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/privacy-notice-legacy`
    );
    const deeper = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/privacy-notice-current`
    );

    assert.equal(selected?.status, "fetched");
    assert.equal(selected?.traversalDepth, 1);
    assert.equal(deeper?.status, "observed");
    assert.equal(deeper?.documentFetchState, "not_attempted");
    assert.equal(deeper?.parentSurfaceUrl, `${baseUrl}/policies/privacy-index`);
    assert.equal(deeper?.traversalDepth, 1);
  }, { nanoAssistProvider });
});

test("policySurfaceScanner extracts rendered policy body instead of nav and footer noise", async () => {
  await withPolicyScan("policy-noisy-policy-body", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.match(privacy?.textExcerpt ?? "", /legal obligation, and legitimate interests/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /Repeated header noise/i);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /Repeated footer noise/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner retains accordion policy disclosures from static DOM", async () => {
  await withPolicyScan("policy-article13-accordions", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.match(privacy?.textExcerpt ?? "", /lawful bases for processing/i);
    assert.match(privacy?.textExcerpt ?? "", /retain personal data only as long as necessary/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_retention" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner prefers a canonical policy document linked from a privacy-center shell", async () => {
  await withPolicyScan("policy-canonical-near-privacy-center", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Privacy Center/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "controller_contact" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner resolves canonical policy links against a redirected privacy-center URL", async () => {
  await withPolicyScan("policy-redirected-privacy-center", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policycenter/b2c/`);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /Children's Privacy Policy/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "controller_contact" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

interface ScanContext {
  result: Awaited<ReturnType<typeof policySurfaceScanner>>;
  baseUrl: string;
}

async function withPolicyScan(
  page: StaticFixturePage,
  run: (context: ScanContext) => Promise<void> | void,
  options: Partial<Parameters<typeof policySurfaceScanner>[0]> = {},
  expectations: { expectCompleted?: boolean; useDefaultNanoProvider?: boolean } = {},
): Promise<void> {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const targetUrl = server.urlFor(page);
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider: expectations.useDefaultNanoProvider === false
        ? undefined
        : createDefaultMockNanoPolicyAssistProvider(),
      ...options,
    });
    if (expectations.expectCompleted !== false) {
      assert.equal(result.moduleRun.status, "completed");
    }
    await run({ result, baseUrl: server.baseUrl });
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function observedSurface(
  observations: Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"],
  surfaceType: string,
): Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number] | undefined {
  return observations.find((observation) =>
    observation.surfaceType === surfaceType &&
    (observation.status === "observed" || observation.status === "fetched"),
  );
}

async function readPolicyCaptureDiagnostics(
  result: Awaited<ReturnType<typeof policySurfaceScanner>>,
): Promise<{
  artifactVersion: string;
  corePolicySurfaceRetained: boolean;
  coreSurfaceTypes: string[];
  observedCandidateCount: number;
  commonPathFallbackUsed: boolean;
  fetchedCount: number;
  failedCandidateCount: number;
  funnel: {
    candidateDiscoveredCount: number;
    candidateSelectedCount: number;
    documentFetchStartedCount: number;
    documentFetchedCount: number;
    documentUsableCount: number;
    fetchFailedCount: number;
    observedLinkCount: number;
    protectedObservedFetchAttempts: number;
    renderedRecoveryAttempts: number;
    renderedRecoverySuccesses: number;
    skippedBudgetCount: number;
  };
  homepageFetch?: {
    failureReason?: string;
    httpStatus?: number;
    ok: boolean;
    stage: string;
  };
  failedFetches: Array<{
    candidateUrl?: string;
    failureReason?: string;
    httpStatus?: number;
    ok: boolean;
    stage: string;
  }>;
  candidateSummary: Array<{
    classifierProvenance: string;
    classifierReasonCodes: string[];
    linkText: string;
    matchedLocale?: string;
    matchStrength?: string;
    normalizedUrl: string;
    observationOnly: boolean;
    surfaceType: string;
  }>;
  winningSurfaceUrls: string[];
  policyCaptureDurationMs: number;
}> {
  const ref = result.artifactRefs.find((artifactRef) => artifactRef.artifactId === "policy_surface_capture_diagnostics");
  assert.ok(ref?.path, "policy capture diagnostics artifact should be retained");
  return JSON.parse(await readFile(ref.path, "utf8"));
}

function createDefaultMockNanoPolicyAssistProvider(): PolicyNanoAssistProvider {
  return {
    async classifyLinks(input) {
      const rankedCandidates = input.candidates
        .map((candidate) => {
          const surfaceType = candidate.deterministicSurfaceType !== "unknown"
            ? candidate.deterministicSurfaceType
            : mockSurfaceType(`${candidate.linkText} ${candidate.normalizedUrl}`);
          return {
            candidateId: candidate.candidateId,
            likelySurfaceType: surfaceType,
            shouldFetch: surfaceType !== "unknown",
            priorityRank: mockDiscoveryPriority(candidate.domLocation, candidate.discoveryMethod) + mockSurfacePriority(surfaceType),
            confidence: surfaceType === "unknown" ? 0.1 : 0.88,
            reason: "Mock Nano selected from observed link/url evidence.",
            uncertaintyNotes: [] as string[],
          };
        })
        .filter((candidate) => candidate.shouldFetch)
        .sort((left, right) =>
          left.priorityRank - right.priorityRank ||
          right.confidence - left.confidence ||
          left.candidateId.localeCompare(right.candidateId),
        )
        .slice(0, 8)
        .map((candidate, index) => ({
          ...candidate,
          priorityRank: index + 1,
        }));
      return {
        assistId: input.assistId,
        rankedCandidates,
      };
    },
  };
}

function mockSurfaceType(value: string): Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number]["surfaceType"] {
  const lower = value.toLowerCase();
  if (/do not sell|do-not-sell|do not sell or share/.test(lower)) {
    return "do_not_sell_or_share";
  }
  if (/your privacy choices|privacy choices|your choices/.test(lower)) {
    return "your_privacy_choices";
  }
  if (/preference center|privacy center|privacy settings|consent settings/.test(lower)) {
    return "consent_preferences";
  }
  if (/notice at collection/.test(lower)) {
    return "notice_at_collection";
  }
  if (/california privacy|state privacy rights/.test(lower)) {
    return "california_notice";
  }
  if (/cookie settings|cookie preferences|manage preferences/.test(lower)) {
    return "cookie_settings";
  }
  if (/cookie policy|cookies\b/.test(lower)) {
    return "cookie_policy";
  }
  if (/privacy policy|privacy notice|privacy\b/.test(lower)) {
    return "privacy_policy";
  }
  if (/\bai\b|artificial intelligence/.test(lower)) {
    return "ai_disclosure";
  }
  if (/accessibility/.test(lower)) {
    return "accessibility_statement";
  }
  if (/terms/.test(lower)) {
    return "terms";
  }
  return "unknown";
}

function mockDiscoveryPriority(
  domLocation: "footer" | "header" | "nav" | "body",
  discoveryMethod: Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number]["discoveryMethod"],
): number {
  if (domLocation === "footer") {
    return 0;
  }
  if (domLocation === "header" || domLocation === "nav") {
    return 20;
  }
  return discoveryMethod === "guessed_common_path" ? 80 : 40;
}

function mockSurfacePriority(
  surfaceType: Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number]["surfaceType"],
): number {
  const priority = [
    "privacy_policy",
    "cookie_policy",
    "your_privacy_choices",
    "consent_preferences",
    "do_not_sell_or_share",
    "notice_at_collection",
    "california_notice",
    "ai_disclosure",
    "accessibility_statement",
    "terms",
  ].indexOf(surfaceType);
  return priority >= 0 ? priority : 99;
}
