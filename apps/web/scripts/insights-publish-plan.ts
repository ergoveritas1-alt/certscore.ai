import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { assetPath, pageMetadata, INSIGHTS_PREFIX, insightsManifestSchema, sha256, validateInsightHtml, type InsightsManifest } from "../lib/insights/contract";

const catalogSchema = z.object({
  pages: z.array(pageMetadata.extend({ file: z.string() }).strict()).min(1),
  assets: z.array(z.object({ path: assetPath, file: z.string(), contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]) }).strict())
}).strict();

export function prepareInsightsRelease(source: string, release: string, publishedAt: string) {
  const root = realpathSync(source);
  const read = (file: string) => {
    const resolved = realpathSync(path.resolve(root, file));
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Content source escaped its directory");
    return readFileSync(resolved);
  };
  const catalog = catalogSchema.parse(JSON.parse(read("catalog.json").toString("utf8")));
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const artifact = (file: string, extension: string, contentType: InsightsManifest["pages"][number]["artifact"]["contentType"]) => {
    const bytes = read(file);
    const digest = sha256(bytes);
    const key = `${INSIGHTS_PREFIX}objects/${digest}.${extension}`;
    objects.set(key, { bytes, contentType });
    return { key, sha256: digest, bytes: bytes.length, contentType };
  };
  const pages = catalog.pages.map(({ file, ...metadata }) => {
    const html = read(file).toString("utf8");
    validateInsightHtml(html, metadata.path);
    return { ...metadata, artifact: artifact(file, "html", "text/html; charset=utf-8") };
  });
  const assets = catalog.assets.map(({ file, path: publicPath, contentType }) => {
    const bytes = read(file);
    const valid = contentType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : contentType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216
      : contentType === "image/gif" ? /^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid) throw new Error("Image bytes do not match the declared type");
    return { path: publicPath, artifact: artifact(file, contentType.split("/")[1]!.replace("jpeg", "jpg"), contentType) };
  });
  const manifest = insightsManifestSchema.parse({ version: 1, release, publishedAt, pages, assets });
  return { manifest, objects };
}

export type PublishStorage = {
  get(key: string): Promise<{ bytes: Uint8Array; etag: string } | null>;
  put(key: string, bytes: Uint8Array, options: { contentType: string; ifMatch?: string; ifNoneMatch?: string }): Promise<void>;
};

// All immutable objects are uploaded before a single conditional activation.
export async function activateInsightsRelease(storage: PublishStorage, manifest: InsightsManifest, objects: Map<string, { bytes: Buffer; contentType: string }>) {
  const key = `${INSIGHTS_PREFIX}live.json`;
  const previous = await storage.get(key);
  for (const [objectKey, object] of objects) {
    const existing = await storage.get(objectKey);
    if (existing) {
      if (sha256(existing.bytes) !== sha256(object.bytes)) throw new Error("Immutable object differs from source");
    } else {
      await storage.put(objectKey, object.bytes, { contentType: object.contentType, ifNoneMatch: "*" });
    }
    const retained = await storage.get(objectKey);
    if (!retained || sha256(retained.bytes) !== sha256(object.bytes)) throw new Error("Uploaded object verification failed");
  }
  const body = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  const releaseKey = `${INSIGHTS_PREFIX}releases/${manifest.release}.json`;
  const retained = await storage.get(releaseKey);
  if (retained && !Buffer.from(retained.bytes).equals(body)) throw new Error("Release already exists with different content");
  if (!retained) await storage.put(releaseKey, body, { contentType: "application/json", ifNoneMatch: "*" });
  await storage.put(key, body, { contentType: "application/json", ...(previous ? { ifMatch: previous.etag } : { ifNoneMatch: "*" }) });
  return previous;
}

export async function rollbackInsightsRelease(storage: PublishStorage, release: string) {
  if (!/^[a-f0-9]{40}$/.test(release)) throw new Error("Expected a retained release SHA");
  const current = await storage.get(`${INSIGHTS_PREFIX}live.json`);
  const previous = await storage.get(`${INSIGHTS_PREFIX}releases/${release}.json`);
  if (!current || !previous) throw new Error("Retained release not found");
  const manifest = insightsManifestSchema.parse(JSON.parse(Buffer.from(previous.bytes).toString("utf8")));
  if (manifest.release !== release) throw new Error("Retained release identity mismatch");
  for (const entry of [...manifest.pages, ...manifest.assets]) {
    const object = await storage.get(entry.artifact.key);
    if (!object || sha256(object.bytes) !== entry.artifact.sha256 || object.bytes.length !== entry.artifact.bytes) throw new Error("Rollback artifact is unavailable");
  }
  await storage.put(`${INSIGHTS_PREFIX}live.json`, previous.bytes, { contentType: "application/json", ifMatch: current.etag });
  return manifest;
}
