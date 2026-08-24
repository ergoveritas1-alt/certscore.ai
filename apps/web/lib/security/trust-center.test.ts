import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";

const pageSource = readFileSync(new URL("../../app/trust/page.tsx", import.meta.url), "utf8");
const footerSource = readFileSync(new URL("../../components/layout/site-footer.tsx", import.meta.url), "utf8");
const llmsSource = readFileSync(new URL("../../public/llms.txt", import.meta.url), "utf8");
const llmsFullSource = readFileSync(new URL("../../public/llms-full.txt", import.meta.url), "utf8");
const discoverySource = readFileSync(new URL("../../app/.well-known/certscore-ai.json/route.ts", import.meta.url), "utf8");

test("trust page publishes conservative assurance and reporting language", () => {
  assert.match(pageSource, /does not represent a third-party certification or legal compliance determination/);
  assert.match(pageSource, /not currently representing this service as SOC 2, ISO 27001, FedRAMP/);
  assert.match(pageSource, /security@certscore\.ai/);
  assert.match(pageSource, /href="\/security"/);
  assert.doesNotMatch(pageSource, /AES-256|certified compliant|independently audited|penetration test/i);
});

test("trust page is present on public discovery surfaces", () => {
  assert.ok(sitemap().some((entry) => entry.url === "https://certscore.ai/trust"));
  const publicRules = robots().rules;
  assert.ok(Array.isArray(publicRules));
  assert.ok(publicRules.some((rule) => Array.isArray(rule.allow) && rule.allow.includes("/trust")));
  assert.match(footerSource, /href: "\/trust", label: "Trust & Security"/);
  assert.match(llmsSource, /https:\/\/certscore\.ai\/trust/);
  assert.match(llmsFullSource, /https:\/\/certscore\.ai\/trust/);
  assert.match(discoverySource, /trustUrl: "https:\/\/certscore\.ai\/trust"/);
});
