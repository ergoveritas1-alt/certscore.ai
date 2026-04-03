import { chromium } from "playwright";
import { PlaywrightLocalRuntime } from "./playwrightLocal";

export class PlaywrightRemoteCdpRuntime extends PlaywrightLocalRuntime {
  protected async createBrowserContext() {
    const endpoint = this.options.remoteCdpWsEndpoint;
    if (!endpoint) {
      throw new Error("REMOTE_CDP_WS_ENDPOINT is required for playwright-remote-cdp mode.");
    }

    const browser = await chromium.connectOverCDP(endpoint);
    let context = await browser.newContext(this.browserContextOptions()).catch(() => null);
    if (!context) {
      context = browser.contexts()[0] ?? null;
      if (context) {
        await Promise.all(context.pages().map((page) => page.close().catch(() => undefined))).catch(() => undefined);
      }
    }

    if (!context) {
      throw new Error("No browser context was available over the remote CDP connection.");
    }

    if (this.options.userAgent) {
      await context.setExtraHTTPHeaders({ "User-Agent": this.options.userAgent }).catch(() => undefined);
    }
    await context.clearCookies().catch(() => undefined);
    return { browser, context };
  }
}
