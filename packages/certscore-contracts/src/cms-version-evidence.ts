import { z } from "zod";

export const WORDPRESS_RELEASE = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})(?:\.(?:0|[1-9]\d{0,5}))?$/;
export const WORDPRESS_CORE_VERSION_ASSET = /^\/wp-includes\/js\/(?:wp-emoji-release|wp-embed)\.min\.js$/;
const sourceUrl = z.string().url().max(512).refine(value => {
  const url = new URL(value);
  return /^https?:$/.test(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
});

export function wordpressCommentVersion(value: string): string | null {
  const match = /^\s*generator\s*=\s*["']WordPress\/([\d.]+)["']\s*$/i.exec(value);
  return match && WORDPRESS_RELEASE.test(match[1]!) ? match[1]! : null;
}

/** Recognize only WordPress's documented RSS/Atom generator declarations. */
export function wordpressFeedGeneratorVersion(value: string): string | null {
  const rss = /^<generator>\s*https:\/\/wordpress\.org\/\?v=([\d.]+)\s*<\/generator>$/i.exec(value);
  if (rss && WORDPRESS_RELEASE.test(rss[1]!)) return rss[1]!;
  const atom = /^<generator\s+([^<>]+)>\s*WordPress\s*<\/generator>$/i.exec(value);
  if (!atom) return null;
  const attributes = [...atom[1]!.matchAll(/([a-z]+)\s*=\s*(["'])(.*?)\2/gi)];
  if (attributes.length !== 2 || atom[1]!.replace(/([a-z]+)\s*=\s*(["'])(.*?)\2/gi, "").trim()) return null;
  const entries = new Map(attributes.map(row => [row[1]!.toLowerCase(), row[3]!]));
  const version = entries.get("version");
  return entries.get("uri") === "https://wordpress.org/" && version && WORDPRESS_RELEASE.test(version) ? version : null;
}

export const cmsVersionEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("html_generator_comment"), version: z.string().regex(WORDPRESS_RELEASE), value: z.string().max(160), sourceUrl }).strict(),
  z.object({ kind: z.literal("core_asset_version"), version: z.string().regex(WORDPRESS_RELEASE), value: z.string().max(32), sourceUrl }).strict(),
  z.object({ kind: z.literal("feed_generator"), version: z.string().regex(WORDPRESS_RELEASE), value: z.string().max(256), sourceUrl,
    linkedFrom: sourceUrl, bodySha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]).superRefine((row, ctx) => {
  const valid = row.kind === "html_generator_comment" ? wordpressCommentVersion(row.value) === row.version
    : row.kind === "core_asset_version" ? row.value === row.version && WORDPRESS_CORE_VERSION_ASSET.test(new URL(row.sourceUrl).pathname)
    : wordpressFeedGeneratorVersion(row.value) === row.version && new URL(row.sourceUrl).origin === new URL(row.linkedFrom).origin;
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CMS version evidence must reproduce the retained declaration" });
});
export type CmsVersionEvidence = z.infer<typeof cmsVersionEvidenceSchema>;
