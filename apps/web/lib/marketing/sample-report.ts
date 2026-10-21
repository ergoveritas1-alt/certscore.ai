export function resolveSampleReport(input: { nodeEnv?: string; appUrl?: string; localScanId?: string }) {
  const localScanId = input.localScanId?.trim();
  if (input.nodeEnv === "development" && input.appUrl === "http://localhost:3000"
    && localScanId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localScanId)) {
    return {
      scanId: localScanId,
      targetUrl: "https://ergoveritas.com/test1.html",
      url: `/scan/${localScanId}`
    };
  }
  const scanId = "bfbe7f5b-d46f-438e-a898-411e44d2571b";
  return {
    scanId,
    targetUrl: "https://ergoveritas.com/test1.html",
    url: `https://certscore.ai/scan/${scanId}`
  };
}

const sampleReport = resolveSampleReport({
  nodeEnv: process.env.NODE_ENV,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  localScanId: process.env.NEXT_PUBLIC_LOCAL_SAMPLE_REPORT_SCAN_ID
});

export const AUTHENTIC_SAMPLE_REPORT_SCAN_ID = sampleReport.scanId;
export const AUTHENTIC_SAMPLE_REPORT_TARGET_URL = sampleReport.targetUrl;
export const AUTHENTIC_SAMPLE_REPORT_URL = sampleReport.url;
