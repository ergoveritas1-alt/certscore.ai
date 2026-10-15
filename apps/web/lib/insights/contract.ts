import { createHash } from "node:crypto";
import { z } from "zod";

export const INSIGHTS_PREFIX = "public-insights/";
export const INSIGHTS_LIVE_KEY = `${INSIGHTS_PREFIX}live.json`;
export const INSIGHTS_ORIGIN = "https://certscore.ai";
export const LEGACY_INSIGHT_PATHS = [
  "/insights/session-replay-study-2026",
  "/insights/common-cookie-consent-issues",
  "/insights/common-privacy-policy-gaps"
] as const;
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const pagePath = z.string().regex(/^\/insights\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((value) => value !== "/insights/assets" && !LEGACY_INSIGHT_PATHS.includes(value as typeof LEGACY_INSIGHT_PATHS[number]));
export const assetPath = z.string().refine((value) =>
  value === "/images/ai-leaderboard-social-card.png" || /^\/insights\/assets\/[a-z0-9][a-z0-9.-]*\.(png|jpg|jpeg|webp|gif)$/.test(value));
const artifact = z.object({
  key: z.string().regex(/^public-insights\/objects\/[a-f0-9]{64}\.(html|png|jpg|jpeg|webp|gif)$/),
  sha256: hash,
  bytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  contentType: z.enum(["text/html; charset=utf-8", "image/png", "image/jpeg", "image/webp", "image/gif"])
}).strict().refine((item) => item.key.split("/").pop()?.startsWith(`${item.sha256}.`), "Object key must match its content hash");
export const pageMetadata = z.object({
  path: pagePath,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  datePublished: date,
  dateModified: date
}).strict();
export const insightsManifestSchema = z.object({
  version: z.literal(1),
  release: z.string().regex(/^[a-f0-9]{40}$/),
  publishedAt: z.string().datetime({ offset: true }),
  pages: z.array(pageMetadata.extend({ artifact })).max(200),
  assets: z.array(z.object({ path: assetPath, artifact }).strict()).max(500)
}).strict().superRefine((manifest, ctx) => {
  const paths = [...manifest.pages, ...manifest.assets].map((item) => item.path);
  if (new Set(paths).size !== paths.length) ctx.addIssue({ code: "custom", message: "Duplicate public path" });
  for (const page of manifest.pages) {
    if (page.artifact.contentType !== "text/html; charset=utf-8" || page.artifact.bytes > MAX_DOCUMENT_BYTES) {
      ctx.addIssue({ code: "custom", message: "Invalid document artifact" });
    }
  }
  if (manifest.assets.some((asset) => asset.artifact.contentType.startsWith("text/"))) {
    ctx.addIssue({ code: "custom", message: "Assets cannot contain HTML" });
  }
});
export type InsightsManifest = z.infer<typeof insightsManifestSchema>;
export type InsightPage = InsightsManifest["pages"][number];
export type InsightArtifact = InsightPage["artifact"];
export function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function verifyArtifact(bytes: Uint8Array, artifact: InsightArtifact) {
  if (bytes.byteLength !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error("Insights artifact integrity check failed");
}

// Static articles need no executable JavaScript. Metadata remains in their HTML.
export function validateInsightHtml(html: string, path: string) {
  if (Buffer.byteLength(html) > MAX_DOCUMENT_BYTES || !/^<!doctype html>/i.test(html.trimStart()) || !/<\/html>\s*$/i.test(html)) throw new Error("Expected a complete bounded HTML document");
  if (html.includes("\u2014") || /&#(?:8212|x2014);|&mdash;/i.test(html)) throw new Error("Insights copy must not contain em dashes");
  if (/\son[a-z]+\s*=|javascript\s*:|<iframe\b|<base\b|<object\b|<embed\b/i.test(html)) throw new Error("Static Insights must not contain executable embeds or handlers");
  const canonicals = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/gi)];
  if (canonicals.length !== 1 || canonicals[0]?.[1] !== `${INSIGHTS_ORIGIN}${path}`) throw new Error("Incorrect canonical URL");
  for (const tag of ["description", "og:title", "og:description", "og:image", "og:type", "og:url", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    const matches = [...html.matchAll(new RegExp(`<meta\\b[^>]*(?:name|property)="${tag}"[^>]*content="([^"]+)"[^>]*>`, "gi"))];
    if (matches.length !== 1) throw new Error(`Missing or duplicate metadata: ${tag}`);
    if (["og:image", "twitter:image"].includes(tag) && !matches[0]?.[1]?.startsWith(`${INSIGHTS_ORIGIN}/`)) throw new Error("Social images must use the public CertScore origin");
    if (tag === "og:url" && matches[0]?.[1] !== `${INSIGHTS_ORIGIN}${path}`) throw new Error("Incorrect Open Graph URL");
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/^\s*type="application\/ld\+json"\s*$/.test(match[1] ?? "")) throw new Error("Only JSON-LD scripts are allowed");
    JSON.parse(match[2] ?? "");
  }
  const stripped = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  if (/<script\b/i.test(stripped)) throw new Error("Malformed script element");
}
