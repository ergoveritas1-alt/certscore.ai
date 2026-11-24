import type { Browser, BrowserContext, Page } from "playwright";
import { chromiumContextOptions } from "./playwright-runtime";
import { installPublicNetworkGuardRoute } from "./public-network-guard";
import { installWebBotAuthRoute } from "./web-bot-auth-routing";

type BlankConsentPage = { context: BrowserContext; page: Page };

export type PreparedConsentActionPage = BlankConsentPage & {
  browser: Browser;
  needsPublicNetworkGuard: boolean;
};

export async function prepareConsentActionPage(
  browser: Browser,
  needsPublicNetworkGuard: boolean,
): Promise<PreparedConsentActionPage> {
  if (browser.contexts().length !== 0) throw new Error("Exact action browser already has a context.");
  const context = await browser.newContext({ ...chromiumContextOptions(), ignoreHTTPSErrors: false });
  try {
    await installWebBotAuthRoute(context);
    if (needsPublicNetworkGuard) await installPublicNetworkGuardRoute(context);
    const page = await context.newPage();
    return { browser, context, page, needsPublicNetworkGuard };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

export function takePreparedConsentActionPage(
  prepared: PreparedConsentActionPage,
  needsPublicNetworkGuard: boolean,
): BlankConsentPage {
  const { browser, context, page } = prepared;
  if (!browser.isConnected() || browser.contexts().length !== 1 || browser.contexts()[0] !== context ||
      context.pages().length !== 1 || context.pages()[0] !== page || page.isClosed() ||
      page.url() !== "about:blank" || page.frames().length !== 1 ||
      prepared.needsPublicNetworkGuard !== needsPublicNetworkGuard) {
    throw new Error("Exact action browser page is not a blank page with the required guards.");
  }
  return { context, page };
}
