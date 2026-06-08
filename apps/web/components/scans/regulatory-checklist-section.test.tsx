import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RegulatoryChecklistSection } from "./regulatory-checklist-section";

function renderTabs(includeAdminOnlyTabs: boolean, includeEuAiAct = false) {
  const tabs = [
    {
      content: createElement("div", null, "California checklist"),
      id: "california-privacy",
      label: "CCPA/CPRA+CIPA",
      shortLabel: "CCPA/CPRA+CIPA"
    },
    {
      content: createElement("div", null, "GDPR checklist"),
      id: "gdpr-eprivacy",
      label: "GDPR / ePrivacy",
      shortLabel: "GDPR/ePrivacy"
    },
    {
      badgeLabel: "Alpha",
      content: createElement("div", null, "EU AI Act checklist"),
      id: "eu-ai-act",
      label: "EU AI Act",
      shortLabel: "EU AI Act"
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
      (includeEuAiAct && tab.id === "eu-ai-act") ||
      tab.id === "gdpr-eprivacy" ||
      tab.id === "california-privacy"
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
  assert.match(html, /Regulatory Review/);
  assert.match(html, /Privacy-law applicability context/);
  assert.match(html, /Applicability can depend on business facts or visitor geography CertScore has not verified/);
  assert.match(html, /Expand all/);
  assert.match(html, /CCPA\/CPRA\+CIPA/);
  assert.ok(html.indexOf("Expand all") < indexOfTabLabel(html, "CCPA/CPRA+CIPA"));
  assert.ok(indexOfTabLabel(html, "CCPA/CPRA+CIPA") < indexOfTabLabel(html, "GDPR/ePrivacy"));
  assert.doesNotMatch(html, /Alpha/);
  assert.doesNotMatch(html, /FTC/);
  assert.doesNotMatch(html, /UK GDPR \/ PECR/);
  assert.doesNotMatch(html, />More</);
});

test("RegulatoryChecklistSection can render all checklist options for admin viewers", () => {
  const html = renderTabs(true);

  assert.match(html, /GDPR\/ePrivacy/);
  assert.match(html, /Regulatory Review/);
  assert.match(html, /Privacy-law applicability context/);
  assert.match(html, /Applicability can depend on business facts or visitor geography CertScore has not verified/);
  assert.match(html, /Expand all/);
  assert.match(html, /CCPA\/CPRA\+CIPA/);
  assert.ok(html.indexOf("Expand all") < indexOfTabLabel(html, "CCPA/CPRA+CIPA"));
  assert.ok(indexOfTabLabel(html, "CCPA/CPRA+CIPA") < indexOfTabLabel(html, "GDPR/ePrivacy"));
  assert.match(html, /FTC/);
  assert.match(html, /UK GDPR \/ PECR/);
  assert.match(html, />More</);
});

test("RegulatoryChecklistSection renders an Alpha pill for the EU AI Act tab", () => {
  const html = renderTabs(false, true);

  assert.match(html, /EU AI Act/);
  assert.match(html, /Alpha/);
  assert.ok(indexOfTabLabel(html, "CCPA/CPRA+CIPA") < indexOfTabLabel(html, "GDPR/ePrivacy"));
  assert.ok(indexOfTabLabel(html, "GDPR/ePrivacy") < indexOfTabLabel(html, "EU AI Act"));
});

test("RegulatoryChecklistSection renders tab badges inside the More menu", () => {
  const html = renderToStaticMarkup(createElement(RegulatoryChecklistSection, {
    tabs: [
      {
        badgeLabel: "Alpha",
        content: createElement("div", null, "EU AI Act checklist"),
        group: "europe_uk" as const,
        id: "eu-ai-act",
        label: "EU AI Act",
        shortLabel: "EU AI Act"
      },
      {
        content: createElement("div", null, "California checklist"),
        id: "california-privacy",
        label: "CCPA/CPRA+CIPA",
        shortLabel: "CCPA/CPRA+CIPA"
      }
    ]
  }));

  assert.match(html, /More:/);
  assert.match(html, /EU AI Act/);
  assert.match(html, /Alpha/);
});
