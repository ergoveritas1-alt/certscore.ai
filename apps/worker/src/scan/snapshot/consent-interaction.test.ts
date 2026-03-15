import assert from "node:assert/strict";
import test from "node:test";

test("consent interaction vendor diff logic is deterministic", async () => {
  const mod = await import("./consent-interaction");
  const difference = (mod as unknown as {
    __test?: {
      difference(left: string[], right: string[]): string[];
      intersection(left: string[], right: string[]): string[];
    };
  }).__test;

  assert.ok(difference);
  assert.deepEqual(difference?.difference(["Google Ads", "LinkedIn Insight Tag"], ["LinkedIn Insight Tag"]), ["Google Ads"]);
  assert.deepEqual(
    difference?.intersection(["Google Ads", "LinkedIn Insight Tag"], ["LinkedIn Insight Tag", "Marketo"]),
    ["LinkedIn Insight Tag"]
  );
});
