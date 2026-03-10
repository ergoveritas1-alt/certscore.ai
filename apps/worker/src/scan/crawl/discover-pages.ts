import type { Page } from "playwright";
import { isSameHostname, normalizeDiscoveredUrl, normalizeScanUrl } from "./normalize-url";
import type { RobotsPolicy } from "../robots/policy";
import { navigateWithPolicy } from "../browser/navigate-with-policy";

export type HomepageDiscoveryResult = {
  discoveredUrls: string[];
  finalUrl: string;
  homepageHttpStatus: number | null;
  homepageLoadTimeMs: number;
};

async function boundedWait(page: Page) {
  await page.waitForTimeout(1800);
}

export async function discoverPages(input: { page: Page; robotsPolicy?: RobotsPolicy | null; startUrl: string }): Promise<HomepageDiscoveryResult> {
  const navigationStartedAt = Date.now();
  const { blockedByPolicy, response } = await navigateWithPolicy({
    page: input.page,
    robotsPolicy: input.robotsPolicy,
    url: input.startUrl
  });

  if (blockedByPolicy) {
    return {
      discoveredUrls: [],
      finalUrl: normalizeScanUrl(input.startUrl),
      homepageHttpStatus: null,
      homepageLoadTimeMs: Date.now() - navigationStartedAt
    };
  }

  await boundedWait(input.page);

  const finalUrl = normalizeScanUrl(input.page.url());
  const rawHrefs = await input.page.evaluate(() => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map((element) => element.getAttribute("href") ?? "")
      .filter((href) => href.length > 0);
  });

  const discoveredUrls = rawHrefs
    .map((href) => normalizeDiscoveredUrl(href, finalUrl))
    .filter((href): href is string => href !== null)
    .filter((href) => isSameHostname(href, finalUrl));

  return {
    discoveredUrls: [...new Set(discoveredUrls)],
    finalUrl,
    homepageHttpStatus: response?.status() ?? null,
    homepageLoadTimeMs: Date.now() - navigationStartedAt
  };
}
