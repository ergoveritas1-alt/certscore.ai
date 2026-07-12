export const config = {
  apiBaseUrl: "https://certscore.ai",
  defaultScanWindowMs: 15000,
  maxEventsPerUpload: 250
};

export async function getApiBaseUrl() {
  return config.apiBaseUrl;
}
