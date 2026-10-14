import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { activateInsightsRelease, prepareInsightsRelease, rollbackInsightsRelease, type PublishStorage } from "./insights-publish-plan";
import { INSIGHTS_LIVE_KEY, insightsManifestSchema, pagePath, validateInsightHtml } from "../lib/insights/contract";
import { buildSitemap } from "../app/sitemap";

const plan = prepareInsightsRelease("content/insights", "a".repeat(40), "2026-10-14T00:00:00Z");
const page = plan.manifest.pages[0]!;
function fixture() {
  const values = new Map<string, { bytes: Buffer; etag: string }>();
  const writes: string[] = [];
  const storage: PublishStorage = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, bytes, options) {
      const current = values.get(key);
      if (options.ifMatch && current?.etag !== options.ifMatch || options.ifNoneMatch && current) throw new Error("PreconditionFailed");
      writes.push(key); values.set(key, { bytes: Buffer.from(bytes), etag: `"${writes.length}"` });
    }
  };
  return { values, writes, storage };
}
test("activation verifies every object before switching one manifest", async () => {
  const f = fixture(); await activateInsightsRelease(f.storage, plan.manifest, plan.objects);
  assert.equal(f.writes.at(-1), INSIGHTS_LIVE_KEY);
  for (const entry of [...plan.manifest.pages, ...plan.manifest.assets]) assert(f.values.has(entry.artifact.key));
});
test("failed upload preserves the previous live release", async () => {
  const f = fixture(); const original = Buffer.from('{"original":true}'); f.values.set(INSIGHTS_LIVE_KEY, { bytes: original, etag: '"old"' });
  f.storage.put = async () => { throw new Error("Upload failed"); };
  await assert.rejects(activateInsightsRelease(f.storage, plan.manifest, plan.objects));
  assert.deepEqual(f.values.get(INSIGHTS_LIVE_KEY)!.bytes, original);
});
test("concurrent activation cannot silently overwrite a newer release", async () => {
  const f = fixture(); const put = f.storage.put;
  f.storage.put = async (key, bytes, options) => {
    if (key === INSIGHTS_LIVE_KEY) f.values.set(key, { bytes: Buffer.from("newer"), etag: '"newer"' });
    return put(key, bytes, options);
  };
  await assert.rejects(activateInsightsRelease(f.storage, plan.manifest, plan.objects), /PreconditionFailed/);
  assert.equal(f.values.get(INSIGHTS_LIVE_KEY)!.bytes.toString(), "newer");
});
test("rollback verifies retained artifacts and changes only the live pointer", async () => {
  const f = fixture(); await activateInsightsRelease(f.storage, plan.manifest, plan.objects);
  await activateInsightsRelease(f.storage, { ...plan.manifest, release: "b".repeat(40) }, plan.objects);
  const before = f.writes.length; await rollbackInsightsRelease(f.storage, plan.manifest.release);
  assert.deepEqual(f.writes.slice(before), [INSIGHTS_LIVE_KEY]);
  assert.equal(JSON.parse(f.values.get(INSIGHTS_LIVE_KEY)!.bytes.toString()).release, plan.manifest.release);
  f.values.delete(page.artifact.key);
  await assert.rejects(rollbackInsightsRelease(f.storage, plan.manifest.release), /unavailable/);
});
test("manifest rejects arbitrary evidence keys, duplicate paths and legacy route collisions", () => {
  assert.equal(insightsManifestSchema.safeParse({ ...plan.manifest, pages: [...plan.manifest.pages, page] }).success, false);
  assert.equal(insightsManifestSchema.safeParse({ ...plan.manifest, pages: [{ ...page, artifact: { ...page.artifact, key: "private-evidence/result.json" } }] }).success, false);
  assert.equal(pagePath.safeParse("/insights/session-replay-study-2026").success, false);
});
test("static validation rejects executable scripts, em dashes, wrong canonicals and malformed JSON-LD", () => {
  const html = plan.objects.get(page.artifact.key)!.bytes.toString();
  for (const bad of [html.replace("</head>", '<script>alert(1)</script></head>'), html.replace("</body>", '\u2014</body>'), html.replace('rel="canonical" href="https://certscore.ai', 'rel="canonical" href="https://wrong.example'), html.replace('"@context":', 'invalid"@context":')]) {
    assert.throws(() => validateInsightHtml(bad, page.path));
  }
});
test("content edits trigger the S3 workflow and are outside the app build inputs", () => {
  const workflow = readFileSync(".github/workflows/insights-publish.yml", "utf8");
  const appWorkflow = readFileSync(".github/workflows/web-aws-ecs-deploy.yml", "utf8");
  assert(workflow.includes('"content/insights/**"'));
  assert(!appWorkflow.includes('"content/insights/**"'));
  assert(!/docker|ecr|ecs:|deploy:web|next build/i.test(workflow));
  assert(workflow.includes("app revision"));
});
test("new manifest pages enter the sitemap without duplicate existing URLs", () => {
  const pages = [{ path: "/insights/new-static-research", dateModified: "2026-10-14" }, { path: page.path, dateModified: "2026-10-15" }];
  const sitemap = buildSitemap(pages);
  assert.equal(sitemap.filter((row) => row.url.endsWith(page.path)).length, 1);
  assert.equal(sitemap.find((row) => row.url.endsWith(page.path))?.lastModified, "2026-10-15");
  assert(sitemap.some((row) => row.url === "https://certscore.ai/insights/new-static-research"));
});
test("catalog paths cannot read a file outside the content source", () => {
  const root = mkdtempSync(path.join(tmpdir(), "insights-source-"));
  try {
    const catalog = JSON.parse(readFileSync("content/insights/catalog.json", "utf8"));
    catalog.pages[0].file = "escape.html";
    writeFileSync(path.join(root, "catalog.json"), JSON.stringify(catalog));
    symlinkSync(path.resolve("content/insights/ai-lab-privacy-leaderboard-2026.html"), path.join(root, "escape.html"));
    assert.throws(() => prepareInsightsRelease(root, "a".repeat(40), "2026-10-14T00:00:00Z"), /escaped/);
  } finally { rmSync(root, { recursive: true }); }
});
