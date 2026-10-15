import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { INSIGHTS_LIVE_KEY, INSIGHTS_ORIGIN, insightsManifestSchema, sha256, type InsightsManifest } from "../lib/insights/contract";
import { activateInsightsRelease, prepareInsightsRelease, rollbackInsightsRelease, type PublishStorage } from "./insights-publish-plan";

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const apply = args.includes("--apply");
const seed = args.includes("--seed-before-app-deploy");
const verifyOnly = args.includes("--verify-only");
const rollback = arg("--rollback");
const git = (...values: string[]) => execFileSync("git", values, { encoding: "utf8" }).trim();
const release = git("rev-parse", "HEAD");
const plan = prepareInsightsRelease("content/insights", release, git("show", "-s", "--format=%cI", "HEAD"));
console.log(JSON.stringify({ release, pages: plan.manifest.pages.map((p) => p.path), assets: plan.manifest.assets.map((p) => p.path), uploadedBytes: [...plan.objects.values()].reduce((n, o) => n + o.bytes.length, 0), apply, verifyOnly, rollback }));
if (!apply && !verifyOnly) process.exit(0);
if (git("status", "--porcelain")) throw new Error("Publishing requires a clean committed worktree");
const region = process.env.AWS_REGION ?? "us-west-1";
const bucket = process.env.INSIGHTS_S3_BUCKET;
if (!bucket) throw new Error("INSIGHTS_S3_BUCKET must identify the existing production S3 bucket");
const client = new S3Client({ region });
const storage: PublishStorage = {
  async get(key) {
    try {
      const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: key, MaxKeys: 1 }));
      if (!listed.Contents?.some((object) => object.Key === key)) return null;
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
      if (!result.Body || !result.ETag || !result.ContentLength || result.ContentLength > 5 * 1024 * 1024) throw new Error("Invalid retained Insights object");
      return { bytes: await result.Body.transformToByteArray(), etag: result.ETag };
    } catch (error) {
      if ((error as { name: string }).name === "NoSuchKey") return null;
      throw error;
    }
  },
  async put(key, bytes, options) {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: options.contentType,
      ServerSideEncryption: "AES256", CacheControl: "no-store", IfMatch: options.ifMatch, IfNoneMatch: options.ifNoneMatch,
      ChecksumSHA256: Buffer.from(sha256(bytes), "hex").toString("base64") }), { abortSignal: AbortSignal.timeout(15000) });
  }
};

async function fetchPublic(path: string) {
  const response = await fetch(`${INSIGHTS_ORIGIN}${path}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error(`Public verification failed: ${path} ${response.status}`);
  return response;
}
async function appVersion() {
  const version = await (await fetchPublic("/api/version")).json() as { gitSha: string; runtimeTarget: string };
  if (!/^[a-f0-9]{40}$/.test(version.gitSha) || version.runtimeTarget !== "ecs-fargate") throw new Error("Unexpected production runtime");
  return version;
}
function normalizeCloudflare(html: string) {
  const decode = (value: string) => { const b = Buffer.from(value, "hex"); return [...b.subarray(1)].map((v) => String.fromCharCode(v ^ b[0]!)).join(""); };
  return html.replace(/<a href="\/cdn-cgi\/l\/email-protection#([a-f0-9]+)"><span class="__cf_email__" data-cfemail="([a-f0-9]+)">\[email&#160;protected\]<\/span><\/a>/g, (_all, href: string, span: string) => {
    const address = decode(span);
    if (decode(href) !== address || /[<>"&]/.test(address)) throw new Error("Unexpected email transformation");
    return `<a href="mailto:${address}">${address}</a>`;
  }).replace('<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>', "");
}
async function verify(manifest: InsightsManifest) {
  for (const page of manifest.pages) {
    const response = await fetchPublic(page.path);
    if (response.headers.get("x-insights-release") !== manifest.release || response.headers.get("x-insights-content-sha256") !== page.artifact.sha256) throw new Error("Public article is not serving the activated release");
    if (sha256(normalizeCloudflare(await response.text())) !== page.artifact.sha256) throw new Error("Public article differs from retained HTML");
  }
  for (const asset of manifest.assets) {
    const response = await fetchPublic(asset.path);
    if (response.headers.get("x-insights-release") !== manifest.release || sha256(new Uint8Array(await response.arrayBuffer())) !== asset.artifact.sha256) throw new Error("Public image differs from retained asset");
  }
  const index = await (await fetchPublic("/insights")).text();
  const sitemap = await (await fetchPublic("/sitemap.xml")).text();
  if (manifest.pages.some((page) => !index.includes(page.path) || !sitemap.includes(`${INSIGHTS_ORIGIN}${page.path}`))) throw new Error("Published page missing from index or sitemap");
}

async function main() {
if (seed && await storage.get(INSIGHTS_LIVE_KEY)) throw new Error("Bootstrap seed is only allowed before the first activation");
const before = seed ? undefined : await appVersion();
let manifest: InsightsManifest;
if (verifyOnly) {
  const retained = await storage.get(INSIGHTS_LIVE_KEY);
  if (!retained) throw new Error("No published Insights release");
  manifest = insightsManifestSchema.parse(JSON.parse(Buffer.from(retained.bytes).toString("utf8")));
} else if (rollback) {
  manifest = await rollbackInsightsRelease(storage, rollback);
} else {
  await activateInsightsRelease(storage, plan.manifest, plan.objects);
  manifest = plan.manifest;
}
if (!seed) await verify(manifest);
const after = seed ? undefined : await appVersion();
if (before?.gitSha !== after?.gitSha) throw new Error("App revision changed during content publication; inspect concurrent application release");
const result = { contentRelease: manifest.release, appBefore: before, appAfter: after, appRevisionUnchanged: seed ? null : true, publicVerified: !seed, seededBeforeAppDeploy: seed, verifiedAt: new Date().toISOString() };
if (arg("--receipt")) writeFileSync(arg("--receipt")!, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));

}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
