import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import robots from "../app/robots";
import { buildSitemap as sitemap } from "../app/sitemap";
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
  assert.deepEqual(getPublishedReleases().map((item) => item.slug), ["one-in-three-websites-gpc-ad-services", "privacy-policy-evidence", "session-replay-detection", "forms-capture", "mcp-hosted-oauth", "accept-and-reject-path-testing", "mcp-light"]);
  assert.equal(getPublishedRelease("mcp-light-reject-path"), null);

  const copy = JSON.stringify(release);
  for (const tool of ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]) {
    assert.match(copy, new RegExp(tool));
  }
  assert.doesNotMatch(copy, /tests what happens after a user rejects cookies/i);

  const choicePathCopy = JSON.stringify(choicePathRelease);
  assert.match(choicePathCopy, /score-neutral comparison baseline/i);
  assert.match(choicePathCopy, /limited coverage is not a pass/i);
  assert.match(choicePathCopy, /GDPR and ePrivacy/);
  assert.match(choicePathCopy, /CCPA and CPRA/);
  assert.match(choicePathRelease.shortDescription, /eligible sites/);
  assert.match(choicePathRelease.shortDescription, /confirmed Accept/);
  assert.match(choicePathRelease.shortDescription, /confirmed Reject/);
  assert.equal(choicePathRelease.seoTitle, "Cookie consent testing after Accept and Reject");
  assert.ok(choicePathRelease.metaDescription.length <= 160);
  assert.doesNotMatch(choicePathRelease.metaDescription, /CCPA|CPRA|California/);
  assert.match(choicePathCopy, /CELEX%3A02002L0058-20091219/);
  assert.match(choicePathCopy, /California Attorney General CCPA guidance/);
  assert.doesNotMatch(choicePathCopy, /CertScore(?!\.ai)/);
  assert.doesNotMatch(choicePathRelease.headline, /GPC/i);
});

test("GPC announcement keeps the tested cohort, limits, image, timeline, and scan CTA together", () => {
  const article = getPublishedRelease("one-in-three-websites-gpc-ad-services");
  assert.ok(article);
  const copy = JSON.stringify(article);
  assert.match(article.headline, /1 in 3 Websites Tested/);
  assert.equal(article.headlineTone, "quiet");
  assert.match(copy, /337 of them—33\.7%/);
  assert.match(copy, /1,000 websites scanned from California with GPC enabled/);
  assert.match(copy, /November 1–8, 2026/);
  assert.match(copy, /Disney agreed to \$2\.75 million in civil penalties/);
  assert.match(copy, /Sephora agreed to \$1\.2 million/);
  assert.match(copy, /CalPrivacy fined Tractor Supply \$1\.35 million/);
  assert.ok(article.sections.find(section => section.id === "primary-sources")?.sourceLinks?.some(link => link.href === "https://oag.ca.gov/node/556528"));
  assert.doesNotMatch(copy, /not a random sample/);
  assert.match(copy, /A visit with no such activity leaves open whether the site recognized GPC/);
  assert.doesNotMatch(article.heroImage?.caption ?? "", /The sample does not represent all websites/);
  assert.doesNotMatch(copy, /doesn’t require the setting to be switched on/);
  assert.match(copy, /Opt Me Out Act \(AB 566, Lowenthal\)/);
  assert.ok(article.sections.find(section => section.id === "primary-sources")?.sourceLinks?.some(link => link.href === "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB566"));
  assert.equal(article.sections.find(section => section.id === "browser-setting")?.image?.path, "/images/releases/gpc-2026/timeline-compact.png");
  assert.equal(article.heroImage?.path, article.socialImage.path);
  assert.equal(article.primaryCta.href, "/#homepage-scan");
  assert.equal(article.resourceLinks?.[0]?.href, "/guides/test-global-privacy-control");
  assert.equal(article.scanButtonLabel, "Scan Any Website Free");
  const metadata = createReleaseMetadata(article);
  assert.equal(metadata.title, "GPC Study: 1 in 3 Websites Contacted Ad Services");
  assert.match(metadata.description ?? "", /Global Privacy Control \(GPC\)/);
  assert.equal(metadata.alternates?.canonical, "https://certscore.ai/releases/one-in-three-websites-gpc-ad-services");
  assert.equal((metadata.openGraph?.images as { url: string }[])[0]?.url, "https://certscore.ai/images/releases/gpc-2026/hero-toggle.png");
  assert.ok(sitemap().some(entry => entry.url === metadata.alternates?.canonical));
  assert.doesNotMatch(copy, /leaking through|one in three websites ignored GPC|proved.*violat/i);
});

