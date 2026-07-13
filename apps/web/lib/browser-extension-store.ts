import "server-only";

import { CERTSCORE_CHROME_EXTENSION_STORE_URL } from "./browser-extension";

const CHROME_WEB_STORE_LOCATIONS = [
  { origin: "https://chrome.google.com", pathnamePrefix: "/webstore/detail/" },
  { origin: "https://chromewebstore.google.com", pathnamePrefix: "/detail/" }
] as const;

function isChromeWebStoreUrl(url: URL) {
  return CHROME_WEB_STORE_LOCATIONS.some(
    (location) => url.origin === location.origin && url.pathname.startsWith(location.pathnamePrefix)
  );
}

export function getCertScoreChromeExtensionStoreUrl() {
  const configuredUrl = process.env.CERTSCORE_CHROME_EXTENSION_STORE_URL?.trim();
  if (!configuredUrl) {
    return CERTSCORE_CHROME_EXTENSION_STORE_URL;
  }

  try {
    const url = new URL(configuredUrl);
    if (!isChromeWebStoreUrl(url)) {
      return CERTSCORE_CHROME_EXTENSION_STORE_URL;
    }
    return url.toString();
  } catch {
    return CERTSCORE_CHROME_EXTENSION_STORE_URL;
  }
}
