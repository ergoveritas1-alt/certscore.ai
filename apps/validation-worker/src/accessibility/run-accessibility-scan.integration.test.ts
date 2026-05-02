import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { setupRequestBlocking } from "../browser/request-blocking";
import { runAccessibilityScan } from "./run-accessibility-scan";

const TEST_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <img src="photo.jpg" />
  <button></button>
  <a href="/"></a>
  <input type="text" />
  <p style="color: #777; background: #fff;">Low contrast text</p>
</body>
</html>
`;

async function withTestPage(content: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(content);
  return { browser, context, page };
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected an ephemeral TCP server port."));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("integration: detects accessibility issues on a synthetic page", async () => {
  const { browser, context, page } = await withTestPage(TEST_HTML);

  try {
    const result = await runAccessibilityScan({
      page,
      url: "https://test.example.com/",
      scanId: "test-scan-1"
    });

    assert.ok(result.findings.length > 0, "Expected at least one finding");
    assert.ok(result.metrics.totalViolationCount > 0);
    assert.ok(result.metrics.totalAffectedNodeCount > 0);
    assert.ok(result.score.score < 100);

    const missingAlt = result.findings.find((f) => f.axeRuleId === "image-alt");
    assert.ok(missingAlt, "Expected image-alt finding");
    assert.ok(missingAlt?.severity === "high" || missingAlt?.severity === "critical", `Expected high or critical, got ${missingAlt?.severity}`);
    assert.ok(missingAlt?.evidenceSummary.includes("image"));

    const buttonName = result.findings.find((f) => f.axeRuleId === "button-name");
    assert.ok(buttonName, "Expected button-name finding");

    const linkName = result.findings.find((f) => f.axeRuleId === "link-name");
    assert.ok(linkName, "Expected link-name finding");
  } finally {
    await context.close();
    await browser.close();
  }
});

test("integration: video-only blocking preserves runtime requests and axe findings", async () => {
  const hits: Record<string, number> = {};
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    hits[pathname] = (hits[pathname] ?? 0) + 1;

    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Blocking fixture</title>
  <style>
    @font-face { font-family: FixtureFont; src: url("/font.woff2") format("woff2"); }
    body { font-family: FixtureFont, sans-serif; }
  </style>
</head>
<body>
  <img src="/photo.svg">
  <button></button>
  <a href="/target"></a>
  <video src="/movie.mp4" preload="auto" autoplay muted playsinline></video>
  <script>
    window.__fixtureScriptRan = true;
    fetch("/runtime-signal", { method: "POST", body: "ok" }).catch(() => {});
  </script>
</body>
</html>
`);
      return;
    }

    if (pathname === "/photo.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
      return;
    }

    if (pathname === "/font.woff2") {
      response.writeHead(200, { "content-type": "font/woff2" });
      response.end("");
      return;
    }

    if (pathname === "/runtime-signal") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (pathname === "/movie.mp4") {
      response.writeHead(200, { "content-type": "video/mp4" });
      response.end("video bytes should be blocked");
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ headless: true });
  try {
    const baselineContext = await browser.newContext();
    const baselinePage = await baselineContext.newPage();
    await baselinePage.goto(url, { waitUntil: "networkidle" });
    const baseline = await runAccessibilityScan({
      page: baselinePage,
      url,
      scanId: "video-blocking-baseline"
    });
    await baselineContext.close();

    const blockedContext = await browser.newContext();
    const blockedPage = await blockedContext.newPage();
    const requestBlocking = await setupRequestBlocking(blockedPage, { mode: "full" });
    await blockedPage.goto(url, { waitUntil: "networkidle" });
    const blocked = await runAccessibilityScan({
      page: blockedPage,
      url,
      scanId: "video-blocking-enabled"
    });
    const blockingStats = requestBlocking.getStats();
    const scriptRan = await blockedPage.evaluate(() => Boolean((window as Window & { __fixtureScriptRan?: boolean }).__fixtureScriptRan));
    await requestBlocking.stop();
    await blockedContext.close();

    const baselineRules = baseline.findings.map((finding) => finding.axeRuleId).sort();
    const blockedRules = blocked.findings.map((finding) => finding.axeRuleId).sort();

    assert.deepEqual(blockedRules, baselineRules);
    assert.ok(blockedRules.includes("image-alt"), "Expected image-alt to remain detectable.");
    assert.ok(blockedRules.includes("button-name"), "Expected button-name to remain detectable.");
    assert.ok(blockedRules.includes("link-name"), "Expected link-name to remain detectable.");
    assert.equal(scriptRan, true, "Expected JavaScript execution to remain enabled.");
    assert.ok((hits["/runtime-signal"] ?? 0) >= 2, "Expected fetch/XHR-style runtime signal requests to reach the server.");
    assert.ok((hits["/photo.svg"] ?? 0) >= 2, "Expected images to remain allowed.");
    assert.ok((hits["/font.woff2"] ?? 0) >= 2, "Expected fonts to remain allowed.");
    assert.ok(blockingStats.blockedCount >= 1, "Expected media/video request to be blocked.");
    assert.equal(blockingStats.blockedByType.media, blockingStats.blockedCount);
    assert.equal(hits["/movie.mp4"], 1, "Expected only the unblocked baseline pass to reach the video endpoint.");
  } finally {
    await browser.close();
    await closeServer(server);
  }
});

test("integration: clean page returns no violations and score 96", async () => {
  const cleanHtml = `
<!DOCTYPE html>
<html lang="en">
<head><title>Clean</title></head>
<body>
  <h1>Clean page</h1>
  <img src="photo.jpg" alt="A photo" />
  <button>Click me</button>
  <a href="/">Home</a>
  <label for="name">Name</label>
  <input id="name" type="text" />
</body>
</html>
`;

  const { browser, context, page } = await withTestPage(cleanHtml);

  try {
    const result = await runAccessibilityScan({
      page,
      url: "https://clean.example.com/",
      scanId: "test-scan-2"
    });

    assert.equal(result.findings.length, 0);
    assert.equal(result.score.score, 96);
    assert.equal(result.score.band, "low_risk");
    assert.equal(result.benchmarkLabel, "better_than_typical");
  } finally {
    await context.close();
    await browser.close();
  }
});

test("integration: critical ARIA issue is detected and capped", async () => {
  const ariaHtml = `
<!DOCTYPE html>
<html lang="en">
<head><title>ARIA</title></head>
<body>
  <div role="listbox">
    <span>Not a valid child</span>
  </div>
</body>
</html>
`;

  const { browser, context, page } = await withTestPage(ariaHtml);

  try {
    const result = await runAccessibilityScan({
      page,
      url: "https://aria.example.com/",
      scanId: "test-scan-3"
    });

    const ariaFinding = result.findings.find((f) => f.axeRuleId === "aria-required-children");
    assert.ok(ariaFinding, "Expected aria-required-children finding");
    assert.equal(ariaFinding?.severity, "critical");
    assert.ok(result.score.score <= 79, `Expected score <= 79, got ${result.score.score}`);
  } finally {
    await context.close();
    await browser.close();
  }
});
