import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BetaRegulatoryChecklistCard, type BetaRegulatoryChecklistArea } from "./beta-regulatory-checklist-card";

function makeArea(overrides: Partial<BetaRegulatoryChecklistArea> = {}): BetaRegulatoryChecklistArea {
  return {
    counters: {
      checked: 0,
      gaps: 0,
      notObserved: 0,
      notTestable: 1,
      review: 0
    },
    id: "international-alpha",
    maturityLabel: "Alpha",
    navLabel: "International privacy",
    rows: [
      {
        evidenceCapability: "near_term_supported",
        id: "privacy_contact_review",
        label: "Privacy contact review",
        note: "Privacy contact review requires retained evidence before stronger status is projected.",
        status: "not_testable"
      }
    ],
    score: null,
    status: "not_testable",
    subtitle: "Public-web privacy review signals.",
    summary: "International alpha review is limited to retained public-web privacy signals.",
    title: "International privacy",
    ...overrides
  };
}

test("BetaRegulatoryChecklistCard can render an Alpha maturity label", () => {
  const html = renderToStaticMarkup(createElement(BetaRegulatoryChecklistCard, { area: makeArea() }));

  assert.match(html, /International privacy/);
  assert.match(html, /Alpha/);
  assert.match(html, /Alpha checklist rows are limited/);
  assert.doesNotMatch(html, /Beta checklist rows are limited/);
});

test("BetaRegulatoryChecklistCard renders score and status icons for summary counters", () => {
  const html = renderToStaticMarkup(createElement(BetaRegulatoryChecklistCard, {
    area: makeArea({
      counters: {
        checked: 1,
        gaps: 1,
        notObserved: 0,
        notTestable: 1,
        review: 1
      },
      rows: [
        {
          evidenceCapability: "near_term_supported",
          id: "gap",
          label: "Gap row",
          note: "Gap note.",
          status: "gap_observed"
        },
        {
          evidenceCapability: "near_term_supported",
          id: "review",
          label: "Review row",
          note: "Review note.",
          status: "review_signal"
        },
        {
          evidenceCapability: "near_term_supported",
          id: "checked",
          label: "Checked row",
          note: "Checked note.",
          status: "checked"
        },
        {
          evidenceCapability: "near_term_supported",
          id: "not-testable",
          label: "Not-testable row",
          note: "Not-testable note.",
          status: "not_testable"
        }
      ],
      score: 38,
      status: "review_recommended"
    })
  }));
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  assert.match(html, /Score:/);
  assert.match(visibleText, /38/);
  assert.match(visibleText, /1 gaps/);
  assert.match(visibleText, /1 review/);
  assert.match(visibleText, /1 checked/);
  assert.match(visibleText, /1 not testable/);
  assert.match(html, /M10 4\.2 17 16H3L10 4\.2Z/);
  assert.match(html, /M6 16V4\.8M6 5\.2h8\.5l-1\.4 3 1\.4 3H6/);
  assert.match(html, /M5 10\.4 8\.3 13\.7 15 6\.8/);
});
