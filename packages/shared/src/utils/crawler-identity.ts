const DEFAULT_CRAWLER_NAME = "SignalScannerBot";
const DEFAULT_CRAWLER_PUBLIC_URL = "https://scanner.example";

function getConfiguredCrawler() {
  const publicUrl = process.env.SCANNER_CRAWLER_PUBLIC_URL?.trim() || null;
  const configuredName = process.env.SCANNER_CRAWLER_NAME?.trim() || null;

  if (publicUrl) {
    return {
      name: configuredName || DEFAULT_CRAWLER_NAME,
      publicUrl
    };
  }

  return {
    name: DEFAULT_CRAWLER_NAME,
    publicUrl: DEFAULT_CRAWLER_PUBLIC_URL
  };
}

export function getCrawlerProductToken() {
  return getConfiguredCrawler().name;
}

export function getCrawlerPublicUrl() {
  return getConfiguredCrawler().publicUrl;
}

export function getCrawlerUserAgent() {
  const crawler = getConfiguredCrawler();
  return `${crawler.name}/1.0 (+${crawler.publicUrl})`;
}
