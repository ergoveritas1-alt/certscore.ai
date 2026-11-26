import type { Browser, BrowserContext, BrowserContextOptions, CDPSession, Page } from "playwright";
import { installConsentActionDiscovery, type ConsentActionDiscovery } from "./consent-action-discovery";
import { chromiumContextOptions } from "./playwright-runtime";
import { installPostRefusalStorageWriteProbe } from "./post-refusal-storage-write-probe";
import { installPublicNetworkGuardRoute } from "./public-network-guard";
import { installWebBotAuthRoute } from "./web-bot-auth-routing";

type BlankConsentPage = { context: BrowserContext; page: Page };
type ConsentAction = "accept" | "reject";

export type DeferredConsentProof<Proof> = {
  parentDispatchSha256: string;
  take: (signal: AbortSignal) => Promise<Proof>;
};

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
  openContext: (options: BrowserContextOptions) => Promise<BrowserContext> = options => browser.newContext(options),
): Promise<PreparedConsentActionPage> {
  const context = await openContext({ ...chromiumContextOptions(), ignoreHTTPSErrors: false });
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

/** Allocate distinct passive, Accept, and Reject contexts on one process.
 * Eligibility stays in the caller. Only blank context setup is serialized. */
export function shareConsentActionBrowser(ready: Promise<Browser>) {
  const reserved = new Set<"passive" | ConsentAction>();
  const contexts = new Set<BrowserContext>();
  let setup: Promise<void> = Promise.resolve();
  async function prepareSlot<T>(
    lane: "passive" | ConsentAction,
    signal: AbortSignal | undefined,
    open: (browser: Browser, newContext: (options: BrowserContextOptions) => Promise<BrowserContext>) => Promise<T>,
  ) {
    signal?.throwIfAborted();
    if (reserved.has(lane)) throw new Error("Consent browser context already reserved.");
    reserved.add(lane);
    const prepared = setup.then(async () => {
      const browser = await ready;
      signal?.throwIfAborted();
      if (!browser.isConnected() || browser.contexts().some(context => !contexts.has(context))) {
        throw new Error("Consent browser has an unowned context.");
      }
      let owned: BrowserContext | undefined;
      try {
        const result = await open(browser, async options => {
          if (owned) throw new Error("Consent browser context already opened.");
          owned = await browser.newContext(options);
          contexts.add(owned);
          return owned;
        });
        signal?.throwIfAborted();
        return result;
      } catch (error) {
        await owned?.close().catch(() => undefined);
        throw error;
      }
    });
    setup = prepared.then(() => undefined, () => undefined);
    return prepared;
  }
  return {
    openPassiveContext(options: BrowserContextOptions, signal?: AbortSignal) {
      return prepareSlot("passive", signal, (_browser, openContext) => openContext(options));
    },
    prepare(action: ConsentAction, needsPublicNetworkGuard: boolean, signal?: AbortSignal) {
      return prepareSlot(action, signal, async (browser, openContext) => {
        const page = await openConsentActionPage(browser, needsPublicNetworkGuard, action, true, openContext);
        sharedActionPages.set(page, action);
        return page;
      });
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
