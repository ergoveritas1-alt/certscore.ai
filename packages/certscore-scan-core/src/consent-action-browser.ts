import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { installConsentActionDiscovery, type ConsentActionDiscovery } from "./consent-action-discovery";
import { chromiumContextOptions } from "./playwright-runtime";
import { installPostRefusalStorageWriteProbe } from "./post-refusal-storage-write-probe";
import { installPublicNetworkGuardRoute } from "./public-network-guard";
import { installWebBotAuthRoute } from "./web-bot-auth-routing";

type BlankConsentPage = { context: BrowserContext; page: Page };
type ConsentAction = "accept" | "reject";

// The mark belongs to the exact prepared object and cannot be supplied by a
// worker dispatch. It allows only separately owned contexts on this browser.
const sharedActionPages = new WeakMap<PreparedConsentActionPage, ConsentAction>();

export type PreparedConsentActionPage = BlankConsentPage & {
  browser: Browser;
  borrowedBrowser?: boolean;
  needsPublicNetworkGuard: boolean;
  rejectDiscovery?: ConsentActionDiscovery;
  rejectStorageSession?: Promise<CDPSession>;
};

export async function prepareConsentActionPage(
  browser: Browser,
  needsPublicNetworkGuard: boolean,
  action?: ConsentAction,
  borrowedBrowser = false,
): Promise<PreparedConsentActionPage> {
  if (browser.contexts().length !== 0) throw new Error("Exact action browser already has a context.");
  return openConsentActionPage(browser, needsPublicNetworkGuard, action, borrowedBrowser);
}

async function openConsentActionPage(
  browser: Browser,
  needsPublicNetworkGuard: boolean,
  action?: ConsentAction,
  borrowedBrowser = false,
): Promise<PreparedConsentActionPage> {
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
    return { browser, context, page, borrowedBrowser, needsPublicNetworkGuard, rejectDiscovery, rejectStorageSession };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

/** One fresh context per exact action, created only after passive capture
 * releases all its contexts. Only setup is serialized; observations overlap. */
export function shareConsentActionBrowser(ready: Promise<Browser>) {
  const reserved = new Set<ConsentAction>();
  const contexts = new Set<BrowserContext>();
  let setup: Promise<void> = Promise.resolve();
  return {
    async prepare(action: ConsentAction, needsPublicNetworkGuard: boolean, signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (reserved.has(action)) throw new Error("Exact action browser context already reserved.");
      reserved.add(action);
      const prepared = setup.then(async () => {
        const browser = await ready;
        signal?.throwIfAborted();
        if (!browser.isConnected() || browser.contexts().some(context => !contexts.has(context))) {
          throw new Error("Consent browser still has a passive or unowned context.");
        }
        const page = await openConsentActionPage(browser, needsPublicNetworkGuard, action, true);
        contexts.add(page.context);
        if (signal?.aborted) {
          await page.context.close().catch(() => undefined);
          signal.throwIfAborted();
        }
        sharedActionPages.set(page, action);
        return page;
      });
      setup = prepared.then(() => undefined, () => undefined);
      return prepared;
    },
  };
}

export function takePreparedConsentActionPage(
  prepared: PreparedConsentActionPage,
  needsPublicNetworkGuard: boolean,
  action?: ConsentAction,
): BlankConsentPage {
  const { browser, context, page } = prepared;
  const owner = sharedActionPages.get(prepared);
  const contexts = browser.contexts();
  const ownsContext = owner === undefined
    ? contexts.length === 1 && contexts[0] === context
    : owner === action && contexts.includes(context);
  if (!browser.isConnected() || !ownsContext ||
      context.pages().length !== 1 || context.pages()[0] !== page || page.isClosed() ||
      page.url() !== "about:blank" || page.frames().length !== 1 ||
      prepared.needsPublicNetworkGuard !== needsPublicNetworkGuard) {
    throw new Error("Exact action browser page is not a blank page with the required guards.");
  }
  return { context, page };
}
