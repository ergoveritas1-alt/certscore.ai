import sitemap from "../app/sitemap";
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, INDEXNOW_KEY_LOCATION } from "../lib/indexnow";
import { SITE_URL } from "../lib/seo";

const urls = sitemap().map((entry) => entry.url);
const chunkSize = 100;

async function submitChunk(urlList: string[]) {
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`IndexNow submit failed with HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const chunks: string[][] = [];

  for (let index = 0; index < urls.length; index += chunkSize) {
    chunks.push(urls.slice(index, index + chunkSize));
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          endpoint: INDEXNOW_ENDPOINT,
          keyLocation: INDEXNOW_KEY_LOCATION,
          urlCount: urls.length,
          chunks: chunks.length,
          sample: urls.slice(0, 5)
        },
        null,
        2
      )
    );
    return;
  }

  for (const chunk of chunks) {
    await submitChunk(chunk);
  }

  console.log(`Submitted ${urls.length} URLs to IndexNow in ${chunks.length} batch${chunks.length === 1 ? "" : "es"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

