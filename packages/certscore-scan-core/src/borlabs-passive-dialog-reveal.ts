import type { Page } from "playwright";

/** Borlabs v3 may defer its first layer until a scroll. Reveal that configured
 * surface through ordinary viewport observation, without choosing consent,
 * calling a CMP mutator, dispatching a key, or extending the capture window. */
export async function revealBorlabsDeferredDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const target = window as unknown as {
      borlabsCookieConfig?: { settings?: { dialogShowDialog?: boolean; dialogShowDialogAfterUserInteraction?: boolean } };
      BorlabsCookie?: { Consents?: { hasConsent?: unknown } };
    };
    const settings = target.borlabsCookieConfig?.settings;
    if (settings?.dialogShowDialog !== true || settings.dialogShowDialogAfterUserInteraction !== true ||
      typeof target.BorlabsCookie?.Consents?.hasConsent !== "function") return false;
    const max = (document.scrollingElement?.scrollHeight ?? 0) - innerHeight;
    if (max < 1) return false;
    scrollTo({ top: scrollY < max ? scrollY + 1 : scrollY - 1, left: scrollX, behavior: "instant" });
    return true;
  }).catch(() => false);
}