test("the evergreen consent guide carries AEO answers without FAQPage schema", () => {
  const guide = readFileSync("apps/web/app/guides/consent-enforcement-testing/page.tsx", "utf8");

  assert.match(guide, /What is Accept and Reject Path testing\?/);
  assert.match(guide, /Does Accept and Reject Path testing determine GDPR or CCPA compliance\?/);
  assert.match(guide, /No\. CertScore\.ai records evidence about website behavior/);
  assert.match(guide, /CELEX%3A02002L0058-20091219/);
  assert.doesNotMatch(guide, /FAQPage/);
  assert.doesNotMatch(guide, /CertScore(?!\.ai)/);
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
    assert.equal(CERTSCORE_LINKEDIN_URL, "https://www.linkedin.com/company/certscore-ai");
    assert.deepEqual(getCertScoreSocialProfiles(), [
      { label: "LinkedIn", url: CERTSCORE_LINKEDIN_URL },
      { label: "X", url: CERTSCORE_X_URL }
    ]);

    process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL = "https://www.linkedin.com/company/123334088";
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

 test("Hosted OAuth release has complete discovery, metadata and a valid share asset", async () => {
  const item = getPublishedRelease("mcp-hosted-oauth");
  assert.ok(item);
  assert.equal(item.primaryCta.href, "/developers/mcp#hosted-oauth-start");
  assert.ok(item.metaDescription.length <= 160);
  const metadata = JSON.parse(JSON.stringify(createReleaseMetadata(item)));
  assert.equal(metadata.alternates.canonical, "https://certscore.ai/releases/mcp-hosted-oauth");
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(createReleaseArticleSchema(item).headline, item.headline);
  assert.ok(sitemap().some(row => row.url === "https://certscore.ai/releases/mcp-hosted-oauth"));
  assert.match(await getReleaseFeed().text(), /releases\/mcp-hosted-oauth/);
  const png = readFileSync("apps/web/public" + item.socialImage.path);
  assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.doesNotMatch(JSON.stringify(item), /authorize once|frictionless|14 tools|pagination/i);
});

test("forms release publishes verified imagery, limitations and discovery links", async () => {
  const forms = getPublishedRelease("forms-capture");
  assert.ok(forms);
  assert.equal(forms.publicationDate, "2026-09-21");
  assert.ok(forms.metaDescription.length <= 160);
  const copy = JSON.stringify(forms);
  assert.doesNotMatch(copy, /EXAMPLE_PENDING|TODO/);
  assert.match(copy, /no privacy findings/);
  assert.match(copy, /does not fill or submit forms/);
  assert.match(copy, /verified, masked form crops when screenshot capture succeeds/);
  assert.match(copy, /The action describes its setup, not an observed data transfer/);
  assert.match(copy, /began rolling out earlier in September/);
  assert.match(copy, /63b87ff5-07c5-4c7b-895a-028ea6bb43c9/);
  const png = readFileSync(`apps/web/public${forms.socialImage.path}`);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const example = forms.sections.find(section => section.id === "verified-example")?.image;
  assert.ok(example);
  assert.ok(readFileSync(`apps/web/public${example.path}`).length > 0);
  const meta = JSON.parse(JSON.stringify(createReleaseMetadata(forms)));
  assert.equal(meta.alternates.canonical, "https://certscore.ai/releases/forms-capture");
  assert.equal(meta.twitter.card, "summary_large_image");
  assert.ok(sitemap().some(entry => entry.url === "https://certscore.ai/releases/forms-capture"));
  assert.ok(sitemap().some(entry => entry.url === "https://certscore.ai/guides/website-form-scanning"));
  assert.match(await getReleaseFeed().text(), /releases\/forms-capture/);
  for (const file of ["llms.txt", "llms-full.txt"]) {
    const text = readFileSync(`apps/web/public/${file}`, "utf8");
    assert.match(text, /releases\/forms-capture/);
    assert.match(text, /guides\/website-form-scanning/);
  }
});
