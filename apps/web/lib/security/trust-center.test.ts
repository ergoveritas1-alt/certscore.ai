import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildSitemap as sitemap } from "../../app/sitemap";
import robots from "../../app/robots";

test("retired trust page is absent from the site and public discovery surfaces", () => {
  assert.equal(existsSync(new URL("../../app/trust/page.tsx", import.meta.url)), false);
  assert.ok(!sitemap().some((entry) => entry.url === "https://certscore.ai/trust"));
  const publicRules = robots().rules;
  assert.ok(Array.isArray(publicRules));
  assert.ok(!publicRules.some((rule) => Array.isArray(rule.allow) && rule.allow.includes("/trust")));
  for (const path of [
    "../../components/layout/site-footer.tsx",
    "../../public/llms.txt",
    "../../public/llms-full.txt",
    "../../app/.well-known/certscore-ai.json/route.ts"
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /https:\/\/certscore\.ai\/trust|"\/trust"/, path);
  }
  assert.ok(existsSync(new URL("../../app/security/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../app/privacy/page.tsx", import.meta.url)));
});
