import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Builder, Browser, logging } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import { cookieCheckpointsWithin, finalizeResult, writeSupportFile } from "../core/capture";
import type { RuntimeHarnessContext } from "../core/capture";
import type { CookieRecord, RuntimeOptions, RuntimeRunResult, UnifiedRuntime } from "../core/types";

type PerformanceEvent = {
  method: string;
  params?: Record<string, unknown>;
};

function toCookieRecord(cookie: Awaited<ReturnType<ReturnType<typeof Builder.prototype.build>["manage"]["getCookies"]>>[number]): CookieRecord {
  return {
    domain: cookie.domain ?? null,
    expires: typeof cookie.expiry === "number" ? cookie.expiry : null,
    httpOnly: cookie.httpOnly ?? null,
    name: cookie.name,
    path: cookie.path ?? null,
    sameSite: cookie.sameSite ?? null,
    secure: cookie.secure ?? null,
    valuePreview: cookie.value.slice(0, 120)
  };
}

export class SeleniumChromeRuntime implements UnifiedRuntime {
  private driver: any = null;
  private seenPerformanceMessages = new Set<string>();

  constructor(private readonly harness: RuntimeHarnessContext, private readonly options: RuntimeOptions) {}

  async init() {
    const prefs = new logging.Preferences();
    prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
    prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL);

    const options = new chrome.Options();
    options.addArguments("--headless=new", "--disable-gpu", "--window-size=1440,1600");
    options.setLoggingPrefs(prefs);
    options.set("goog:perfLoggingPrefs", {
      enableNetwork: true,
      enablePage: true
    });

