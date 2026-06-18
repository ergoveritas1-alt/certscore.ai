import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RegulatoryChecklistSection } from "./regulatory-checklist-section";

function renderTabs(includeAdminOnlyTabs: boolean) {
  const tabs = [
    {
      content: createElement("div", null, "GDPR checklist"),
      id: "gdpr-eprivacy",
      label: "GDPR / ePrivacy",
      shortLabel: "GDPR/ePrivacy"
    },
    {
      badgeLabel: "Alpha",
      content: createElement("div", null, "UK checklist"),
      group: "europe_uk" as const,
      id: "uk-gdpr-pecr",
      label: "UK GDPR / PECR",
      shortLabel: "UK GDPR"
    },
    {
      content: createElement("div", null, "FTC checklist"),
      id: "ftc",
      label: "FTC",
      shortLabel: "FTC"
    },
    {
      content: createElement("div", null, "UK checklist"),
      group: "europe_uk" as const,
      id: "uk-gdpr-pecr",
      label: "UK GDPR / PECR"
    }
  ].filter(
    (tab) =>
      includeAdminOnlyTabs ||
      tab.id === "gdpr-eprivacy" ||
      tab.id === "uk-gdpr-pecr"
  );

  return renderToStaticMarkup(createElement(RegulatoryChecklistSection, {
    showAdvancedEvidenceToggle: true,
    tabs
  }));
}

function indexOfTabLabel(html: string, label: string) {
  return html.indexOf(`>${label}</span>`);
}

test("RegulatoryChecklistSection can render baseline privacy options for non-admin viewers", () => {
  const html = renderTabs(false);

  assert.match(html, /GDPR\/ePrivacy/);
  assert.match(html, /Regulatory Diagnostics/);
  assert.match(html, /Privacy-law applicability context/);
  assert.match(html, /Applicability can depend on business facts or visitor geography CertScore has not verified/);
  assert.match(html, /Expand all/);
  assert.doesNotMatch(html, /CCPA\/CPRA/);
  assert.ok(html.indexOf("Expand all") < indexOfTabLabel(html, "GDPR/ePrivacy"));
  assert.doesNotMatch(html, /Regulatory Review/);
  assert.match(html, /Alpha/);
  assert.doesNotMatch(html, /FTC/);
  assert.match(html, /UK GDPR/);
  assert.match(html, />More/);
});

test("RegulatoryChecklistSection can render all checklist options for admin viewers", () => {
  const html = renderTabs(true);

  assert.match(html, /GDPR\/ePrivacy/);
  assert.match(html, /Regulatory Diagnostics/);
  assert.match(html, /Privacy-law applicability context/);
  assert.match(html, /Applicability can depend on business facts or visitor geography CertScore has not verified/);
  assert.match(html, /Expand all/);
  assert.doesNotMatch(html, /CCPA\/CPRA/);
  assert.ok(html.indexOf("Expand all") < indexOfTabLabel(html, "GDPR/ePrivacy"));
  assert.doesNotMatch(html, /Regulatory Review/);
  assert.match(html, /FTC/);
  assert.match(html, /UK GDPR \/ PECR/);
  assert.match(html, />More</);
});

test("RegulatoryChecklistSection renders tab badges inside the More menu", () => {
  const html = renderToStaticMarkup(createElement(RegulatoryChecklistSection, {
    tabs: [
      {
        badgeLabel: "Alpha",
        content: createElement("div", null, "International privacy checklist"),
        group: "europe_uk" as const,
        id: "international-alpha",
        label: "International privacy",
        shortLabel: "International"
      },
      {
        content: createElement("div", null, "GDPR checklist"),
        id: "gdpr-eprivacy",
        label: "GDPR / ePrivacy",
        shortLabel: "GDPR/ePrivacy"
      }
    ]
  }));

  assert.match(html, /More:/);
  assert.match(html, /International privacy/);
  assert.match(html, /Alpha/);
});

test("RegulatoryChecklistSection omits tab controls for single-tab report sections", () => {
  const html = renderToStaticMarkup(createElement(RegulatoryChecklistSection, {
    headingLabel: "GDPR / ePrivacy Evidence Review",
    showAdvancedEvidenceToggle: true,
    tabs: [
      {
        content: createElement("div", null, "GDPR checklist"),
        id: "gdpr-eprivacy",
        label: "GDPR / ePrivacy",
        shortLabel: "GDPR/ePrivacy"
      }
    ]
  }));

  assert.match(html, /GDPR \/ ePrivacy Evidence Review/);
  assert.match(html, /GDPR checklist/);
  assert.doesNotMatch(html, /Expand all/);
  assert.doesNotMatch(html, />GDPR\/ePrivacy</);
});

test("RegulatoryChecklistSection can override the heading label", () => {
  const html = renderToStaticMarkup(createElement(RegulatoryChecklistSection, {
    headingLabel: "Regulatory Diagnostics",
    tabs: [
      {
        content: createElement("div", null, "GDPR checklist"),
        id: "gdpr-eprivacy",
        label: "GDPR / ePrivacy",
        shortLabel: "GDPR/ePrivacy"
      }
    ]
  }));

  assert.match(html, /Regulatory Diagnostics/);
  assert.doesNotMatch(html, /Regulatory Review/);
});
