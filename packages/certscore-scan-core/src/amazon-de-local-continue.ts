import type { Page, Response } from "playwright";

const homepages = new Set(["https://amazon.de/", "https://www.amazon.de/"]);
const continuePath = "/errors_page/validateCaptcha";
const continueLabel = "Weiter shoppen";

export function canTestAmazonDeContinueLocally(env: NodeJS.ProcessEnv, requestedUrl: string) {
  return env.NODE_ENV !== "production" &&
    env.CERTSCORE_V2_DAG_LAMBDA_SIMULATED === "true" &&
    env.CERTSCORE_LOCAL_AMAZON_CONTINUE_ENABLED === "true" &&
    homepages.has(requestedUrl);
}

export async function tryAmazonDeLocalContinue(page: Page, timeoutMs: number): Promise<{
  attempted: boolean;
  response: Response | null;
  storefrontVerified: boolean;
}> {
  const skipped = { attempted: false, response: null, storefrontVerified: false };
  const entryUrl = page.url();
  if (!homepages.has(entryUrl)) return skipped;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  const button = page.getByRole("button", { name: continueLabel, exact: true });
  if (await button.count() !== 1 || !await button.isVisible()) return skipped;
  const mayContinue = await button.evaluate((node, { entryUrl, continuePath }) => {
    if (!(node instanceof HTMLButtonElement || node instanceof HTMLInputElement) ||
      node.type !== "submit" || node.matches(":disabled") || location.href !== entryUrl ||
      ["formaction", "formmethod", "formtarget"].some(attribute => node.hasAttribute(attribute))) return false;
    const form = node.form;
    return !!form && form.method === "get" && (!form.target || form.target === "_self") &&
      form.action === new URL(continuePath, entryUrl).href &&
      Array.from(form.elements).every(control => control === node ||
        (control instanceof HTMLInputElement && control.type === "hidden")) &&
      /Klicke auf die Schaltfläche unten, um mit dem Einkauf fortzufahren/i.test(document.body.innerText.replace(/\s+/g, " "));
  }, { entryUrl, continuePath }, { timeout: remaining() }).catch(() => false);
  if (!mayContinue || Date.now() >= deadline || page.url() !== entryUrl) return skipped;

  const [response] = await Promise.all([
    page.waitForNavigation({ timeout: remaining(), waitUntil: "domcontentloaded" }).catch(() => null),
    button.click({ timeout: remaining(), noWaitAfter: true }).catch(() => undefined),
  ]);
  const finalUrl = new URL(page.url());
  const finalHomepage = `${finalUrl.origin}${finalUrl.pathname}`;
  const verificationRequest = response?.request().redirectedFrom() ?? response?.request();
  const verificationUrl = verificationRequest ? new URL(verificationRequest.url()) : null;
  const storefrontVerified = response?.status() === 200 && homepages.has(finalHomepage) &&
    verificationUrl?.origin === new URL(entryUrl).origin && verificationUrl.pathname === continuePath &&
    await page.locator("#twotabsearchtextbox").isVisible();
  return { attempted: true, response, storefrontVerified };
}
