import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const canaryRoot = path.join(workspaceRoot, "infra/aws/ergoveritas-canary/post-refusal");

test("owned post-refusal canaries retain one deterministic reject control and TCF confirmation", async () => {
  const [honored, ignored, runtime] = await Promise.all([
    readFile(path.join(canaryRoot, "reject-honored.html"), "utf8"),
    readFile(path.join(canaryRoot, "reject-ignored.html"), "utf8"),
    readFile(path.join(canaryRoot, "post-refusal-runtime.js"), "utf8"),
  ]);

  for (const page of [honored, ignored]) {
    assert.match(page, /id="onetrust-reject-all-handler"/);
    assert.equal((page.match(/id="onetrust-reject-all-handler"/g) ?? []).length, 1);
    assert.doesNotMatch(page, /data-consent-intent="accept"|>Accept all<|>Manage preferences</);
  }
  assert.match(runtime, /window\.__tcfapi/);
  assert.match(runtime, /eventStatus: "useractioncomplete"/);
  assert.match(runtime, /purpose: \{ consents: denied \}/);
  assert.match(runtime, /www\.google-analytics\.com\/g\/collect/);
});

test("owned post-refusal manifest is reject-only and exact-target scoped", async () => {
  const manifest = JSON.parse(await readFile(
    path.join(workspaceRoot, "docs/certscore-v2/post-refusal-owned-live-canaries.json"),
    "utf8",
  )) as {
    consentInteractionAllowed?: boolean;
    interactionPolicy?: Record<string, unknown>;
    targets?: Array<{ url?: string }>;
  };
  assert.equal(manifest.consentInteractionAllowed, true);
  assert.equal(manifest.interactionPolicy?.action, "reject_only");
  assert.equal(manifest.interactionPolicy?.authorizedHostname, "ergoveritas.com");
  assert.deepEqual(manifest.interactionPolicy?.authorizedAlternateExactTargets, [
    "https://www.ergoveritas.com/testar1.html",
    "https://www.ergoveritas.com/testar2.html",
  ]);
  assert.equal(manifest.targets?.every((target) => {
    if (!target.url) return false;
    const url = new URL(target.url);
    return url.protocol === "https:" &&
      url.hostname === "ergoveritas.com" &&
      !url.search &&
      !url.hash;
  }), true);
});