    this.driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();
  }

  private async drainLogs() {
    if (!this.driver) {
      return;
    }

    const [performanceLogs, browserLogs] = await Promise.all([
      this.driver.manage().logs().get(logging.Type.PERFORMANCE).catch(() => []),
      this.driver.manage().logs().get(logging.Type.BROWSER).catch(() => [])
    ]);

    for (const entry of browserLogs) {
      this.harness.addConsoleMessage({
        level: entry.level.name.toLowerCase().includes("warn")
          ? "warning"
          : entry.level.name.toLowerCase().includes("severe")
            ? "error"
            : "log",
        text: entry.message
      });
    }

    for (const entry of performanceLogs) {
      if (this.seenPerformanceMessages.has(entry.message)) {
        continue;
      }
      this.seenPerformanceMessages.add(entry.message);
      const parsed = JSON.parse(entry.message) as { message?: PerformanceEvent };
      const message = parsed.message;
      if (!message) {
        continue;
      }
      const params = message.params ?? {};
      if (message.method === "Page.domContentEventFired") {
        this.harness.markDomContentLoaded();
      }
      if (message.method === "Network.requestWillBeSent") {
        const request = params.request as { method?: string; url?: string } | undefined;
        const initiatorType = (params.initiator as { type?: string } | undefined)?.type ?? null;
        const frameId = typeof params.frameId === "string" ? params.frameId : null;
        if (request?.url) {
          this.harness.addRequest({
            frameUrl: frameId,
            id: typeof params.requestId === "string" ? params.requestId : request.url,
            initiatorType,
            initiatorUrl: typeof params.documentURL === "string" ? params.documentURL : frameId,
            method: request.method ?? "GET",
            resourceType: typeof params.type === "string" ? params.type.toLowerCase() : initiatorType,
            url: request.url
          });
        }
        const redirectResponse = params.redirectResponse as { status?: number; url?: string } | undefined;
        if (redirectResponse?.url && request?.url) {
          this.harness.addRedirect({
            from: redirectResponse.url,
            status: typeof redirectResponse.status === "number" ? redirectResponse.status : null,
            to: request.url
          });
        }
      }
      if (message.method === "Network.responseReceived") {
        const response = params.response as { headers?: Record<string, string>; status?: number; url?: string } | undefined;
        if (response?.url) {
          const headers = response.headers ?? null;
          const setCookie = headers
            ? Object.entries(headers)
                .filter(([key]) => key.toLowerCase() === "set-cookie")
                .map(([, value]) => value)
            : null;
          this.harness.addResponse({
            frameUrl: typeof params.frameId === "string" ? params.frameId : null,
            headers,
            requestId: typeof params.requestId === "string" ? params.requestId : null,
            resourceType: typeof params.type === "string" ? params.type.toLowerCase() : null,
            setCookieHeaders: setCookie,
            status: typeof response.status === "number" ? response.status : null,
            url: response.url
          });
          if ((params.type as string | undefined)?.toLowerCase() === "document") {
            this.harness.markMainDocument({
              headers,
              setCookieHeaders: setCookie,
              status: typeof response.status === "number" ? response.status : null,
              url: response.url
            });
          }
        }
      }
    }
  }

  async navigate(url: string) {
    if (!this.driver) {
      throw new Error("Driver not initialized.");
    }

    try {
      await this.driver.get(url);
      this.harness.markNavigationOutcome("ok");
      this.harness.markFinalUrl(await this.driver.getCurrentUrl().catch(() => null));
      this.harness.markTitle(await this.driver.getTitle().catch(() => null));
      await this.drainLogs();
    } catch (error) {
      this.harness.markNavigationOutcome(error instanceof Error && /timeout/i.test(error.message) ? "timeout" : "error");
      this.harness.addError(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async observe(ms: number) {
    if (!this.driver) {
      throw new Error("Driver not initialized.");
    }

    const started = Date.now();
    const checkpoints = cookieCheckpointsWithin(ms);
    let checkpointIndex = 0;

    while (Date.now() - started < ms) {
      await this.drainLogs();
      if (checkpointIndex < checkpoints.length && Date.now() - started >= checkpoints[checkpointIndex]!.ms) {
        const cookies = await this.driver.manage().getCookies().catch(() => []);
        this.harness.addCookieSnapshot(checkpoints[checkpointIndex]!.label, cookies.map(toCookieRecord));
        checkpointIndex += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async snapshot(): Promise<RuntimeRunResult> {
    if (!this.driver) {
      throw new Error("Driver not initialized.");
    }

    await this.drainLogs();
    await mkdir(this.harness.outputDir, { recursive: true });
    const htmlPath = path.join(this.harness.outputDir, "page.html");
    const screenshotPath = path.join(this.harness.outputDir, "page.png");

    const [source, bodyText, title, finalUrl, cookies, screenshot] = await Promise.all([
      this.driver.getPageSource().catch(() => null),
      this.driver.executeScript("return document.body ? document.body.innerText.slice(0, 10240) : null;").catch(() => null),
      this.driver.getTitle().catch(() => null),
      this.driver.getCurrentUrl().catch(() => null),
      this.driver.manage().getCookies().catch(() => []),
      this.driver.takeScreenshot().catch(() => null)
    ]);

    if (typeof source === "string") {
      await writeSupportFile(htmlPath, source);
      this.harness.noteHtmlSnapshotPath(htmlPath);
    }
    if (typeof screenshot === "string") {
      await writeFile(screenshotPath, screenshot, "base64");
      this.harness.noteScreenshotPath(screenshotPath);
    }

    this.harness.markFinalUrl(typeof finalUrl === "string" ? finalUrl : null);
    this.harness.markTitle(typeof title === "string" ? title : null);
    this.harness.noteBodyTextExcerpt(typeof bodyText === "string" ? bodyText : null);
    this.harness.addCookieSnapshot("final", cookies.map(toCookieRecord));

    const result = finalizeResult({
      artifacts: this.harness.artifacts,
      bodyTextExcerpt: typeof bodyText === "string" ? bodyText : null,
      finalUrl: typeof finalUrl === "string" ? finalUrl : null,
      htmlSnapshotPath: typeof source === "string" ? htmlPath : null,
      requestedUrl: this.harness.requestedUrl,
      runtimeMode: this.harness.runtimeMode,
      runtimeOptions: this.harness.runtimeOptions,
      runtimeStartedAt: this.harness.runtimeStartedAt,
      screenshotPath: typeof screenshot === "string" ? screenshotPath : null,
      title: typeof title === "string" ? title : null,
      wallTimeMs: this.harness.timeSinceStart()
    });
    if (result.classification.challengeDetected) {
      this.harness.logger.log(`[${this.harness.runtimeMode}] challenge suspected ${result.classification.stopReason}`);
    }
    this.harness.logger.log(`[${this.harness.runtimeMode}] observation window ended`);
    return { ...result, outputDir: this.harness.outputDir };
  }

  async close() {
    await this.driver?.quit().catch(() => undefined);
  }
}
