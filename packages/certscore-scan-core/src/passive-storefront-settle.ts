import type { Page, Response } from "playwright";
import { classifyRuntimeErrorPage, isAmazonShoppingInterstitial } from "@certscore/contracts";

// Match only a standalone loading message. A verification instruction or a
// loading message embedded in a full page is outside this allowance.
const loadingShell = /^(?:loading|please wait(?:,? loading)?|chargement(?: en cours)?|veuillez patienter|wird geladen|bitte warten|cargando|espere por favor|caricamento(?: in corso)?|attendere prego|carregando|aguarde|読み込み中|しばらくお待ちください|加载中|请稍候)[\s.…!]*$/iu;

export async function waitForPassiveStorefrontSettle(
  page: Page,
  entryUrl: string,
  timeoutMs: number,
  responseStatus: 200 | 202 = 200,
  intendedUrls: readonly string[] = [entryUrl],
): Promise<"ineligible" | "unverified" | "storefront_observed" | "storefront_navigation_observed"> {
  const deadline = Date.now() + timeoutMs;
  const initial = await page.locator("body").evaluate(body => ({
    url: location.href,
    timeOrigin: performance.timeOrigin,
    text: body instanceof HTMLElement ? body.innerText.trim().replace(/\s+/gu, " ") : "",
    hasControl: Boolean(body.querySelector("form, button, iframe, [role=button]")),
    links: Array.from(body.querySelectorAll<HTMLAnchorElement>("a[href]"), link => link.href).slice(0, 2),
  }), undefined, { timeout: Math.min(120, timeoutMs) }).catch(() => null);
  if (!initial || initial.url !== entryUrl) return "ineligible";
  const ordinaryWaitingPage = !initial.hasControl && initial.links.length === 0 &&
    (responseStatus === 202 ? initial.text === "" : loadingShell.test(initial.text));
  const redirectNotice = responseStatus === 200 && !initial.hasControl &&
    initial.links.length === 1 && intendedUrls.includes(initial.links[0]!) &&
    classifyRuntimeErrorPage(initial.text) === "redirect_only_page";
  if (!ordinaryWaitingPage && !redirectNotice && !isAmazonShoppingInterstitial(initial.text)) return "ineligible";

  const remaining = deadline - Date.now();
  if (remaining <= 0) return "unverified";

  // No scanner navigation or interaction runs inside this observation. Require
  // a main-frame response during the window for any replacement document.
  let observedResponse: Response | undefined;
  const onResponse = (response: Response) => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) observedResponse = response;
  };
  page.on("response", onResponse);
  try {
    const handle = await page.waitForFunction(urls => {
      if (!urls.includes(location.href)) return false;
      const main = document.body?.querySelector("main, [role=main]");
      if (!(main instanceof HTMLElement) || main.innerText.trim().length < 180) return false;
      const product = main.querySelector('[itemtype="https://schema.org/Product"], [itemtype="http://schema.org/Product"]');
      if (!product?.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
      return { url: location.href, timeOrigin: performance.timeOrigin };
    }, [...intendedUrls], { polling: 50, timeout: remaining }).catch(() => null);
    if (!handle) return "unverified";
    const observed = await handle.jsonValue().catch(() => null);
    await handle.dispose().catch(() => undefined);
    if (!observed || Date.now() > deadline || page.url() !== observed.url) return "unverified";
    if (observed.timeOrigin === initial.timeOrigin) {
      return observed.url === entryUrl ? "storefront_observed" : "unverified";
    }
    return observedResponse?.url() === observed.url && observedResponse.status() === 200 &&
      observedResponse.request().method() === "GET" && observedResponse.headers()["cf-mitigated"] !== "challenge"
      ? "storefront_navigation_observed" : "unverified";
  } finally {
    page.off("response", onResponse);
  }
}
