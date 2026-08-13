import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  assessPolicyDocumentSubstance,
  assessPolicyDocumentUsefulness,
  assessPolicyTextQuality,
  classifyFetchedPolicySurface,
  policySurfaceScanner,
  type PolicyNanoAssistProvider,
} from "./scanners/policy-surface-scanner.js";

test("useful policy evaluation rejects provider-owned documents while preserving verified parent policies", () => {
  const provider = assessPolicyDocumentUsefulness({
    surfaceType: "privacy_policy",
    title: "CookieHub Privacy Policy",
    text: "This privacy policy explains how CookieHub collects and processes personal data.",
    targetRelationship: "service_provider",
    ownershipConfidence: 0.94,
    observedTopicCount: 2,
    gdprTransparencyTopicCandidateCount: 2,
    providerLinkContextObserved: true,
  });
  assert.equal(provider.documentEvaluationState, "insufficient");
  assert.equal(provider.documentEvaluationReasonCodes.includes("provider_or_unrelated_ownership_observed"), true);

  const parent = assessPolicyDocumentUsefulness({
    surfaceType: "privacy_policy",
    title: "Warner Bros. Discovery Privacy Policy",
    text: "This privacy policy applies to CNN and explains how we process personal data.",
    targetRelationship: "first_party_brand",
    ownershipConfidence: 0.86,
    observedTopicCount: 2,
    gdprTransparencyTopicCandidateCount: 2,
  });
  assert.equal(parent.documentEvaluationState, "usable");
  assert.equal(parent.documentEvaluationReasonCodes.includes("verified_target_or_parent_ownership"), true);
});

test("privacy document substance rejects generic error, parking, and homepage shells", () => {
  for (const fixture of [
    { title: "404", text: "The requested page cannot be found. Please return to the homepage." },
    { title: "Domain for sale", text: "This domain may be for sale. Buy this domain today." },
    { title: "Temporary malfunction", text: "The service is temporarily unavailable due to a technical malfunction. Try again later." },
  ]) {
    assert.equal(assessPolicyDocumentSubstance({
      surfaceType: "privacy_policy",
      ...fixture,
    }).matchesExpectedSurface, false, fixture.title);
  }
  const genericHomepage = assessPolicyDocumentUsefulness({
    surfaceType: "privacy_policy",
    title: "University Home",
    text: "Schools Research Admissions News Events Libraries Contact Campus navigation.",
    targetRelationship: "target_controller",
    ownershipConfidence: 0.98,
    observedTopicCount: 0,
    gdprTransparencyTopicCandidateCount: 0,
  });
  assert.equal(genericHomepage.documentEvaluationState, "insufficient");
  assert.equal(genericHomepage.documentEvaluationReasonCodes.includes("privacy_semantic_signal_not_observed"), true);
});

test("privacy document substance keeps canonical multilingual policy text reviewable", () => {
  assert.equal(assessPolicyDocumentSubstance({
    surfaceType: "privacy_policy",
    title: "Tietosuojaseloste",
    text: "Tietosuojaseloste kertoo henkilötietojen käsittelystä, säilytyksestä ja rekisteröidyn oikeuksista. ".repeat(8),
  }).matchesExpectedSurface, true);
  assert.equal(assessPolicyDocumentSubstance({
    surfaceType: "privacy_policy",
    title: "개인정보 처리방침",
    text: "개인정보 처리방침은 개인정보의 수집, 이용, 보관 및 정보주체의 권리를 설명합니다. ".repeat(8),
  }).matchesExpectedSurface, true);
});

test("policy text quality accepts substantive prose using canonical locale terms", () => {
  const fixtures = [
    "Política de Privacidade. Coletamos dados pessoais para prestar o serviço. Explicamos a finalidade, o armazenamento, o consentimento e os direitos do usuário. ".repeat(8),
    "Política de privacidad. Tratamos datos personales para prestar el servicio. Explicamos la finalidad, la conservación, el consentimiento y los derechos de cada usuario. ".repeat(8),
    "Политика конфиденциальности описывает, какие персональные данные мы собираем, как используем и храним их, а также ваши права и способы отозвать согласие. ".repeat(8),
    "Политика приватности описује које податке о личности прикупљамо, како их користимо и чувамо, права корисника и начин повлачења сагласности. ".repeat(8),
  ];
  for (const text of fixtures) {
    const quality = assessPolicyTextQuality(text);
    assert.equal(quality.usable, true, JSON.stringify(quality));
    assert.ok(quality.policyTermCount >= 2, JSON.stringify(quality));
  }
});

