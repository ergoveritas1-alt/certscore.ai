import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { GET as getReleaseFeed } from "../app/releases/feed.xml/route";
import {
  createReleaseArticleSchema,
  createReleaseMetadata,
  getPublishedRelease,
  getPublishedReleases,
  releasePath
} from "./releases";
import { CERTSCORE_LINKEDIN_URL, CERTSCORE_X_URL, getCertScoreSocialProfiles } from "./social";

const release = getPublishedRelease("mcp-light");
const choicePathRelease = getPublishedRelease("accept-and-reject-path-testing");

test("published releases include choice-path testing and MCP Light", () => {
  assert.ok(release);
  assert.ok(choicePathRelease);
  assert.equal(release.headline, "CertScore.ai MCP Light is now available");
  assert.equal(release.primaryCta.href, "/mcp/light");
  assert.deepEqual(getPublishedReleases().map((item) => item.slug), ["accept-and-reject-path-testing", "mcp-light"]);
  assert.equal(getPublishedRelease("mcp-light-reject-path"), null);

  const copy = JSON.stringify(release);
  for (const tool of ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]) {
    assert.match(copy, new RegExp(tool));
  }
  assert.doesNotMatch(copy, /tests what happens after a user rejects cookies/i);

  const choicePathCopy = JSON.stringify(choicePathRelease);
  assert.match(choicePathCopy, /score-neutral comparison baseline/i);
  assert.match(choicePathCopy, /limited coverage is not a pass/i);
  assert.match(choicePathCopy, /GDPR\/ePrivacy/);
  assert.match(choicePathCopy, /CCPA\/CPRA/);
  assert.doesNotMatch(choicePathRelease.headline, /GPC/i);
});

test("release metadata provides canonical, Open Graph, and X card fields", () => {
  assert.ok(release);
  const metadata = JSON.parse(JSON.stringify(createReleaseMetadata(release))) as Record<string, any>;

  assert.equal(metadata.alternates.canonical, "https://certscore.ai/releases/mcp-light");
  assert.equal(metadata.openGraph.url, "https://certscore.ai/releases/mcp-light");
  assert.equal(metadata.openGraph.type, "article");
  assert.equal(metadata.openGraph.publishedTime, "2026-08-26");
  assert.equal(metadata.openGraph.images[0].url, "https://certscore.ai/images/releases/mcp-light-social-card.png");
  assert.equal(metadata.openGraph.images[0].width, 1200);
  assert.equal(metadata.openGraph.images[0].height, 630);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.deepEqual(metadata.twitter.images, ["https://certscore.ai/images/releases/mcp-light-social-card.png"]);
});

test("release Article JSON-LD is structurally complete and serializable", () => {
  assert.ok(release);
  const schema = JSON.parse(JSON.stringify(createReleaseArticleSchema(release))) as Record<string, any>;

  assert.equal(schema["@type"], "Article");
  assert.equal(schema.headline, release.headline);
  assert.equal(schema.datePublished, release.publicationDate);
  assert.equal(schema.mainEntityOfPage["@id"], "https://certscore.ai/releases/mcp-light");
  assert.equal(schema.publisher.name, "CertScore.ai");
  assert.equal(schema.publisher.logo.url, "https://certscore.ai/certscore-header-logo.png");
  assert.equal(schema.image, "https://certscore.ai/images/releases/mcp-light-social-card.png");
});

test("release discovery is data-driven across sitemap, robots, feed, and llms.txt", async () => {
  assert.ok(release);
  const sitemapUrls = sitemap().map((entry) => entry.url);
  assert.ok(sitemapUrls.includes("https://certscore.ai/releases"));
  assert.ok(sitemapUrls.includes(`https://certscore.ai${releasePath(release)}`));
  assert.ok(choicePathRelease);
  assert.ok(sitemapUrls.includes(`https://certscore.ai${releasePath(choicePathRelease)}`));
  assert.ok(!sitemapUrls.includes("https://certscore.ai/releases/mcp-light-reject-path"));

  const robotsRules = robots().rules;
  const normalizedRules = Array.isArray(robotsRules) ? robotsRules : [robotsRules];
  const allowRules = normalizedRules.flatMap((rule) => {
    const allow = rule.allow;
    return Array.isArray(allow) ? allow : allow ? [allow] : [];
  });
  assert.ok(allowRules.includes("/releases"));
  assert.ok(allowRules.includes("/releases/"));

  const feedResponse = getReleaseFeed();
  assert.equal(feedResponse.status, 200);
  assert.match(feedResponse.headers.get("content-type") ?? "", /^application\/rss\+xml/);
  const feed = await feedResponse.text();
  assert.match(feed, /<title>CertScore\.ai Releases<\/title>/);
  assert.match(feed, /https:\/\/certscore\.ai\/releases\/mcp-light/);
  assert.match(feed, /https:\/\/certscore\.ai\/releases\/accept-and-reject-path-testing/);
  assert.doesNotMatch(feed, /mcp-light-reject-path/);

  const llms = readFileSync("apps/web/public/llms.txt", "utf8");
  assert.match(llms, /https:\/\/certscore\.ai\/releases$/m);
  assert.match(llms, /https:\/\/certscore\.ai\/releases\/mcp-light$/m);
  assert.match(llms, /https:\/\/certscore\.ai\/releases\/feed\.xml$/m);
});

test("release links appear in the global shell, homepage, and MCP pages", () => {
  const header = readFileSync("apps/web/components/layout/site-header.tsx", "utf8");
  const footer = readFileSync("apps/web/components/layout/site-footer.tsx", "utf8");
  const homepage = readFileSync("apps/web/app/(marketing)/page.tsx", "utf8");
  const lightPage = readFileSync("apps/web/app/mcp/light/page.tsx", "utf8");
  const developerPage = readFileSync("apps/web/app/developers/mcp/page.tsx", "utf8");

  assert.match(header, /href: "\/releases", label: "Releases"/);
  assert.match(footer, /href: "\/releases", label: "Releases"/);
  assert.match(homepage, /Latest from CertScore\.ai/);
  assert.match(homepage, /View all releases/);
  assert.match(lightPage, /href="\/releases\/mcp-light"/);
  assert.match(developerPage, /href="\/releases\/mcp-light"/);
});

test("the release social card is a 1200 by 630 PNG", () => {
  const png = readFileSync("apps/web/public/images/releases/mcp-light-social-card.png");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test("social profiles expose the confirmed LinkedIn and X URLs and validate optional LinkedIn overrides", () => {
  const previousLinkedInUrl = process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL;
  try {
    delete process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL;
    assert.deepEqual(getCertScoreSocialProfiles(), [
      { label: "LinkedIn", url: CERTSCORE_LINKEDIN_URL },
      { label: "X", url: CERTSCORE_X_URL }
    ]);

    process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL = "https://www.linkedin.com/in/not-a-company";
    assert.deepEqual(getCertScoreSocialProfiles(), [
      { label: "LinkedIn", url: CERTSCORE_LINKEDIN_URL },
      { label: "X", url: CERTSCORE_X_URL }
    ]);

    process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL = "https://www.linkedin.com/company/certscore-ai/";
    assert.deepEqual(getCertScoreSocialProfiles(), [
      { label: "LinkedIn", url: "https://www.linkedin.com/company/certscore-ai" },
      { label: "X", url: CERTSCORE_X_URL }
    ]);
  } finally {
    if (previousLinkedInUrl === undefined) {
      delete process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL;
    } else {
      process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL = previousLinkedInUrl;
    }
  }
});
