import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrivacyAuditEvidence } from "@certscore/api-contracts";
import { CaliforniaPrivacyWorkpaper, RegulatoryReviewFocus } from "./regulatory-review-focus";
import { ShadowReportShareMenu } from "./report-lab/shadow-report-actions";

test("review selector is compact and exposes both focus choices", () => {
  const markup = renderToStaticMarkup(<RegulatoryReviewFocus focus="ccpa_cpra" />);
  assert.match(markup, /<form[^>]+aria-label="Review focus"/);
  assert.match(markup, /<form[^>]+method="get"/);
  assert.doesNotMatch(markup, /Report view|>Review focus<\/span>/);
  assert.match(markup, /value="gdpr_eprivacy"[^>]+aria-pressed="false"/);
  assert.match(markup, /value="ccpa_cpra"[^>]+aria-pressed="true"/);
  assert.doesNotMatch(markup, /California visitor behavior|href="#gpc-evidence"|A separate CCPA\/CPRA score|Consent evidence/);
});

test("California evidence is scoped to CCPA and remains compact when unavailable", () => {
  assert.equal(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="gdpr_eprivacy" />), "");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" />);
  assert.match(html, /CCPA\/CPRA · Starting page/);
  assert.match(html, /Privacy choices &amp; notices/);
  assert.match(html, /Evidence unavailable/);
  assert.match(html, /does not establish that these items are absent/);
  assert.doesNotMatch(html, /<details[^>]+open=|0 retained choices/);
});

test("retained California choices and notices remain accessible only in CCPA focus", () => {
  const evidence: PrivacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "fixture", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false,
    controls: [{ kind: "your_privacy_choices", label: "Your privacy choices", sourceUrl: "https://example.test/",
      destinationUrl: "https://example.test/choices", placement: "footer", evidenceRef: "choice:1", retrieval: "fetched", interaction: "not_tested" }],
    notices: [{ kind: "california_notice", url: "https://example.test/privacy", evidenceRef: "notice:1",
      directlyLinkedFromScannedPage: true, coverage: "partial", passages: [{ topic: "privacy_rights", excerpt: "You can request deletion." }] }],
  };
  assert.equal(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="gdpr_eprivacy" evidence={evidence} />), "");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />);
  assert.match(html, /1 observed choice · 1 notice/);
  assert.match(html, /href="https:\/\/example.test\/choices"/);
  assert.match(html, /You can request deletion/);
  assert.match(html, /Opt-out functionality and notice completeness were not tested/);
  assert.match(html, /Evidence provenance/);
  assert.doesNotMatch(html, /<details[^>]+open=/);
});

test("California evidence distinguishes identified links from verified visitor-facing choices", () => {
  const evidence: PrivacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v2", scanId: "fixture", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false, controls: [], notices: [],
    controlCandidates: [{ kind: "cookie_settings", label: "Cookie Settings", sourceUrl: "https://example.test/",
      destinationUrl: "https://example.test/cookie-settings", placement: "header_link",
      evidenceRef: "policy-surface:cookies", verification: "visibility_unverified" }],
  };
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />);
  assert.match(html, /0 observed choices · 1 link to review · 0 notices/);
  assert.match(html, /Link identified: “Cookie Settings” · visibility not verified/);
  assert.doesNotMatch(html, /Observed: “Cookie Settings”/);
});

test("share and download links preserve focus, with tracking exports explicitly starting-page scoped", () => {
  const markup = renderToStaticMarkup(<ShadowReportShareMenu reportUrl="/scan/fixture?reviewFocus=ccpa_cpra" scanId="fixture" siteLabel="example.test" fullSite />);
  assert.match(markup, /format=pdf[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /format=csv[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /workpaper=tracking[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /https%3A%2F%2Fcertscore.ai%2Fscan%2Ffixture%3FreviewFocus%3Dccpa_cpra/);
  assert.doesNotMatch(markup, /format=csv[^"<]*scope=full-site/);
});