test("fetched document content upgrades mislabeled general privacy policies without upgrading cookie-only text", () => {
  const mixedPolicy = classifyFetchedPolicySurface({
    surfaceType: "cookie_policy",
    url: "https://example.test/privacy.aspx",
    title: "Cookie Policy",
    text: "Privacy Policy. We collect personal information and explain how information is used, disclosed, retained, exported, corrected, and deleted. Cookies are one part of this policy. ".repeat(6),
  });
  assert.equal(mixedPolicy.surfaceType, "privacy_policy");
  assert.equal(mixedPolicy.reasonCodes.includes("cookie_label_overridden_by_document_content"), true);

  const frenchPolicy = classifyFetchedPolicySurface({
    surfaceType: "cookie_policy",
    url: "https://example.fr/personal-data.html",
    title: "Protection des données",
    text: "Charte de protection des données personnelles. Nous traitons des données personnelles et expliquons les finalités, les droits, la conservation et les destinataires. ".repeat(7),
  });
  assert.equal(frenchPolicy.surfaceType, "privacy_policy");

  const cookieOnly = classifyFetchedPolicySurface({
    surfaceType: "cookie_policy",
    url: "https://example.test/cookies",
    title: "Cookie Policy",
    text: "Cookie Policy. We use essential cookies and analytics cookies. You can change cookie settings in your browser. ".repeat(8),
  });
  assert.equal(cookieOnly.surfaceType, "cookie_policy");
});

