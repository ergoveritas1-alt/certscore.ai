import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { CMS_ASSET_PATTERNS, siteMetadataSchema, WORDPRESS_RELEASE, wordpressFeedGeneratorVersion, type SiteMetadata, type CmsVersionEvidence } from "@certscore/contracts";
import { proxyFetch } from "./proxy-fetch";

/** One existing document read. No requests, clicks or renderer waits. */
export async function readDocumentSiteMetadata(page: Page, documentIdentity: () => { token?: string } | undefined = () => undefined): Promise<SiteMetadata | null> {
  const url = page.url();
  const identity = documentIdentity();
  const metadata = await page.evaluate((assetPatterns) => {
    const elements = Array.from(document.querySelectorAll('script[src],link[href]')).slice(0, 500);
    const assets = elements.flatMap(el => {
      try {
        const asset = new URL(el.getAttribute("src") || el.getAttribute("href") || "", document.baseURI);
        return asset.origin === location.origin && !asset.username && !asset.password ? [asset] : [];
      } catch { return []; }
    });
    const release = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})(?:\.(?:0|[1-9]\d{0,5}))?$/;
    const sourceUrl = new URL(location.href || document.baseURI); sourceUrl.search = ""; sourceUrl.hash = "";
    const versionEvidence: CmsVersionEvidence[] = [];
    // Bound traversal as well as retained output; inspect comments, not arbitrary body text.
    if (typeof document.createTreeWalker === "function") {
      const walker = document.createTreeWalker(document, 128 /* SHOW_COMMENT */);
      for (let count = 0; count < 500; count++) {
        const node = walker.nextNode(); if (!node) break;
        const value = (node.nodeValue || "").trim();
        const match = /^generator\s*=\s*["']WordPress\/([\d.]+)["']$/i.exec(value);
        if (match && release.test(match[1]!) && value.length <= 160 && sourceUrl.href.length <= 512 && versionEvidence.length < 4)
          versionEvidence.push({ kind: "html_generator_comment", version: match[1]!, value, sourceUrl: sourceUrl.href });
      }
    }
    for (const asset of assets) {
      if (!/^\/wp-includes\/js\/(?:wp-emoji-release|wp-embed)\.min\.js$/.test(asset.pathname)) continue;
      const versions = asset.searchParams.getAll("ver");
      if (versions.length !== 1 || !release.test(versions[0]!)) continue;
      const safeUrl = new URL(asset.href); safeUrl.search = ""; safeUrl.hash = "";
      if (safeUrl.href.length > 512 || versionEvidence.length >= 7) continue;
      versionEvidence.push({ kind: "core_asset_version", version: versions[0]!, value: versions[0]!, sourceUrl: safeUrl.href });
    }
    const feedLinks = Array.from(document.querySelectorAll('link[rel~="alternate"][href]')).slice(0, 50).flatMap(el => {
      if (!/^application\/(?:rss|atom)\+xml$/i.test(el.getAttribute("type") || "")) return [];
      try {
        const feed = new URL(el.getAttribute("href") || "", document.baseURI);
        if (feed.origin !== location.origin || !/^https?:$/.test(feed.protocol) || feed.username || feed.password || feed.search || feed.hash || feed.href.length > 512) return [];
        return [feed.href];
      } catch { return []; }
    }).slice(0, 1);
    return {
      contractVersion: "certscore.site-metadata.v1" as const,
      title: document.title.slice(0, 240),
      language: (document.documentElement.lang.trim() || document.querySelector('meta[http-equiv="content-language" i]')?.getAttribute("content")?.split(",")[0]?.trim() || document.querySelector('meta[property="og:locale" i]')?.getAttribute("content")?.replaceAll("_", "-") || "").slice(0, 35),
      generators: Array.from(document.querySelectorAll('meta[name="generator" i]')).slice(0, 8).map(el => (el.getAttribute("content") || "").trim().slice(0, 160)).filter(Boolean),
      cmsAssets: assets.filter(asset => assetPatterns.some(pattern => new RegExp(pattern, "i").test(asset.pathname))).flatMap(asset => {
        const safeUrl = new URL(asset.href); safeUrl.search = ""; safeUrl.hash = "";
        return safeUrl.href.length <= 512 ? [safeUrl.href] : [];
      }).filter((value, index, all) => all.indexOf(value) === index).slice(0, 6),
      wordpressAssetObserved: assets.some(asset => /^\/(?:wp-content|wp-includes)\//.test(asset.pathname)),
      versionEvidence, feedLinks,
    };
  }, Object.values(CMS_ASSET_PATTERNS)).catch(() => null);
  if (page.url() !== url || identity?.token !== documentIdentity()?.token) return null;
  const parsed = siteMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}

