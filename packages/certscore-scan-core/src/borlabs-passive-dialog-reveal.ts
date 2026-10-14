import type { Page } from "playwright";

/** Runs in the document, both at registered lifecycle checkpoints and during
 * existing inventory reads. The marker is document-local, never visitor state. */
function revealInDocument(exactTargetUrl?: string): boolean {
  if (window !== window.top || (exactTargetUrl && location.href !== exactTargetUrl)) return false;
  const target = window as unknown as {
    __certscoreBorlabsPassiveReveal?: boolean;
    borlabsCookieConfig?: { settings?: { dialogShowDialog?: boolean; dialogShowDialogAfterUserInteraction?: boolean } };
    BorlabsCookie?: { Consents?: { hasConsent?: unknown } };
  };
  const settings = target.borlabsCookieConfig?.settings;
  if (settings?.dialogShowDialog !== true || settings.dialogShowDialogAfterUserInteraction !== true ||
    typeof target.BorlabsCookie?.Consents?.hasConsent !== "function") return false;
  if (target.__certscoreBorlabsPassiveReveal) return true;
  const max = (document.scrollingElement?.scrollHeight ?? 0) - innerHeight;
  if (max < 1) return false;
  scrollTo({ top: scrollY < max ? scrollY + 1 : scrollY - 1, left: scrollX, behavior: "instant" });
  target.__certscoreBorlabsPassiveReveal = true;
  return true;
}

/** Observe the configured interaction-deferred dialog as soon as the CMP is
 * ready, overlapping navigation rather than waiting for screenshots/quiet time.
 * Each existing lifecycle event schedules at most one frame; no polling, added
 * wait, synthetic consent event, CMP mutation, or user-activation override. */
export async function installBorlabsDeferredDialogReveal(page: Page, exactTargetUrl?: string): Promise<void> {
  await page.addInitScript({ content: `(() => {
    const reveal = ${revealInDocument.toString()};
    const targetUrl = ${JSON.stringify(exactTargetUrl ?? null)};
    let scheduled = false;
    const checkpoint = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; reveal(targetUrl || undefined); });
    };
    window.addEventListener('borlabs-cookie-after-init', checkpoint, { once: true });
    document.addEventListener('DOMContentLoaded', checkpoint, { once: true });
    window.addEventListener('load', checkpoint, { once: true });
  })();` });
}

/** Existing bounded inventory fallback for already-loaded documents. */
export async function revealBorlabsDeferredDialog(page: Page): Promise<boolean> {
  return page.evaluate(revealInDocument, undefined).catch(() => false);
}