test("policy scanner follows one privacy document from an explicit legal hub", async () => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://fixture.test");
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (requestUrl.pathname === "/") {
      response.end("<!doctype html><html><body><main>Example service</main><footer><a href='/legal'>Legal</a></footer></body></html>");
      return;
    }
    if (requestUrl.pathname === "/legal") {
      response.end(`<!doctype html><html><head><title>Legal</title></head><body>
        <nav><a href="#privacy-policy">Privacy Policy</a></nav>
        <section id="terms"><h1>Terms of Service</h1><p>These terms govern use of Example service.</p></section>
        <section id="privacy-policy"><h1>Privacy Policy</h1>
          <p>Example is the controller of personal data collected to provide the service.</p>
          <p>We process account information under contract and legitimate interests.</p>
          <p>We retain records for seven years and share data with service providers.</p>
          <p>You may access, correct, delete, restrict, object, and port your personal data.</p>
          <p>International transfers use standard contractual clauses.</p>
        </section></body></html>`);
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-legal-hub-policy-"));
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
            reason: "Retain deterministic policy candidate.",
          })),
      };
    },
  };

  try {
    const result = await policySurfaceScanner({
      url: baseUrl,
      normalizedUrl: baseUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter: await createArtifactWriter(tempRoot),
      nanoAssistProvider,
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.status === "fetched"
    );
    assert.ok(privacy, JSON.stringify(result.policySurfaceObservations.map((observation) => ({
      url: observation.normalizedUrl,
      surfaceType: observation.surfaceType,
      status: observation.status,
      evaluation: observation.documentEvaluationState,
      role: observation.documentRole,
      depth: observation.traversalDepth,
      reasons: observation.selectionReasonCodes,
    })), null, 2));
    assert.equal(privacy.documentEvaluationState, "usable");
    assert.equal(privacy.traversalDepth, 1);
    assert.equal(privacy.selectionReasonCodes?.includes("linked_from_explicit_legal_privacy_hub"), true);
    assert.equal(privacy.selectionReasonCodes?.includes("same_document_privacy_section"), true);
    assert.equal(privacy.parentSurfaceUrl, `${baseUrl}/legal`);
    const legal = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/legal`
    );
    assert.ok(legal);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policy scanner follows one explicit cross-origin privacy PDF from a retained terms directory", async () => {
  const documentServer = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>Privacy Statement</title></head><body>
      <h1>Privacy Statement</h1>
      <p>Example Travel is the controller of personal data collected to provide travel services.</p>
      <p>We process account and booking information under contract and legitimate interests.</p>
      <p>We retain booking records for seven years and share data with named service providers.</p>
      <p>You may access, correct, delete, restrict, object, and port your personal data.</p>
      <p>International transfers use standard contractual clauses.</p>
    </body></html>`);
  });
  documentServer.listen(0, "127.0.0.1");
  await once(documentServer, "listening");
  const documentAddress = documentServer.address();
  assert.ok(documentAddress && typeof documentAddress !== "string");
  const documentUrl = `http://127.0.0.1:${documentAddress.port}/travel-privacy.pdf`;

  const siteServer = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://fixture.test");
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (requestUrl.pathname === "/") {
      response.end("<!doctype html><html><body><main>Example Travel</main><footer><a href='/terms'>Terms and conditions</a></footer></body></html>");
      return;
    }
    if (requestUrl.pathname === "/terms") {
      response.end(`<!doctype html><html><head><title>Terms and conditions</title></head><body>
        <h1>Terms and conditions</h1><p>These terms govern use of Example Travel.</p>
        <ul><li><a href="${documentUrl}">Privacy Statement (PDF)</a></li></ul>
        <footer><a href="/terms">Privacy policy</a></footer>
      </body></html>`);
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  siteServer.listen(0, "127.0.0.1");
  await once(siteServer, "listening");
  const siteAddress = siteServer.address();
  assert.ok(siteAddress && typeof siteAddress !== "string");
  const baseUrl = `http://127.0.0.1:${siteAddress.port}`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-terms-directory-policy-"));
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
            reason: "Retain deterministic policy candidate.",
          })),
      };
    },
  };

  try {
    const result = await policySurfaceScanner({
      url: baseUrl,
      normalizedUrl: baseUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter: await createArtifactWriter(tempRoot),
      nanoAssistProvider,
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.status === "fetched" &&
      observation.normalizedUrl === documentUrl
    );
    assert.ok(privacy, JSON.stringify(result.policySurfaceObservations, null, 2));
    assert.equal(privacy.documentEvaluationState, "usable");
    assert.equal(privacy.traversalDepth, 1);
    assert.equal(privacy.selectionReasonCodes?.includes("linked_from_explicit_terms_policy_directory"), true);
    assert.equal(privacy.selectionReasonCodes?.includes("single_explicit_privacy_pdf_in_terms_directory"), true);
  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => siteServer.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => documentServer.close((error) => error ? reject(error) : resolve())),
    ]);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policy scanner uses the protected browser reserve after an observed policy direct-fetch failure", async () => {
  let directResponseStatus = 202;
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://fixture.test");
    if (requestUrl.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><html><body><main>Example service</main><footer><a href='/privacy'>Privacy Policy</a></footer></body></html>");
      return;
    }
    if (requestUrl.pathname === "/privacy") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      if (!/Chrome\//i.test(request.headers["user-agent"] ?? "")) {
        response.statusCode = directResponseStatus;
        response.end("<!doctype html><html><body></body></html>");
        return;
      }
      response.end(`<!doctype html><html><head><title>Privacy Policy</title></head><body>
        <h1>Privacy Policy</h1>
        <p>Example is the controller of personal data collected to provide the service.</p>
        <p>We process account information under contract and legitimate interests.</p>
        <p>We retain records for seven years and share data with service providers.</p>
        <p>You may access, correct, delete, restrict, object, and port your personal data.</p>
        <p>International transfers use standard contractual clauses.</p>
      </body></html>`);
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
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
            reason: "Retain deterministic policy candidate.",
          })),
      };
    },
  };

  try {
    for (const directStatus of [202, 503]) {
      directResponseStatus = directStatus;
      const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-protected-policy-recovery-"));
      try {
        const result = await policySurfaceScanner({
          url: baseUrl,
          normalizedUrl: baseUrl,
          scanStartedAtMs: Date.now(),
          internalBudgetMs: 8_000,
          artifactWriter: await createArtifactWriter(tempRoot),
          nanoAssistProvider,
        });
        const privacy = result.policySurfaceObservations.find((observation) =>
          observation.surfaceType === "privacy_policy" &&
          observation.status === "fetched" &&
          observation.normalizedUrl === `${baseUrl}/privacy`
        );
        assert.ok(privacy, `Direct status ${directStatus}: ${JSON.stringify(result.policySurfaceObservations, null, 2)}`);
        assert.equal(privacy.httpStatus, 200);
        assert.equal(privacy.documentEvaluationState, "usable");
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
