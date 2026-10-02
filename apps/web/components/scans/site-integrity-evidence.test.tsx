import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { siteIntegrityProjectionFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { selectSiteIntegrityFinding } from "../../lib/scans/site-integrity-report";
import { SiteIntegrityCallout, SiteIntegrityEvidence, SiteIntegritySiteContext } from "./site-integrity-evidence";
import { FullSiteExecutiveSummary } from "./full-site-executive-summary";

test("only projected integrity findings render a separate review callout and detailed evidence", () => {
  assert.equal(renderToStaticMarkup(<><SiteIntegrityCallout /><SiteIntegrityEvidence /></>), "");
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: siteIntegrityProjectionFixture },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const finding = selectSiteIntegrityFinding(packets);
  assert.ok(finding);
  const html = renderToStaticMarkup(<><SiteIntegrityCallout finding={finding} /><SiteIntegrityEvidence finding={finding} /></>);
  assert.match(html, /Site integrity · High priority/);
  assert.match(html, /href="#site-integrity-evidence"/);
  assert.match(html, /id="site-integrity-evidence"/);
  assert.match(html, /pharmacy.example/);
  assert.match(html, /Zero-size container with clipped overflow/);
  assert.match(html, /Destinations \(2\)/);
  assert.match(html, /Affected pages \(1\)/);
  assert.match(html, /27-point score deduction/);
  assert.doesNotMatch(html, /href="https:/);
  for (const scannedPages of [1, 10]) {
    const summary = renderToStaticMarkup(<FullSiteExecutiveSummary pending={false} scannedPages={scannedPages}
      score={{ value: 100, scoredPages: scannedPages, priorityReview: [] }} />);
    assert.match(summary, /score 100 out of 100/);
    assert.doesNotMatch(summary, /separate site-integrity observation/);
    assert.match(summary, /0 priority issues/);
  }
});

test("empty sitewide hidden-link evidence does not render a panel regardless of coverage", () => {
  for (const status of ["captured", "limited", "unavailable"] as const) {
    const html = renderToStaticMarkup(<SiteIntegritySiteContext.Provider value={{ findings: [], coverage: [
      { pageId: "home", url: "https://clinic.example/", homepage: true, status },
    ] }}><SiteIntegrityEvidence /></SiteIntegritySiteContext.Provider>);
    assert.equal(html, "");
  }
});


test("site integrity displays affected pages and explicitly unavailable and limited page coverage", () => {
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: siteIntegrityProjectionFixture }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const finding = selectSiteIntegrityFinding(packets)!;
  const html = renderToStaticMarkup(<SiteIntegritySiteContext.Provider value={{ findings: [finding], coverage: [
    { pageId: "home", url: "https://clinic.example/", homepage: true, status: "limited" },
    { pageId: "unavailable", url: "https://clinic.example/missing", homepage: false, status: "unavailable" },
  ] }}><SiteIntegrityEvidence /></SiteIntegritySiteContext.Provider>);
  assert.match(html, /27-point score deduction/);
  assert.match(html, /Affected pages \(1\)/);
  assert.match(html, /Capture retained for 1 of 2 scanned pages/);
  assert.match(html, /1 capture was limited/);
  assert.match(html, /1 page has unavailable evidence/);
  assert.equal((html.match(/id="site-integrity-evidence"/g) ?? []).length, 1);
});


import { HiddenLinkCodeEvidence } from "./site-integrity-evidence";
import { siteIntegrityCodeProofFixture as proof } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
test("code evidence is collapsed, escaped and explicit about sanitization and missing historical proof", () => {
  const finding = selectSiteIntegrityFinding(buildUnifiedFindingDisplayPackets({ runtimeArtifacts: {siteIntegrity: siteIntegrityProjectionFixture}, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() }))!;
  const old = renderToStaticMarkup(<HiddenLinkCodeEvidence finding={finding} domain="pharmacy.example" />);
  assert.match(old, /Code excerpt not retained/);
  const withProof = {...finding, evidence: {...finding.evidence, observation: {...finding.evidence.observation, links: [{...finding.evidence.observation.links[0]!, codeProof: proof}]}}} as typeof finding;
  const html = renderToStaticMarkup(<HiddenLinkCodeEvidence finding={withProof} />);
  assert.match(html, /View code evidence/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /&lt;div style=/);
  assert.match(html, /bg-amber-50/);
  assert.match(html, /0 × 0px with overflow hidden/);
  assert.match(html, /Text, URL paths and unrelated attributes omitted/);
  assert.doesNotMatch(html, /<a href="https:/);
  const panel = renderToStaticMarkup(<SiteIntegrityEvidence finding={withProof} />);
  assert.match(panel, /View code evidence/);
});
