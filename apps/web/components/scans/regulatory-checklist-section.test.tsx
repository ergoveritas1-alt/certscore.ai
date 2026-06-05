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
      shortLabel: "GDPR / ePrivacy"
    },
    {
      content: createElement("div", null, "California checklist"),
      id: "california-privacy",
      label: "CCPA/CPRA",
      shortLabel: "CCPA/CPRA"
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
  ].filter((tab) => includeAdminOnlyTabs || tab.id === "gdpr-eprivacy" || tab.id === "california-privacy");

  return renderToStaticMarkup(createElement(RegulatoryChecklistSection, {
    showAdvancedEvidenceToggle: true,
    tabs
  }));
}

test("RegulatoryChecklistSection can render baseline privacy options for non-admin viewers", () => {
  const html = renderTabs(false);

  assert.match(html, /GDPR \/ ePrivacy/);
  assert.match(html, /Regulatory Review/);
  assert.match(html, /Expand all/);
  assert.match(html, /CCPA\/CPRA/);
  assert.doesNotMatch(html, /FTC/);
  assert.doesNotMatch(html, /UK GDPR \/ PECR/);
  assert.doesNotMatch(html, />More</);
});

test("RegulatoryChecklistSection can render all checklist options for admin viewers", () => {
  const html = renderTabs(true);

  assert.match(html, /GDPR \/ ePrivacy/);
  assert.match(html, /Regulatory Review/);
  assert.match(html, /Expand all/);
  assert.match(html, /CCPA\/CPRA/);
  assert.match(html, /FTC/);
  assert.match(html, /UK GDPR \/ PECR/);
  assert.match(html, />More</);
});
