export const config = {
  apiBaseUrl: "https://certscore.ai",
  defaultScanWindowMs: 15000,
  maxEventsPerUpload: 250,
  maxScreenshotDataUrlBytes: 900000
};

export async function getApiBaseUrl() {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    return config.apiBaseUrl;
  }

  const stored = await chrome.storage.sync.get("certscoreApiBaseUrl");
  return typeof stored.certscoreApiBaseUrl === "string" && stored.certscoreApiBaseUrl.trim()
    ? stored.certscoreApiBaseUrl.trim().replace(/\/+$/, "")
    : config.apiBaseUrl;
}
