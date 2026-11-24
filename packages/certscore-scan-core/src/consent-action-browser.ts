import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { installConsentActionDiscovery, type ConsentActionDiscovery } from "./consent-action-discovery";
import { chromiumContextOptions } from "./playwright-runtime";
import { installPostRefusalStorageWriteProbe } from "./post-refusal-storage-write-probe";
import { installPublicNetworkGuardRoute } from "./public-network-guard";
import { installWebBotAuthRoute } from "./web-bot-auth-routing";

type BlankConsentPage = { context: BrowserContext; page: Page };

export type PreparedConsentActionPage = BlankConsentPage & {
  browser: Browser;
  needsPublicNetworkGuard: boolean;
  rejectDiscovery?: ConsentActionDiscovery;
  rejectStorageSession?: Promise<CDPSession>;
};

export async function prepareConsentActionPage(
  browser: Browser,
  needsPublicNetworkGuard: boolean,
  action?: "accept" | "reject",
): Promise<PreparedConsentActionPage> {
  if (browser.contexts().length !== 0) throw new Error("Exact action browser already has a context.");
  const context = await browser.newContext({ ...chromiumContextOptions(), ignoreHTTPSErrors: false });
  try {
    await installWebBotAuthRoute(context);
    if (needsPublicNetworkGuard) await installPublicNetworkGuardRoute(context);
    const page = await context.newPage();
    let rejectDiscovery: ConsentActionDiscovery | undefined;
    let rejectStorageSession: Promise<CDPSession> | undefined;
    if (action === "reject") {
      rejectStorageSession = context.newCDPSession(page);
      // The ordinary storage collector handles unsupported CDP exactly as before.
      void rejectStorageSession.catch(() => undefined);
      // These blank-page hooks have no target access. Prepare them while the
      // handler validates the URL, before the worker can navigate.
      [rejectDiscovery] = await Promise.all([
        installConsentActionDiscovery(page),
        installPostRefusalStorageWriteProbe(page),
      ]);
    }
    return { browser, context, page, needsPublicNetworkGuard, rejectDiscovery, rejectStorageSession };
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
