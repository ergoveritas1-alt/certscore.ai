import test from "node:test";
import assert from "node:assert/strict";
import { prepareInsightsRelease } from "../../scripts/insights-publish-plan";
import { INSIGHTS_LIVE_KEY } from "../../lib/insights/contract";
import { createInsightsReader, insightResponse } from "./reader";

const plan = prepareInsightsRelease("content/insights", "a".repeat(40), "2026-10-14T00:00:00Z");
const page = plan.manifest.pages[0]!;
function reader(transform?: (key: string, bytes: Buffer) => Buffer) {
  return createInsightsReader(async (key, max) => {
    const bytes = key === INSIGHTS_LIVE_KEY ? Buffer.from(JSON.stringify(plan.manifest)) : plan.objects.get(key)?.bytes;
    assert(bytes); assert(bytes.length <= max);
    return transform?.(key, bytes) ?? bytes;
  });
}
test("serves retained HTML and original image at their unchanged URLs", async () => {
  for (const entry of [...plan.manifest.pages, ...plan.manifest.assets]) {
    const response = await insightResponse(reader(), entry.path, new Request(`https://certscore.ai${entry.path}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-insights-content-sha256"), entry.artifact.sha256);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), plan.objects.get(entry.artifact.key)!.bytes);
  }
});
test("never turns visitor paths into arbitrary S3 reads", async () => {
  const keys: string[] = [];
  const isolated = createInsightsReader(async (key) => { keys.push(key); return Buffer.from(JSON.stringify(plan.manifest)); });
  const result = await insightResponse(isolated, "/insights/../../private-evidence", new Request("https://certscore.ai"));
  assert.equal(result.status, 404); assert.deepEqual(keys, [INSIGHTS_LIVE_KEY]);
});
test("missing storage and tampered artifacts fail closed, without caching errors", async () => {
  for (const broken of [createInsightsReader(async () => { throw new Error("Unavailable"); }), reader((key, bytes) => key === INSIGHTS_LIVE_KEY ? bytes : Buffer.from("tampered"))]) {
    const response = await insightResponse(broken, page.path, new Request("https://certscore.ai"));
    assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
test("conditional requests retain the active release identity", async () => {
  const response = await insightResponse(reader(), page.path, new Request("https://certscore.ai", { headers: { "if-none-match": `"${page.artifact.sha256}"` } }));
  assert.equal(response.status, 304); assert.equal(response.headers.get("x-insights-release"), plan.manifest.release);
});
test("a new activation is visible to the next request without restarting the reader", async () => {
  let live = plan.manifest;
  const active = createInsightsReader(async (key) => key === INSIGHTS_LIVE_KEY ? Buffer.from(JSON.stringify(live)) : plan.objects.get(key)!.bytes);
  assert.equal((await active.manifest()).release, "a".repeat(40));
  live = { ...live, release: "b".repeat(40) };
  assert.equal((await active.manifest()).release, "b".repeat(40));
});