/** Restrict interpretation to the feed header, excluding items, comments and doctypes. */
export function readWordpressFeedGenerator(body: string): { value: string; version: string } | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) return null;
  const xml = body.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/^\s*<\?xml[^?]*\?>/, "").trim();
  if (/<!\[CDATA\[/i.test(xml)) return null;
  const rss = /^<rss(?:\s[^<>]*)?>\s*<channel(?:\s[^<>]*)?>([\s\S]*)<\/channel>\s*<\/rss>$/.exec(xml);
  const atom = /^<feed\s[^<>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["'][^<>]*>([\s\S]*)<\/feed>$/.exec(xml);
  const header = (rss?.[1] ?? atom?.[1])?.split(rss ? /<item(?:\s|\/?>)/ : /<entry(?:\s|\/?>)/)[0];
  if (!header) return null;
  // Nested or escaped generator-like content is not a root/channel declaration.
  const candidates = [...header.matchAll(/<generator(?:\s[^<>]*)?>[^<>]*<\/generator>/g)];
  if (candidates.length !== 1) return null;
  const value = candidates[0]![0];
  if (!body.includes(value)) return null;
  const prefix = header.slice(0, candidates[0]!.index);
  const opens = [...prefix.matchAll(/<(?!\/|!|\?)([\w:-]+)\b[^<>]*>/g)].filter(row => !row[0].endsWith("/>"));
  const closes = [...prefix.matchAll(/<\/([\w:-]+)\s*>/g)];
  if (opens.length !== closes.length) return null;
  const version = wordpressFeedGeneratorVersion(value);
  return version ? { value, version } : null;
}

export function needsWordpressFeed(metadata: SiteMetadata): boolean {
  if (!metadata.wordpressAssetObserved && !metadata.generators.some(value => /^WordPress(?=$|[\s/])/i.test(value))) return false;
  const declaredVersion = metadata.generators.some(value => /^WordPress(?: CMS)?[\s/]+(?:v(?:ersion)?\s*)?[0-9]/i.test(value));
  // Any declaration (including a conflicting/partial one) must not be repaired by a feed.
  return !declaredVersion && !(metadata.versionEvidence ?? []).some(row => row.kind === "html_generator_comment");
}

/** One cookie-free, same-origin, page-linked request. No redirects/retries or deadline extension. */
export async function captureWordpressFeedVersion(input: {
  metadata: SiteMetadata; documentUrl: string; deadlineAtMs: number; signal?: AbortSignal;
  headers?: Record<string, string>; fetchImpl?: typeof proxyFetch;
}): Promise<CmsVersionEvidence | null> {
  const { metadata } = input;
  if (!needsWordpressFeed(metadata) || input.signal?.aborted) return null;
  const feed = metadata.feedLinks?.[0];
  const documentUrl = new URL(input.documentUrl);
  if (input.documentUrl.length > 512 || !feed || new URL(feed).origin !== documentUrl.origin || documentUrl.username || documentUrl.password) return null;
  const target = new URL(feed);
  if (!/^https?:$/.test(target.protocol) || target.search || target.hash || target.username || target.password) return null;
  const budget = Math.min(1_000, input.deadlineAtMs - Date.now());
  if (budget < 50) return null;
  const controller = new AbortController();
  const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const aborted = new Promise<null>(resolve => {
    signal.addEventListener("abort", () => resolve(null), { once: true });
    timer = setTimeout(() => controller.abort(), budget);
  });
  const attempt = (async (): Promise<CmsVersionEvidence | null> => {
    const response = await (input.fetchImpl ?? proxyFetch)(feed, {
      method: "GET", redirect: "manual", credentials: "omit", signal,
      headers: { ...Object.fromEntries(Object.entries(input.headers ?? {}).filter(([name]) => /^(?:user-agent|accept-language)$/i.test(name))), Accept: "application/rss+xml, application/atom+xml" },
    });
    if (response.status !== 200 || (response.url && response.url !== feed) || !/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length") ?? 0) > 262_144) {
      void response.body?.cancel().catch(() => {}); return null;
    }
    const reader = response.body?.getReader(); if (!reader) return null;
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (!signal.aborted) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length; if (size > 262_144) return null;
        chunks.push(chunk.value);
      }
      if (signal.aborted) return null;
      const bytes = Buffer.concat(chunks);
      const generator = readWordpressFeedGenerator(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!generator || !WORDPRESS_RELEASE.test(generator.version)) return null;
      documentUrl.search = ""; documentUrl.hash = "";
      return { kind: "feed_generator", ...generator, sourceUrl: feed, linkedFrom: documentUrl.href, bodySha256: createHash("sha256").update(bytes).digest("hex") };
    } finally { signal.removeEventListener("abort", cancel); cancel(); }
  })().catch(() => null);
  try { return await Promise.race([attempt, aborted]); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
