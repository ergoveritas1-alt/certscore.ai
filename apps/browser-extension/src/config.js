export const config = {
  apiBaseUrl: "https://certscore.ai",
  defaultScanWindowMs: 15000,
  maxEventsPerUpload: 250,
  maxScreenshotDataUrlBytes: 900000
};

export async function getApiBaseUrl() {
  return config.apiBaseUrl;
}
