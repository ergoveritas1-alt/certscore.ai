import assert from "node:assert/strict";
import test from "node:test";
import { GET, SECURITY_TEXT } from "../../app/.well-known/security.txt/route";
import sitemap from "../../app/sitemap";

test("security.txt publishes the canonical security policy contact", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.text(), SECURITY_TEXT);
  assert.match(SECURITY_TEXT, /^Contact: mailto:security@certscore\.ai$/m);
  assert.match(SECURITY_TEXT, /^Contact: https:\/\/certscore\.ai\/security$/m);
  assert.match(SECURITY_TEXT, /^Canonical: https:\/\/certscore\.ai\/\.well-known\/security\.txt$/m);
  assert.match(SECURITY_TEXT, /^Expires: 2027-08-23T23:59:59\.000Z$/m);
});

test("security policy is included in the public sitemap", () => {
  assert.ok(sitemap().some((entry) => entry.url === "https://certscore.ai/security"));
});
