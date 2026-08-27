import { getPublishedReleases, releasePath } from "../../../lib/releases";
import { absoluteUrl, SITE_NAME, SITE_URL } from "../../../lib/seo";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET() {
  const releases = getPublishedReleases();
  const latestDate = releases[0]?.modifiedDate ?? releases[0]?.publicationDate;
  const items = releases.map((release) => {
    const url = absoluteUrl(releasePath(release));
    return `    <item>
      <title>${escapeXml(release.headline)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(`${release.publicationDate}T00:00:00.000Z`).toUTCString()}</pubDate>
      <description>${escapeXml(release.shortDescription)}</description>
    </item>`;
  }).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} Releases</title>
    <link>${SITE_URL}/releases</link>
    <description>Product updates, new website privacy-detection capabilities, integrations and developer tools from ${SITE_NAME}.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/releases/feed.xml" rel="self" type="application/rss+xml" />
    ${latestDate ? `<lastBuildDate>${new Date(`${latestDate}T00:00:00.000Z`).toUTCString()}</lastBuildDate>` : ""}
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/rss+xml; charset=utf-8"
    }
  });
}
