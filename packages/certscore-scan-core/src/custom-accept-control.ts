import { createHash } from "node:crypto";
import type { Locator } from "playwright";
import type { CustomAcceptControlBinding } from "@certscore/contracts";
import type { ConsentProofReadGuard } from "./cmp-action-control-proof.js";

/** Candidate eligibility only. A plain tag, label or pointer cursor never
 * authorizes dispatch. Named CMPs continue to require registered recipes. */
export function isCustomAcceptControlCandidate(candidate: { tagName: string; role?: string }) {
  return !candidate.role && /^(?:span|div|[a-z][a-z0-9]*-[a-z0-9-]+)$/.test(candidate.tagName);
}

/** Read a directly attached handler without invoking it. Delegated listeners,
 * editable/form controls, composite controls and non-unique scopes fail closed.
 * The bounded function text exists only in memory to compute a retained hash. */
export async function inspectCustomAcceptControl(
  control: Locator, bannerSelector: string, deadlineAtMs: number, expectedNormalizedLabel?: string,
  proofGuard?: ConsentProofReadGuard,
): Promise<CustomAcceptControlBinding | undefined> {
  const remaining = Math.min(100, deadlineAtMs - Date.now());
  if (remaining <= 0 || !bannerSelector || bannerSelector.length > 500) return undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    proofGuard?.checkpoint();
    const read = control.evaluate((element, { selector, expectedLabel }) => {
        const tagName = element.tagName.toLowerCase();
        if (!(element instanceof HTMLElement) || !element.isConnected || element.getAttribute("role") ||
          !(tagName === "span" || tagName === "div" || tagName.includes("-")) ||
          typeof element.onclick !== "function" || element.isContentEditable || element.shadowRoot ||
          element.matches('[disabled], [aria-disabled="true" i]') ||
          element.querySelector('button,a,input,select,textarea,form,[contenteditable],[role],[onclick],[tabindex]')) return null;
        const label = element.getAttribute("aria-label") || element.innerText || element.textContent || element.getAttribute("title") || "";
        if (expectedLabel !== undefined && label.replace(/\s+/g, " ").trim().toLowerCase() !== expectedLabel) return null;
        let current: Element | null = element;
        let banner: Element | undefined;
        for (let depth = 0; current && depth < 64; depth++) {
          if (current.matches('form,a[href],label,[contenteditable="true"],[role="form"]')) return null;
          const style = getComputedStyle(current);
          if (current.matches('[hidden],[inert],[aria-hidden="true" i]') || style.display === "none" ||
            style.visibility !== "visible" || Number(style.opacity) === 0) return null;
          if (current.matches(selector)) { if (banner) return null; banner = current; }
          const root = current.getRootNode();
          current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        }
        if (current || !banner || banner === element ||
          (banner.getRootNode() as Document | ShadowRoot).querySelectorAll(selector).length !== 1) return null;
        const source = Function.prototype.toString.call(element.onclick);
        if (!source || source.length > 16_384 || source.includes("[native code]")) return null;
        return { tagName, source };
      }, { selector: bannerSelector, expectedLabel: expectedNormalizedLabel }).catch(() => null);
    proofGuard?.track(read);
    const result = await Promise.race([
      read,
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), remaining); }),
    ]);
    proofGuard?.checkpoint();
    if (!result || Date.now() >= deadlineAtMs) return undefined;
    return { policyVersion: "custom_accept_control.v1", kind: "direct_onclick",
      tagName: result.tagName, bannerSelector, nonTransactional: true,
      handlerSha256: createHash("sha256").update(result.source).digest("hex") };
  } finally { if (timer) clearTimeout(timer); }
}

export function sameCustomAcceptControlBinding(a: CustomAcceptControlBinding | undefined, b: CustomAcceptControlBinding) {
  return a?.handlerSha256 === b.handlerSha256 && a?.tagName === b.tagName && a?.bannerSelector === b.bannerSelector;
}
