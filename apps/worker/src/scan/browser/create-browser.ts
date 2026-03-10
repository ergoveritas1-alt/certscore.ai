import { chromium } from "playwright";

export async function createBrowser() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
  } catch (error) {
    throw new Error(
      `Failed to launch Chromium for CertScore scanning. Run pnpm --filter @website-signal-risk-scanner/worker playwright:install and verify the worker runtime can access browser binaries. ${
        error instanceof Error ? error.message : "Unknown browser launch error"
      }`
    );
  }

  const context = await browser.newContext({
    viewport: {
      width: 1366,
      height: 768
    },
    ignoreHTTPSErrors: true
  });

  return {
    browser,
    context
  };
}
