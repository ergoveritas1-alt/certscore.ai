import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
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
