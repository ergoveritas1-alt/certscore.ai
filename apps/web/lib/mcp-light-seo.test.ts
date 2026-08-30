import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import robots from "../app/robots";
import sitemap from "../app/sitemap";

const guideUrl = "https://certscore.ai/guides/mcp-website-privacy-scanner";

test("MCP Light technical guide is exposed across owned discovery surfaces", () => {
  assert.ok(sitemap().some((entry) => entry.url === guideUrl));

  const rules = robots().rules;
  const normalizedRules = Array.isArray(rules) ? rules : [rules];
  const allowed = normalizedRules.flatMap((rule) => Array.isArray(rule.allow) ? rule.allow : rule.allow ? [rule.allow] : []);
  assert.ok(allowed.includes("/mcp/light"));

  for (const path of ["apps/web/public/llms.txt", "apps/web/public/llms-full.txt"]) {
    assert.match(readFileSync(path, "utf8"), new RegExp(guideUrl.replaceAll(".", "\\.")));
  }
});

test("MCP Light guide and contextual links preserve evidence and legal boundaries", () => {
  const guide = readFileSync("apps/web/app/guides/mcp-website-privacy-scanner/page.tsx", "utf8");
  const lightPage = readFileSync("apps/web/app/mcp/light/page.tsx", "utf8");
  const cookieSolution = readFileSync("apps/web/app/solutions/cookie-consent-scanner/page.tsx", "utf8");
  const policySolution = readFileSync("apps/web/app/solutions/privacy-policy-risk-scanner/page.tsx", "utf8");

  assert.match(guide, /25 of 25 cases/);
  assert.match(guide, /p95 of 4\.896 seconds/);
  assert.match(guide, /not a service-level guarantee/);
  assert.match(guide, /only when an eligible scan confirms a deterministic refusal action/);
  assert.match(guide, /not legal advice, certification, or a compliance determination/);
  assert.match(lightPage, /identifier: "ai\.certscore\/mcp-light"/);
  assert.match(lightPage, /"Reject Path"/);
  assert.match(cookieSolution, /href: "\/mcp\/light"/);
  assert.match(policySolution, /href: "\/mcp\/light"/);
});
