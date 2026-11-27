import type { ConsentControlCandidateEvidence, ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

export function hubSpotHrefLessConsentSelector(action: "accept" | "reject"): string {
  const id = action === "accept" ? "hs-eu-confirmation-button" : "hs-eu-decline-button";
  return `#hs-eu-cookie-confirmation a#${id}[role="button"]:not([href], [target], [download])`;
}

const adikteevDocument = "https://www.adikteev.com/";
const navigraphDocument = "https://navigraph.com/";
const navigraphSelector = '#consent a[data-testid="acceptAllCookies"]:not([href], [target], [download])';
const iobitDocument = "https://www.iobit.com/en/index.php?s";
const iobitSelector = "div.float-bar a:not([href], [target], [download])";

export { TOOM_ACCEPT_SELECTOR } from "@certscore/contracts";

const mistDocument = "https://www.mist.com/";
const mistBanner = "#truste-consent-buttons";
const mistSelector = '#truste-consent-buttons a#truste-consent-button:not([href], [target], [download])';

const starfieldDocument = "https://starfieldtech.com/";
const starfieldId = "28171fad-c63e-45f9-b528-cdc4dc2813bf";
const starfieldBanner = `[id="${starfieldId}-banner"]`;

export function reviewedConsentAnchor(action: "accept" | "reject", selector?: string) {
  if (action === "accept" && selector === "#__tealiumGDPRecModal .privacy_prompt #consent_prompt_footer a#consent_prompt_submit:not([href], [target], [download])") {
    return {documentUrl: "https://www.chs.net/", banner: "#consent_prompt_footer", labels: ["Accept All"]};
  }
  if (action === "accept" && selector === '#cookieConsent[role="dialog"] #cookieConsentDiv a#cookieConsentAllow[role="button"]:not([href], [target], [download])') {
    return {documentUrl: "https://www.homepage-baukasten.de/", banner: "#cookieConsentDiv", labels: ["Optionale Cookies verwenden"]};
  }
  const actionId = action === "accept" ? "accept" : "decline";
  if (selector === `${starfieldBanner} a[id="${starfieldId}-${actionId}"][href=""]:not([target], [download])`) {
    return { documentUrl: starfieldDocument, banner: starfieldBanner,
      labels: action === "accept" ? ["ACCEPT", "Accept"] : ["DECLINE", "Decline"], starfield: true as const };
  }
  if (action === "accept" && selector === mistSelector) {
    return { documentUrl: mistDocument, banner: mistBanner, labels: ["Accept All"] };
  }
  if (action === "accept" && selector === navigraphSelector) {
    return { documentUrl: navigraphDocument, banner: "#consent", labels: ["ACCEPT ALL COOKIES", "Accept all cookies"] };
  }
  if (action === "accept" && selector === iobitSelector) {
    return { documentUrl: iobitDocument, banner: "div.float-bar", labels: ["I Accept"] };
  }
  const id = action === "accept" ? "hs-eu-confirmation-button" : "hs-eu-decline-button";
  if (selector === `#hs-eu-cookie-confirmation a#${id}[role="button"][href="javascript:void(0);"]:not([target], [download])`) {
    return { documentUrl: adikteevDocument, banner: "#hs-eu-cookie-confirmation", id };
  }
}

export function geometryConsentButtonLinkMatches(
  candidate: ConsentControlCandidateEvidence,
  cmp: ConsentControlGeometryArtifact["cmp"],
  action: "accept" | "reject",
): boolean {
  const reviewed = reviewedConsentAnchor(action, candidate.selectorHint);
  if (reviewed && candidate.tagName === "a" && candidate.frameContext.frameUrl === reviewed.documentUrl) {
    return reviewed.id
      ? candidate.role === "button" && cmp?.detections?.some(detection => detection.canonicalName === "HubSpot Consent Banner") === true
      : candidate.semanticallyInteractive === true && reviewed.labels?.includes(candidate.label) === true;
  }
  return candidate.tagName === "a" && candidate.role === "button" &&
    (candidate.linkDestination === "same_document" ||
      candidate.selectorHint === hubSpotHrefLessConsentSelector(action) &&
      cmp.detections?.some(detection => detection.canonicalName === "HubSpot Consent Banner") === true);
}

export function exactAcceptSelectorCaptureEnabled(): boolean {
  return process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_SHADOW === "1" ||
    process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE === "1";
}

export function exactRejectSelectorCaptureEnabled(): boolean {
  return process.env.CERTSCORE_REJECT_GATE_PRODUCTION_SHADOW === "1" ||
    process.env.CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE === "1";
}

export function localExactRejectControlEnabled(): boolean {
  return process.env.CERTSCORE_LOCAL_REJECT_EXACT_CONTROL === "1";
}

/** Runs as part of the existing passive browser reads. Only return a selector
 * that resolves to this one native button or non-navigating button-role link in the main document. */
export function exactNativeConsentButtonSelector(element: Element): string | undefined {
  const root = element.ownerDocument;
  const view = root.defaultView;
  const anchor = element.localName === "a" && element.getAttribute("role") === "button" &&
    !element.hasAttribute("target") && !element.hasAttribute("download");
  // The passive reader serializes this function, so the scoped selector is built here.
  const hubSpotId = element.id === "hs-eu-confirmation-button" || element.id === "hs-eu-decline-button";
  const hubSpotAnchor = anchor && hubSpotId && !element.hasAttribute("href") &&
    element.closest("#hs-eu-cookie-confirmation") !== null;
  const buttonLink = hubSpotAnchor || anchor && element.getAttribute("href") === "#" &&
    !root.querySelector("base[href], base[target]");
  if (!view || view !== view.top) return undefined;
  // The production inventory and worker both bind this open shadow root.
  const elementRoot = element.getRootNode();
  if (view.location.href === "https://toom.de/" && elementRoot instanceof ShadowRoot &&
      element.localName === "button" && elementRoot.mode === "open" && elementRoot.host.shadowRoot === elementRoot &&
      elementRoot.host.matches("div#usercentrics-root") && elementRoot.host.getRootNode() === root &&
      root.querySelectorAll("#usercentrics-root").length === 1 &&
      element.matches('#uc-center-container button[data-testid="uc-accept-all-button"]') &&
      elementRoot.querySelectorAll("#uc-center-container").length === 1 &&
      elementRoot.querySelectorAll('button[data-testid="uc-accept-all-button"]').length === 1 &&
      (element as HTMLElement).innerText.trim() === "Alle erlauben" && !element.closest("form") &&
      !element.hasAttribute("form") && !element.hasAttribute("formaction") && !element.hasAttribute("aria-label")) {
    return '#usercentrics-root #uc-center-container button[data-testid="uc-accept-all-button"]';
  }
  if (view.location.href === "https://simpli.fi/" && elementRoot instanceof ShadowRoot &&
      elementRoot.mode === "open" && elementRoot.host === root.querySelector("#transcend-shadow-root") &&
      root.querySelectorAll("#transcend-shadow-root").length === 1 && elementRoot.host.shadowRoot === elementRoot &&
      element.localName === "button" && ["AcceptAllAndClose", "RejectAllAndClose"].includes(element.id)) {
    const selector = '#transcend-consent-ui dialog[open][data-layer="banner"] button[type="button"]#' + element.id;
    if (elementRoot.querySelectorAll("#" + element.id).length === 1 && element.matches(selector) &&
        !element.closest("form,label,[contenteditable]") && !element.hasAttribute("form") && !element.hasAttribute("formaction")) {
      return "#transcend-shadow-root " + selector;
    }
  }
  if (elementRoot !== root) return undefined;
  if (view.location.href === "https://www.framer.com/" && element instanceof HTMLInputElement &&
      element.type === "button" && ["Accept", "Reject"].includes(element.value) &&
      element.id === "__framer-cookie-component-button-" + element.value.toLowerCase() &&
      !element.form && !element.closest("form,label,[contenteditable]") &&
      !element.hasAttribute("form") && !element.hasAttribute("formaction")) {
    const selector = 'div.--framer-cookie-banner-container input[type="button"]#' + element.id;
    if (element.matches(selector) && root.querySelectorAll("div.--framer-cookie-banner-container").length === 1 &&
        root.querySelectorAll("#" + element.id).length === 1) return selector;
  }
  // This function is serialized into the page. These two original CAIA
  // controls are spans with directly attached listeners, not native buttons.
  if (view.location.href === "https://caiacosmetics.se/" && element.localName === "span" &&
      (element.id === "cookie_consent_manage_rec" || element.id === "cookie_consent_manage")) {
    const selector = "#" + element.id;
    const banner = "#cookie_consent_manager_wrapper > #cookie_consent";
    const scope = root.querySelectorAll(banner);
    const matches = root.querySelectorAll(selector);
    return scope.length === 1 && scope[0]?.contains(element) &&
      matches.length === 1 && matches[0] === element &&
      !element.closest("form,a,button,label,[contenteditable]") && !element.childElementCount
      ? selector : undefined;
  }
  // Only the observed literal no-op or href-less anchor can qualify. This
  // browser function is serialized, so keep its scope declarations local.
  let reviewedSelector: string | undefined;
  let reviewedBanner: string | undefined;
  if (element.localName === "a") {
    if (view.location.href === "https://www.adikteev.com/" && anchor && hubSpotId &&
        element.getAttribute("href") === "javascript:void(0);" && element.closest("#hs-eu-cookie-confirmation")) {
      reviewedBanner = "#hs-eu-cookie-confirmation";
      reviewedSelector = `${reviewedBanner} a#${element.id}[role="button"][href="javascript:void(0);"]:not([target], [download])`;
    } else if (view.location.href === "https://starfieldtech.com/" && !root.querySelector("base[href]")) {
      const id = "28171fad-c63e-45f9-b528-cdc4dc2813bf";
      if (element.id === id + "-accept" || element.id === id + "-decline") {
        reviewedBanner = `[id="${id}-banner"]`;
        reviewedSelector = `${reviewedBanner} a[id="${element.id}"][href=""]:not([target], [download])`;
      }
    } else if (view.location.href === "https://www.chs.net/") {
      reviewedBanner = "#consent_prompt_footer";
      reviewedSelector = "#__tealiumGDPRecModal .privacy_prompt #consent_prompt_footer a#consent_prompt_submit:not([href], [target], [download])";
    } else if (view.location.href === "https://www.homepage-baukasten.de/") {
      reviewedBanner = "#cookieConsentDiv";
      reviewedSelector = '#cookieConsent[role="dialog"] #cookieConsentDiv a#cookieConsentAllow[role="button"]:not([href], [target], [download])';
    } else if (view.location.href === "https://www.mist.com/") {
      reviewedBanner = "#truste-consent-buttons";
      reviewedSelector = '#truste-consent-buttons a#truste-consent-button:not([href], [target], [download])';
    } else if (view.location.href === "https://navigraph.com/") {
      reviewedBanner = "#consent";
      reviewedSelector = '#consent a[data-testid="acceptAllCookies"]:not([href], [target], [download])';
    } else if (view.location.href === "https://www.iobit.com/en/index.php?s") {
      reviewedBanner = "div.float-bar";
      reviewedSelector = "div.float-bar a:not([href], [target], [download])";
    }
    if (reviewedSelector && !element.matches(reviewedSelector)) reviewedSelector = undefined;
  }
  if (element.localName !== "button" && !buttonLink && !reviewedSelector) return undefined;

  const resolvesOnly = (selector: string, expected: Element) => {
    if (selector.length > 160) return false;
    try {
      const matches = root.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === expected;
    } catch {
      return false;
    }
  };
  const anchors = (node: Element) => {
    const hints: string[] = [];
    const id = node.getAttribute("id");
    if (id && id.length <= 80) hints.push("#" + CSS.escape(id));
    for (const name of ["data-testid", "aria-label"]) {
      const value = node.getAttribute(name);
      if (value && value.length <= 80) hints.push(node.localName + "[" + name + '="' + CSS.escape(value) + '"]');
    }
    const classes = Array.from(node.classList).slice(0, 4);
    for (const name of classes) {
      if (name.length <= 80) hints.push(node.localName + "." + CSS.escape(name));
    }
    return hints;
  };

  if (reviewedSelector && reviewedBanner) {
    return root.querySelectorAll(reviewedBanner).length === 1 && !root.querySelector("base[target]") &&
      (!element.id || resolvesOnly("#" + CSS.escape(element.id), element)) &&
      !element.closest("form,button,label,[contenteditable]") && !element.querySelector("a,button,input,[role=button]") &&
      resolvesOnly(reviewedSelector, element) ? reviewedSelector : undefined;
  }

  if (hubSpotAnchor) {
    const selector = `#hs-eu-cookie-confirmation a#${element.id}[role="button"]:not([href], [target], [download])`;
    return root.querySelectorAll("#hs-eu-cookie-confirmation").length === 1 &&
      resolvesOnly("#" + element.id, element) && resolvesOnly(selector, element) ? selector : undefined;
  }

  // Pusher's retained inventory and geometry used different generated button
  // classes. Prove the same unique button under the reviewed consent wrapper
  // in each capture, even if the button's styling class has changed.
  if (view.location.href === "https://pusher.com/" && element.localName === "button") {
    const banner = "div.CookiesConsent__Container-sc-18be04b-0";
    const group = "div.CookiesConsent__FormButtons-sc-18be04b-9";
    const selector = `${banner} ${group} button`;
    const button = element as HTMLButtonElement;
    if (element.matches(selector)) {
      return !button.form && !button.closest("form") &&
        !button.hasAttribute("form") && !button.hasAttribute("formaction") &&
        root.querySelectorAll(banner).length === 1 && root.querySelectorAll(group).length === 1 &&
        resolvesOnly(selector, element) ? selector : undefined;
    }
  }

  const direct = anchors(element).find(hint => resolvesOnly(hint, element));
  if (direct) return direct;
  // Each segment identifies the exact position among siblings of the same
  // type. Validate the fully scoped selector against the original element.
  let path = "";
  let node: Element | null = element;
  for (let depth = 0; node && depth < 6 && node !== root.body; depth++, node = node.parentElement) {
    if (path) {
      const prefix = anchors(node).find(hint => resolvesOnly(hint, node!));
      if (prefix) {
        const scoped = prefix + " > " + path;
        if (resolvesOnly(scoped, element)) return scoped;
      }
    }
    let index = 1;
    let sibling = node.previousElementSibling;
    for (let inspected = 0; sibling && inspected < 32; inspected++, sibling = sibling.previousElementSibling) {
      if (sibling.localName === node.localName) index++;
    }
    if (sibling) return undefined;
    const segment = CSS.escape(node.localName) + ":nth-of-type(" + index + ")";
    path = path ? segment + " > " + path : segment;
    if (resolvesOnly(path, element)) return path;
  }
  return undefined;
}
