import { createBrowser, runAxe, shouldContinueRuntimeWait } from "@website-signal-risk-scanner/scan-core";

function withTimeout<T>(label: string, ms: number, promise: Promise<T>) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);
}

async function main() {
  const url = process.argv[2]?.trim();

  if (!url) {
    throw new Error("Usage: debug-accessibility-page.ts <url>");
  }

  const browserHandle = await createBrowser();
  const page = await browserHandle.context.newPage();
  const startedAt = Date.now();
  let inflightRequests = 0;
  let lastNetworkActivityAt = Date.now();

  page.on("request", () => {
    inflightRequests += 1;
    lastNetworkActivityAt = Date.now();
  });

  const markRequestCompleted = () => {
    inflightRequests = Math.max(0, inflightRequests - 1);
    lastNetworkActivityAt = Date.now();
  };

  page.on("requestfinished", markRequestCompleted);
  page.on("requestfailed", markRequestCompleted);

  try {
    page.setDefaultNavigationTimeout(20_000);
    page.setDefaultTimeout(20_000);

    console.log(JSON.stringify({ step: "launch", elapsedMs: Date.now() - startedAt }));

    await withTimeout(
      "goto",
      30_000,
      page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000
      })
    );

    console.log(
      JSON.stringify({
        step: "goto",
        elapsedMs: Date.now() - startedAt,
        finalUrl: page.url(),
        inflightRequests
      })
    );

    await withTimeout("postload-wait", 5_000, page.waitForTimeout(1_000));

    console.log(
      JSON.stringify({
        step: "postload-wait",
        elapsedMs: Date.now() - startedAt,
        inflightRequests
      })
    );

    const stabilityStartedAt = Date.now();
    const stabilityMaxWaitMs = 2_000;
    const minWaitMs = Math.min(500, stabilityMaxWaitMs);
    const quietWindowMs = stabilityMaxWaitMs >= 1_800 ? 700 : 500;

    while (true) {
      const now = Date.now();
      const bodyText = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").toLowerCase() ?? "");
      const bannerDetected = /cookie|consent|privacy choices|your privacy/.test(bodyText);
      const elapsedMs = now - stabilityStartedAt;
      const shouldContinue = shouldContinueRuntimeWait({
        bannerDetected,
        elapsedMs,
        inflightRequests,
        lastActivityElapsedMs: now - lastNetworkActivityAt,
        maxWaitMs: stabilityMaxWaitMs,
        minWaitMs,
        quietWindowMs
      });

      if (!shouldContinue) {
        console.log(
          JSON.stringify({
            step: "runtime-stability",
            elapsedMs: Date.now() - startedAt,
            stabilityElapsedMs: elapsedMs,
            inflightRequests,
            lastActivityElapsedMs: now - lastNetworkActivityAt
          })
        );
        break;
      }

      await page.waitForTimeout(100);
    }

    const axeResults = await withTimeout("axe", 30_000, runAxe(page));

    console.log(
      JSON.stringify({
        step: "axe",
        elapsedMs: Date.now() - startedAt,
        violationCount: axeResults.violations.length,
        incompleteCount: axeResults.incomplete.length
      })
    );
  } finally {
    await page.close().catch(() => undefined);
    await browserHandle.context.close().catch(() => undefined);
    await browserHandle.browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
