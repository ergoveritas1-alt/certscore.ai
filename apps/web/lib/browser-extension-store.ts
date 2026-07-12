import "server-only";

const CHROME_WEB_STORE_ORIGIN = "https://chromewebstore.google.com";

export function getCertScoreChromeExtensionStoreUrl() {
  const configuredUrl = process.env.CERTSCORE_CHROME_EXTENSION_STORE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    const url = new URL(configuredUrl);
    if (url.origin !== CHROME_WEB_STORE_ORIGIN || !url.pathname.startsWith("/detail/")) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
