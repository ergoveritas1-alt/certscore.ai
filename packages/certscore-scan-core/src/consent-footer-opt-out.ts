import type {Page} from "playwright";
import {clearTimeout, setTimeout} from "node:timers";
import {consentFooterOptOutObservationSchema, PRIVACY_CHOICE_ENTRANCE_LABEL_PATTERN,
  FOOTER_SHORT_OPT_OUT_LABEL_PATTERN, FOOTER_LINK_OPT_OUT_LABEL_PATTERN, FOOTER_ABBREVIATED_OPT_OUT_LABEL,
  FOOTER_PRIVACY_ROUTE_PATH_PATTERN, ONETRUST_FOOTER_SETTINGS_ID_SELECTOR, ADS_PRIVACY_CHOICES_LABEL, footerStripSelectors,
  FOOTER_PRIVACY_CHOICES_WITH_TAB_NOTICE, FOOTER_TAB_NOTICE_PRIVACY_PATH, FOOTER_STATE_PRIVACY_LABEL, FOOTER_STATE_PRIVACY_PATH,
  FOOTER_SALE_AND_ADS_LABEL_PATTERN, FOOTER_SALE_AND_ADS_PATH, FOOTER_PRIVACY_POLICY_PATH, FOOTER_COOKIE_POLICY_PATH,
  ONETRUST_ALTERNATE_FOOTER_SETTINGS_ID_SELECTOR, FOOTER_ROKU_PRIVACY_CHOICES_LABEL, FOOTER_ROKU_PRIVACY_CHOICES_URL,
  FOOTER_COOKIE_PREFERENCES_SALE_LABEL, FOOTER_REGISTER_CA_POLICY_PATH,
  FOOTER_SELL_DATA_LABEL, FOOTER_CA_PREFIXED_SALE_LABEL_PATTERN, FOOTER_WOOT_ADS_CHOICES_URL,
  FOOTER_HEARST_SALE_ADS_LABEL, FOOTER_SENSITIVE_DATA_LABEL, FOOTER_SENSITIVE_DATA_WEBFORM_LABEL,
  FOOTER_SALE_SHARING_REQUEST_LABEL, FOOTER_SALE_SHARING_REQUEST_PATH,
  FOOTER_SLASH_SALE_BUTTON_LABEL, FOOTER_SLASH_SALE_FORM_LABEL, FOOTER_SLASH_SALE_FORM_PATH,
  FOOTER_SHORT_SALE_SHARING_LABEL, EXPLICIT_SALE_SHARING_LAUNCHER_LABEL, FOOTER_DATA_PRIVACY_PREFERENCES_PATH,
  AEM_FOOTER_SHARING_PREFERENCES_PATH,
  ENSIGHTEN_FOOTER_REVEAL_MAX_MS,
  ONETRUST_CUSTOM_FOOTER_REVEAL_MAX_MS,
  FOOTER_CONTRACTED_SALE_LABEL_PATTERN, FOOTER_HEARST_SALE_ADS_LINK_PATTERN, FOOTER_HEARST_SALE_ADS_LINK_PATH,
  consentFooterOptOutCaptureSchema, originalOneTrustSettingsEntranceSchema,
  type ConsentFooterOptOutCapture, type ConsentFooterOptOutObservation, type DomSnapshotArtifact} from "@certscore/contracts";
import {sameDocumentCaptureBinding, type DocumentCaptureBinding} from "./document-bound-capture.js";
import {getRegistrableDomainFromUrl} from "./domain-utils.js";

type Candidate = ConsentFooterOptOutObservation["candidates"][number];
type Visibility = Pick<Candidate, "visibility" | "view" | "bounds" | "testedPoints" | "matchingPoints" | "occludingPoints" | "iframeOccludingPoints">;
type Read = Pick<ConsentFooterOptOutObservation, "coverage" | "limitations" | "viewport" | "footerCount" | "inspectedControls" | "candidates"> & {
  startingBanner?: {label: string; ariaLabel: string; testedPoints: number; matchingPoints: number; atEpochMs: number};
  usedExtendedReveal?: boolean;
};
export const FOOTER_OPT_OUT_READ_MAX_MS = 175;
export const FOOTER_OPACITY_REVEAL_READ_MAX_MS = 450;
const AEM_LEGAL_FOOTER_ROOT_SELECTOR = ".cmp-footerV2";
export const AEM_LEGAL_FOOTER_LINK_SELECTOR = `${AEM_LEGAL_FOOTER_ROOT_SELECTOR} .cmp-footerV2__links__column__list > li > a[href]`;

type FooterSnapshot = Pick<DomSnapshotArtifact, "url" | "artifactId" | "capturedAtMs" | "documentIdentity" | "consentStateAtTime">;
interface FooterCaptureInput {
  page: Page; snapshot: FooterSnapshot; readBinding: () => DocumentCaptureBinding;
  verifyOpenMainFrame?: () => Promise<DocumentCaptureBinding | undefined>;
  scanStartedAtMs: number; budgetMs: number; signal?: AbortSignal;
  prioritizeFundingChoicesStrip?: boolean;
  allowExtendedFooterReveal?: boolean;
  allowEnsightenFooterReveal?: boolean;
  allowOneTrustCustomFooterReveal?: boolean;
}
type FooterCaptureResult = Pick<DomSnapshotArtifact,"footerOptOutObservation"|"footerOptOutCapture"|"originalOneTrustSettingsEntrance">;

function diagnostic(snapshot: FooterSnapshot, scanStartedAtMs: number, evidence: Pick<ConsentFooterOptOutCapture,"outcome"|"attempts"|"recovery"|"mismatch">): FooterCaptureResult {
  if (snapshot.artifactId !== "dom_text_pre_consent" || snapshot.consentStateAtTime !== "pre_consent") return {};
  const parsed=consentFooterOptOutCaptureSchema.safeParse({version:"consent_footer_opt_out_capture.v1",
    artifactId:snapshot.artifactId,documentUrl:snapshot.url,
    documentToken:snapshot.documentIdentity?.source === "cdp_loader_id" ? snapshot.documentIdentity.token : undefined,
    snapshotAtMs:snapshot.capturedAtMs,completedAtMs:Date.now()-scanStartedAtMs,...evidence});
  return parsed.success ? {footerOptOutCapture:parsed.data} : {};
}

export function footerCaptureStopped(snapshot: FooterSnapshot, scanStartedAtMs: number): FooterCaptureResult {
  return diagnostic(snapshot,scanStartedAtMs,{outcome:"lane_stopped",attempts:0,recovery:"none"});
}

/** Existing callers interested only in control evidence can keep the narrow return shape. */
export async function captureConsentFooterOptOut(input: FooterCaptureInput) {
  return (await captureConsentFooterOptOutWithOutcome(input)).footerOptOutObservation;
}

/** All reads, original-loader checks and any retry share one absolute deadline and the original page. */
export async function captureConsentFooterOptOutWithOutcome(input: FooterCaptureInput): Promise<FooterCaptureResult> {
  const {snapshot} = input;
  if (snapshot.artifactId !== "dom_text_pre_consent" || snapshot.consentStateAtTime !== "pre_consent") return {};
  const expected = {url:snapshot.url,documentIdentity:snapshot.documentIdentity};
  const maxBudget = input.allowEnsightenFooterReveal ? ENSIGHTEN_FOOTER_REVEAL_MAX_MS :
    input.allowOneTrustCustomFooterReveal ? ONETRUST_CUSTOM_FOOTER_REVEAL_MAX_MS :
    input.allowExtendedFooterReveal ? FOOTER_OPACITY_REVEAL_READ_MAX_MS : FOOTER_OPT_OUT_READ_MAX_MS;
  const budget = Math.min(maxBudget,Math.max(0,Math.floor(input.budgetMs)));
  let attempts=0, recovery: ConsentFooterOptOutCapture["recovery"]="none";
  let mismatch: ConsentFooterOptOutCapture["mismatch"];
  const finish=(outcome:ConsentFooterOptOutCapture["outcome"])=>diagnostic(snapshot,input.scanStartedAtMs,{outcome,attempts,recovery,mismatch});
  if (!snapshot.documentIdentity?.token || snapshot.documentIdentity.source !== "cdp_loader_id" ||
      !/^https?:\/\//i.test(snapshot.url)) return finish("source_unavailable");
  if (input.signal?.aborted) return finish("aborted");
  if (input.page.isClosed()) return finish("page_closed");
  if (!Number.isFinite(budget) || budget<=0) return finish("no_budget");
  const startedEpochMs=Date.now();
  const deadline=startedEpochMs+budget;
  const ordinaryDeadline=Math.min(deadline,startedEpochMs+FOOTER_OPT_OUT_READ_MAX_MS);
  const matches=(b: DocumentCaptureBinding | undefined) => !!b && sameDocumentCaptureBinding(expected,{url:b.url,documentIdentity:b.documentIdentity});
  const timeout = Symbol("footer_deadline");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<typeof timeout>(resolve=>{timer=setTimeout(()=>resolve(timeout),budget);});
  const conflicts=(b: DocumentCaptureBinding | undefined) => !!b && (b.url!==snapshot.url ||
    b.documentIdentity?.source==="cdp_loader_id" && !!b.documentIdentity.token && b.documentIdentity.token!==snapshot.documentIdentity?.token);
  function noteMismatch(stage:"before_read"|"after_read",b:DocumentCaptureBinding | undefined) {
    mismatch={stage,urlMatched:b?.url===snapshot.url,loaderMatched:b?.documentIdentity?.source==="cdp_loader_id" &&
      b.documentIdentity.token===expected.documentIdentity?.token,
      observedDocumentToken:b?.documentIdentity?.source==="cdp_loader_id" ? b.documentIdentity.token : undefined};
  }
  try {
    const original=input.readBinding();
    if (!matches(original)) {
      noteMismatch("before_read",original);
      if (!input.verifyOpenMainFrame || input.page.url()!==snapshot.url) return finish(conflicts(original) ? "document_mismatch" : "source_unavailable");
      const verified=await Promise.race([input.verifyOpenMainFrame().catch(()=>undefined),expired]);
      if (verified===timeout) return finish("timed_out");
      if (!matches(verified)) {recovery="original_loader_not_verified";return finish(conflicts(verified) || conflicts(original) ? "document_mismatch" : "source_unavailable");}
      recovery="original_loader_verified";
    }
    const read=()=>input.page.mainFrame().evaluate(footerBrowserRead, {expectedUrl: snapshot.url,
      sameSiteDomain: getRegistrableDomainFromUrl(snapshot.url),
      aemFooter: {root: AEM_LEGAL_FOOTER_ROOT_SELECTOR, link: AEM_LEGAL_FOOTER_LINK_SELECTOR, path: AEM_FOOTER_SHARING_PREFERENCES_PATH},
      pattern: PRIVACY_CHOICE_ENTRANCE_LABEL_PATTERN.source, shortPattern: FOOTER_SHORT_OPT_OUT_LABEL_PATTERN.source,
      linkPattern: FOOTER_LINK_OPT_OUT_LABEL_PATTERN.source, shortLabel: FOOTER_ABBREVIATED_OPT_OUT_LABEL,
      privacyRoutePattern: FOOTER_PRIVACY_ROUTE_PATH_PATTERN.source, settingsIdSelector: ONETRUST_FOOTER_SETTINGS_ID_SELECTOR,
      adsLabel: ADS_PRIVACY_CHOICES_LABEL, strips: footerStripSelectors,
      scopedNames: {tabNotice: FOOTER_PRIVACY_CHOICES_WITH_TAB_NOTICE.source, tabPath: FOOTER_TAB_NOTICE_PRIVACY_PATH.source,
        stateLabel: FOOTER_STATE_PRIVACY_LABEL, statePath: FOOTER_STATE_PRIVACY_PATH,
        combinedLabel: FOOTER_SALE_AND_ADS_LABEL_PATTERN.source, combinedPath: FOOTER_SALE_AND_ADS_PATH,
        policyPath: FOOTER_PRIVACY_POLICY_PATH.source, cookiePolicyPath: FOOTER_COOKIE_POLICY_PATH}, reviewedFooter: {
        registerPath: FOOTER_REGISTER_CA_POLICY_PATH, rokuLabel: FOOTER_ROKU_PRIVACY_CHOICES_LABEL,
        rokuUrl: FOOTER_ROKU_PRIVACY_CHOICES_URL, publisherLabel: FOOTER_COOKIE_PREFERENCES_SALE_LABEL,
        alternateSettingsId: ONETRUST_ALTERNATE_FOOTER_SETTINGS_ID_SELECTOR,
        sellDataLabel: FOOTER_SELL_DATA_LABEL, caPrefixedSale: FOOTER_CA_PREFIXED_SALE_LABEL_PATTERN.source,
        wootAdsUrl: FOOTER_WOOT_ADS_CHOICES_URL, hearstLabel: FOOTER_HEARST_SALE_ADS_LABEL,
        sensitiveLabel: FOOTER_SENSITIVE_DATA_LABEL, sensitiveWebformLabel: FOOTER_SENSITIVE_DATA_WEBFORM_LABEL,
        contractedSale: FOOTER_CONTRACTED_SALE_LABEL_PATTERN.source,
        hearstLink: FOOTER_HEARST_SALE_ADS_LINK_PATTERN.source, hearstLinkPath: FOOTER_HEARST_SALE_ADS_LINK_PATH,
        saleSharingRequestLabel: FOOTER_SALE_SHARING_REQUEST_LABEL, saleSharingRequestPath: FOOTER_SALE_SHARING_REQUEST_PATH,
        slashSaleButtonLabel: FOOTER_SLASH_SALE_BUTTON_LABEL.source, slashSaleFormLabel: FOOTER_SLASH_SALE_FORM_LABEL.source,
        slashSaleFormPath: FOOTER_SLASH_SALE_FORM_PATH, shortSaleSharingLabel: FOOTER_SHORT_SALE_SHARING_LABEL.source,
        saleSharingDialogLabel: EXPLICIT_SALE_SHARING_LAUNCHER_LABEL.source,
        dataPrivacyPreferencesPath: FOOTER_DATA_PRIVACY_PREFERENCES_PATH},
      prioritizeFundingChoicesStrip: input.prioritizeFundingChoicesStrip === true, deadline, ordinaryDeadline,
      opacityDeadline: Math.min(deadline, startedEpochMs + FOOTER_OPACITY_REVEAL_READ_MAX_MS),
      oneTrustFooterDeadline: Math.min(deadline, startedEpochMs + ONETRUST_CUSTOM_FOOTER_REVEAL_MAX_MS),
      allowOneTrustCustomFooterReveal: input.allowOneTrustCustomFooterReveal === true,
      allowEnsightenFooterReveal: input.allowEnsightenFooterReveal === true});
    for (let i=0;i<2;i++) {
      if (input.signal?.aborted) return finish("aborted");
      if (input.page.isClosed()) return finish("page_closed");
      if (Date.now()>=deadline) return finish("timed_out");
      if (i>0) {
        const beforeRetry=input.readBinding();
        if (!matches(beforeRetry)) {noteMismatch("before_read",beforeRetry);return finish(conflicts(beforeRetry) ? "document_mismatch" : "source_unavailable");}
        recovery="same_document_retry";
      }
      attempts++;
      const raw=await Promise.race([read().catch(()=>undefined),expired]);
      if (input.signal?.aborted) return finish("aborted");
      if (raw===timeout || Date.now()>=deadline || Date.now()>=ordinaryDeadline && !raw?.usedExtendedReveal) return finish("timed_out");
      if (input.page.isClosed()) return finish("page_closed");
      if (recovery==="original_loader_verified") {
        const after=await Promise.race([input.verifyOpenMainFrame!().catch(()=>undefined),expired]);
        if (after===timeout) return finish("timed_out");
        if (!matches(after) || input.page.url()!==snapshot.url) {
          const joined=after && {...after,url:input.page.url()!==snapshot.url ? input.page.url() : after.url};
          noteMismatch("after_read",joined);recovery="original_loader_not_verified";return finish(conflicts(joined) ? "document_mismatch" : "source_unavailable");
        }
      } else {
        const after=input.readBinding();
        if (!matches(after)) {noteMismatch("after_read",after);return finish(conflicts(after) ? "document_mismatch" : "source_unavailable");}
      }
      if (!raw) {
        if (i===0 && recovery==="none" && deadline-Date.now()>=40) continue;
        return finish("read_failed");
      }
      const {startingBanner, usedExtendedReveal: _usedExtendedReveal, ...footerRead} = raw;
      const completedEpochMs = Date.now();
      const parsed=consentFooterOptOutObservationSchema.safeParse({...footerRead,version:"consent_footer_opt_out.v1",
        artifactId:snapshot.artifactId,documentUrl:snapshot.url,documentToken:snapshot.documentIdentity.token,
        snapshotAtMs:snapshot.capturedAtMs,capturedAtMs:completedEpochMs-input.scanStartedAtMs});
      const banner = startingBanner && startingBanner.atEpochMs >= deadline-budget && startingBanner.atEpochMs <= completedEpochMs &&
        originalOneTrustSettingsEntranceSchema.safeParse({
        version:"original_onetrust_settings_entrance.v1", selector:"#onetrust-pc-btn-handler",
        documentUrl:snapshot.url,documentToken:snapshot.documentIdentity.token,observedAtMs:startingBanner.atEpochMs-input.scanStartedAtMs,
        label:startingBanner.label,ariaLabel:startingBanner.ariaLabel,testedPoints:startingBanner.testedPoints,matchingPoints:startingBanner.matchingPoints,
      });
      if (!parsed.success) return finish("invalid_packet");
      return {...finish("captured"),footerOptOutObservation:parsed.data,
        ...(banner && banner.success ? {originalOneTrustSettingsEntrance:banner.data} : {})};
    }
    return finish("read_failed");
  } catch {return finish(input.page.isClosed() ? "page_closed" : "read_failed");}
  finally {if (timer) clearTimeout(timer);}
}

// Serialized into the main frame. Uses bounded viewport reads without opening controls or scrolling nested containers.
async function readFooter(input: {expectedUrl: string; sameSiteDomain: string | null; aemFooter: {root: string; link: string; path: string};
  pattern: string; shortPattern: string; linkPattern: string;
  shortLabel: string; privacyRoutePattern: string; settingsIdSelector: string; adsLabel: string; strips: typeof footerStripSelectors;
  scopedNames: {tabNotice: string; tabPath: string; stateLabel: string; statePath: string; combinedLabel: string; combinedPath: string;
    policyPath: string; cookiePolicyPath: string};
  reviewedFooter: {registerPath: string; rokuLabel: string; rokuUrl: string; publisherLabel: string; alternateSettingsId: string;
    sellDataLabel: string; caPrefixedSale: string; wootAdsUrl: string; hearstLabel: string; sensitiveLabel: string; sensitiveWebformLabel: string;
    contractedSale: string; hearstLink: string; hearstLinkPath: string; saleSharingRequestLabel: string; saleSharingRequestPath: string;
    slashSaleButtonLabel: string; slashSaleFormLabel: string; slashSaleFormPath: string;
    shortSaleSharingLabel: string; saleSharingDialogLabel: string; dataPrivacyPreferencesPath: string};
  prioritizeFundingChoicesStrip: boolean; deadline: number; ordinaryDeadline: number; opacityDeadline: number;
  allowEnsightenFooterReveal: boolean; allowOneTrustCustomFooterReveal: boolean; oneTrustFooterDeadline: number}): Promise<Read | undefined> {
  const started = performance.now();
  let readDeadline = input.ordinaryDeadline;
  if (window !== window.top || location.href !== input.expectedUrl || Date.now() >= readDeadline) return;
  const limitations = new Set<Read["limitations"][number]>();
  const viewport: [number,number] = [innerWidth,innerHeight];
  if (!viewport[0] || !viewport[1]) return;
  if (document.readyState !== "complete") limitations.add("document_not_complete");
  const pattern = new RegExp(input.pattern, "i");
  const shortPattern = new RegExp(input.shortPattern, "i");
  const linkPattern = new RegExp(input.linkPattern, "i");
  const privacyRoutePattern = new RegExp(input.privacyRoutePattern);
  const tabNotice = new RegExp(input.scopedNames.tabNotice, "i");
  const tabPath = new RegExp(input.scopedNames.tabPath);
  const combinedLabel = new RegExp(input.scopedNames.combinedLabel, "i");
  const policyPath = new RegExp(input.scopedNames.policyPath);
  const caPrefixedSale = new RegExp(input.reviewedFooter.caPrefixedSale, "i");
  const contractedSale = new RegExp(input.reviewedFooter.contractedSale, "i");
  const hearstLink = new RegExp(input.reviewedFooter.hearstLink, "i");
  const slashSaleButton = new RegExp(input.reviewedFooter.slashSaleButtonLabel, "i");
  const slashSaleForm = new RegExp(input.reviewedFooter.slashSaleFormLabel, "i");
  const shortSaleSharing = new RegExp(input.reviewedFooter.shortSaleSharingLabel, "i");
  const saleSharingDialog = new RegExp(input.reviewedFooter.saleSharingDialogLabel, "i");
  const footerDialogAnchor = 'footer a[href="#"][aria-label$=", opens a dialog" i]';
  const quantcastFooter = "body > .container-choice-footer-msg .container-inside > #choice-footer-msg.ccpa-msg-added";
  const caLegalBar = "body > .m-footer__legal-bar > .m-footer__legal-bar-container .m-footer__legal-bar-subnav";
  const landmarks = 'footer,[role="contentinfo"],#footer,#site-footer,#footer-bottom,#legal-footer,.site-footer,.footer-bottom,.footer-legal,[data-testid="footer"]';
  const reviewedLegalNav = [
    "body > #vsFooterLinks", "footer #layoutFooterInformation", "#__next div.footer > div > section",
    "body .page-footer-component ul.last-details", "div.footer-link", ".emcmUi-GlobalFooter-under",
  ].join(",");
  const legalLandmarks = '#main-footer nav#main-footer-nav-v2,div[class*="_legalFooter"],body > div.footer > div.footermid > .section-inner-footer,body > section#f5-footer #f5-footer-legal-links,body > div .container > #mspa-footer-html-id,body .baseline-footer-wrapper .informa-legal-notice > .baseline-footer' + "," + quantcastFooter + "," + caLegalBar + "," + reviewedLegalNav;
  const oneTrustHook = input.settingsIdSelector + ".ot-sdk-show-settings";
  const usercentricsSettingsHref = /^javascript:\s*window\.UC_UI\s*&&\s*UC_UI\.showSecondLayer\(\s*\)\s*;?$/;
  const oneTrustLegalFooter = "body > div.footer";
  const didomiFooterControl = "li.didomi-preferences-link > a#privacy-link-privacy-settings";
  const didomiFooterScope = 'footer,[role="contentinfo"],#mnFooter';
  const saleSharingSettingsAnchor = "a#privacy-settings:not([href])";
  const ensightenFooterAnchor = 'a#ensFooterPrivacySettings[role="button"][href="#"]';
  const textTrigger = `:is(p,div:not(.animated-link.oneTrust))${oneTrustHook}`;
  const controls = 'a,button,[role="link"],[role="button"],div.animated-link.oneTrust.ot-sdk-show-settings,div#consent-module-mspa,' + textTrigger;
  const customLegalGroups = ':is(ul,ol,nav,div,section,[role="navigation"]):is([id*="legal" i],[class*="legal" i],[id*="footer" i],[class*="footer" i])';
  const footerMarker = /(?:^|[-_\s])footer(?:$|[-_\s])/i;
  const copyrightMarker = /(?:©|\bcopyright\b).{0,80}\b(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\b.{0,40}©/i;
  const seenFooters = new Set<Element>(), seenControls = new Set<Element>();
  const seenTrees = new Set<Document | ShadowRoot>(), seenScopes = new Set<Element | ShadowRoot>();
  const namedTailScopes = new Map<Element, HTMLAnchorElement>();
  const legalRailScopes = new Map<Element, HTMLAnchorElement>();
  const scopesToWalk: {scope: Element | ShadowRoot; kind: Candidate["scope"]}[] = [];
  const treesToWalk: (Document | ShadowRoot)[] = [];
  type Match = {
    element: Element; displayElement: Element; scopeElement: Element; scope: Candidate["scope"]; label: string;
    semanticRole: Candidate["semanticRole"]; actionable: boolean;
    placementWitness?: Candidate["placementWitness"]; controlWitness?: Candidate["controlWitness"];
    href: string | null;
  };
  const matched: Match[] = [];
  let inspectedControls = 0;
  const withinBudget = () => {
    if (Date.now() < readDeadline - 15) return true;
    limitations.add("deadline"); return false;
  };
  function parent(el: Element): Element | null {
    const root = el.getRootNode();
    return el.parentElement || (root instanceof ShadowRoot ? root.host : null);
  }
  function inExcludedRegion(el: Element, footerColumn?: Element): boolean {
    for (let current: Element | null = el, depth = 0; current && depth < 100; current = parent(current), depth++) {
      if (current !== footerColumn && current.matches('article,aside,[role="article"]')) return true;
      if (current.matches('dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"],#onetrust-banner-sdk,#onetrust-pc-sdk,#didomi-host,#CybotCookiebotDialog,.cky-consent-container,.cky-modal,.cmpbox,[data-testid="cookie-banner"]')) return true;
    }
    return false;
  }
  const normalize = (label: string) => label.trim().replace(/\s+/g, " ");
  const ownText = (element: Element) =>
    normalize((element instanceof HTMLElement ? element.innerText : "") || element.textContent || "");
  function modalNamesFooterLauncher(name: string): boolean {
    const dialogs = document.querySelectorAll("dialog:modal");
    if (dialogs.length !== 1) return false;
    const dialog = dialogs[0]!;
    if (dialog.getClientRects().length === 0 || !geometry(dialog,true,"original",dialog,false).matchingPoints) return false;
    const text = ownText(dialog).replace(/[“”]/g, '"').toLowerCase();
    if (text.length > 1600) return false;
    const instructions = /(?:^|[.!?]\s+)you can opt[ -]out(?: of [^.!?,]{1,100},?)? (?:by |at any time )clicking (?:on )?(?:the )?"([^"]{1,120})" (?:button|link) at the bottom of (?:the|this) (?:webpage|web page|page)\b/g;
    for (const instruction of text.matchAll(instructions)) {
      if (instruction[1] === name) return true;
    }
    return false;
  }
  function nearbyCopyrightOwner(start: Element | null, levels: number): Element | undefined {
    for (let context = start, depth = 0; context && depth < levels && withinBudget(); context = context.parentElement, depth++) {
      if (context.matches('main,body,[role="main"]')) break;
      const text = ownText(context);
      if (text.length > 4096) break;
      if (copyrightMarker.test(text)) return context;
    }
  }
  function isLabeledLegalColumn(group: Element): boolean {
    const first = group.firstElementChild;
    return group.matches("ul,ol") && !!first && first.localName === "li" && !first.querySelector("a[href],button,[role=button]") &&
      ownText(first).toLowerCase() === "legal";
  }
  function isCustomLegalFooter(group: Element, oneTrustColumn = false): boolean {
    if (group.closest(landmarks + ',header,[role="banner"]') || inExcludedRegion(group)) return false;
    const box = group.getBoundingClientRect();
    const endGap = (document.scrollingElement?.scrollHeight ?? 0) - (box.bottom + scrollY);
    if (box.width < 2 || box.height < 2 || endGap < -2 || endGap > Math.min(240, innerHeight / 3)) return false;
    const context = group.parentElement;
    if (!context) return false;
    const namedFooter = footerMarker.test(`${group.id} ${group.className}`) || footerMarker.test(`${context.id} ${context.className}`);
    const first = group.firstElementChild;
    const labeledColumn = isLabeledLegalColumn(group);
    const namedLegalHeading = oneTrustColumn && !!first && ownText(first).toLowerCase() === "legal" &&
      !first.matches(controls) && !first.querySelector(controls);
    if (oneTrustColumn ? !namedFooter || !namedLegalHeading : !namedFooter && !labeledColumn) return false;
    const links = group.querySelectorAll<HTMLAnchorElement>('a[href]');
    if (links.length < 2 || links.length > 12) return false;
    const legalLabels = Array.from(links).filter(link => link.protocol === "https:" && !link.username && !link.password &&
      !link.hasAttribute("download") && link.getClientRects().length > 0 && getComputedStyle(link).visibility === "visible")
      .map(link => ownText(link));
    if (!legalLabels.some(label => /^privacy (?:policy|notice|statement)$/i.test(label) ||
        (labeledColumn || oneTrustColumn) && /^privacy$/i.test(label)) ||
        !legalLabels.some(label => /^terms(?: (?:of (?:service|use)|and conditions))$/i.test(label) ||
          labeledColumn && /^legal\s*&\s*terms$/i.test(label) || oneTrustColumn && /^terms\s*&\s*conditions$/i.test(label))) return false;
    // The copyright can be a sibling of the legal row, as in a global footer with a language selector.
    const copyrightOwner = nearbyCopyrightOwner(context, labeledColumn ? 7 : oneTrustColumn ? 3 : 1);
    if (!copyrightOwner) return false;
    for (let ancestor: Element | null = group, depth = 0; ancestor && depth++ < 100; ancestor = parent(ancestor)) {
      const position = getComputedStyle(ancestor).position;
      if (position === "fixed" || position === "sticky") return false;
      // A document-wide terminal layout may be positioned, while the legal
      // list and its copyright still belong to the same site navigation.
      if (position === "absolute" && (!labeledColumn || ancestor === group || !ancestor.contains(copyrightOwner) ||
          ancestor.getBoundingClientRect().width < innerWidth * .65)) return false;
    }
    return true;
  }
  function isCustomLegalDivButton(element: Element): boolean {
    return element instanceof HTMLDivElement && element.getAttribute("role") === "button" && element.tabIndex >= 0 &&
      typeof element.onclick === "function" && getComputedStyle(element).cursor === "pointer";
  }
  function isCustomLegalControl(element: Element): boolean {
    if (!pattern.test(ownText(element))) return false;
    if (element instanceof HTMLButtonElement) {
      return (!element.form || element.type === "button") && typeof element.onclick === "function";
    }
    if (isCustomLegalDivButton(element)) return true;
    return element instanceof HTMLAnchorElement && !element.matches('[role="button"]') &&
      element.origin === location.origin && element.protocol === "https:" &&
      !element.username && !element.password && !element.search && !element.hash && !element.hasAttribute("download") &&
      (privacyRoutePattern.test(element.pathname) || tabPath.test(element.pathname));
  }
  function isSensitiveDataFooterLink(element: Element, scope: Element): boolean {
    return element instanceof HTMLAnchorElement && element.matches("a.emcmUi-GlobalFooterUnder-link") &&
      scope.matches(".emcmUi-GlobalFooter-under") && element.origin === location.origin &&
      element.pathname === "/ccpa-dsar" && !element.search && !element.hash && !element.username && !element.password &&
      !element.hasAttribute("download") && ownText(element).toLowerCase() === input.reviewedFooter.sensitiveLabel;
  }
  function hasOneTrustSettingsHook(element: Element): boolean {
    return element.matches(oneTrustHook) &&
      document.querySelectorAll(input.settingsIdSelector).length === 1 &&
      !!document.querySelector("#onetrust-consent-sdk :is(#onetrust-banner-sdk,#onetrust-pc-sdk)") &&
      getComputedStyle(element).cursor === "pointer";
  }
  function hasBoundOneTrustHook(element: Element, scope: Element): boolean {
    return scope.matches("footer") && hasOneTrustSettingsHook(element);
  }
  function customOneTrustFooterScope(element: Element): Element | undefined {
    if (!(element instanceof HTMLButtonElement) || element.form || element.matches(':disabled,[aria-disabled="true"],[form]') ||
        element.closest(landmarks + ',header,[role="banner"],[hidden],[inert],[aria-hidden="true"]') || inExcludedRegion(element) ||
        !pattern.test(ownText(element)) || !hasOneTrustSettingsHook(element)) return;
    for (let group = element.parentElement, depth = 0; group && group !== document.body && depth++ < 6 && withinBudget(); group = group.parentElement) {
      if (isCustomLegalFooter(group,true)) return group;
    }
  }
  function isCombinedSaleAdsRoute(anchor: HTMLAnchorElement, label: string): boolean {
    if (!combinedLabel.test(label) || anchor.pathname !== input.scopedNames.combinedPath) return false;
    if (!label.includes("opt-out")) return true;
    const reviewedCharterRoute = /^https:\/\/(?:www\.)?spectrumlocalnews\.com$/.test(location.origin) &&
      /^https:\/\/(?:www\.)?spectrum\.com$/.test(anchor.origin);
    return !anchor.search && !anchor.hash && (anchor.origin === location.origin || reviewedCharterRoute);
  }
  function isLegalRailRoute(element: Element): element is HTMLAnchorElement {
    return element instanceof HTMLAnchorElement && element.protocol === "https:" && element.origin === location.origin &&
      element.pathname === input.scopedNames.cookiePolicyPath && !element.username && !element.password &&
      !element.search && !element.hash && !element.hasAttribute("download") &&
      ownText(element).toLowerCase() === "your privacy choices";
  }
  function isLegalRail(scope: Element, anchor: HTMLAnchorElement): boolean {
    if (!scope.contains(anchor) || scope.closest('header,[role="banner"]') || inExcludedRegion(scope)) return false;
    const rect = scope.getBoundingClientRect();
    if (rect.width < 2 || rect.width > Math.min(420, innerWidth / 2) || rect.left < 0 || rect.left > innerWidth / 5) return false;
    const links = scope.querySelectorAll("a[href]");
    if (links.length < 3 || links.length > 24 || !/\bcopyright\s*(?:©\s*)?\d{4}\b/i.test(ownText(scope))) return false;
    const neighbors = Array.from(links).filter(link => link !== anchor).map(link => ownText(link).toLowerCase());
    return neighbors.includes("privacy policy") && neighbors.includes("help center");
  }
  function isFundingChoicesIpr(element: Element, host: Element): boolean {
    const root = host.shadowRoot;
    const scope = element.parentElement;
    if (!root || host.parentElement !== document.body || scope?.parentNode !== root || !scope.matches("div.ipr-container") ||
        !(element instanceof HTMLButtonElement) || element.form || !element.matches("button.ipr-button") ||
        root.querySelectorAll("div.ipr-container > button.ipr-button").length !== 1 ||
        ownText(element).toLowerCase() !== "do not sell or share my personal information") return false;
    const box = element.getBoundingClientRect();
    const height = document.scrollingElement?.scrollHeight ?? 0;
    return box.width >= 2 && box.height >= 2 && box.bottom + scrollY >= height - 64 && box.bottom + scrollY <= height + 2 &&
      [element, scope, host].every(node => !/^(?:fixed|sticky)$/.test(getComputedStyle(node).position));
  }
  function terminalFooter(scope: Element, allowNestedMain = false): boolean {
    if (scope.closest('header,[role="banner"]') || (!allowNestedMain && scope.closest('main,[role="main"]')) || inExcludedRegion(scope)) return false;
    const box = scope.getBoundingClientRect();
    const height = document.scrollingElement?.scrollHeight ?? 0;
    if (box.width < 2 || box.height < 2 || box.bottom + scrollY < height - innerHeight) return false;
    for (let node: Element | null = scope, depth = 0; node && depth++ < 32; node = parent(node)) {
      if (/^(?:fixed|sticky)$/.test(getComputedStyle(node).position)) return false;
    }
    return true;
  }
  function hasLegalLinks(container: Element, required: string[]): boolean {
    const links = container.querySelectorAll("a[href]");
    if (links.length < required.length || links.length > 24) return false;
    const labels = Array.from(links, link => ownText(link).toLowerCase());
    return required.every(label => labels.includes(label));
  }
  function isDidomiFooterSettings(element: Element, scope: Element, name: string, href: string | null): boolean {
    if (name !== "your privacy choices" || !element.matches(didomiFooterControl) ||
        !/^javascript:\s*void\(\s*0\s*\)\s*;?$/i.test(href ?? "") ||
        element.closest(didomiFooterScope) !== scope || !terminalFooter(scope) ||
        document.querySelectorAll("#privacy-link-privacy-settings").length !== 1 ||
        !document.querySelector('#didomi-host,script[src*="/didomi/sdk-loader.js"],script[src^="https://sdk.privacy-center.org/"]') ||
        getComputedStyle(element).cursor !== "pointer") return false;
    const legalList = element.closest("ul,ol");
    return !!legalList && scope.contains(legalList) && hasLegalLinks(legalList, ["privacy policy", "terms of service"]) &&
      (!scope.matches("#mnFooter") || !!nearbyCopyrightOwner(legalList, 3));
  }
  function isDataPrivacyPreferencesLink(anchor: HTMLAnchorElement, scope: Element, text: string): boolean {
    if (!scope.matches("footer") || !shortSaleSharing.test(text) || anchor.origin !== location.origin ||
        anchor.pathname !== input.reviewedFooter.dataPrivacyPreferencesPath || anchor.search || anchor.hash) return false;
    const list = anchor.closest("ul,ol");
    const nav = list?.closest('nav,[role="navigation"]');
    return !!list && !!nav && scope.contains(nav) && hasLegalLinks(list, ["privacy policy", "terms of use"]) && terminalFooter(scope, true);
  }
  function isSaleSharingSettingsAnchor(element: Element, scope: Element, name: string): boolean {
    if (name !== "do not sell or share my information" || !(element instanceof HTMLAnchorElement) ||
        !element.matches(saleSharingSettingsAnchor) || !scope.matches("footer") ||
        typeof element.onclick !== "function" || document.querySelectorAll("#privacy-settings").length !== 1 ||
        getComputedStyle(element).cursor !== "pointer") return false;
    const list = element.closest("ul,ol");
    const nav = list?.closest('nav,[role="navigation"]');
    return !!list && !!nav && scope.contains(nav) && hasLegalLinks(list, ["privacy policy", "cookie policy"]) && terminalFooter(scope, true);
  }
  function isAemSharingPreferencesLink(anchor: HTMLAnchorElement, scope: Element, name: string): boolean {
    const sameProperty = anchor.origin === location.origin ||
      !!input.sameSiteDomain && anchor.origin === `https://lp.${input.sameSiteDomain}`;
    if (name !== input.reviewedFooter.saleSharingRequestLabel || !sameProperty || anchor.pathname !== input.aemFooter.path ||
        anchor.search || anchor.hash || !anchor.matches(input.aemFooter.link) ||
        anchor.closest(input.aemFooter.root) !== scope || !terminalFooter(scope, true)) return false;
    const list = anchor.closest("ul,ol");
    return !!list && hasLegalLinks(list, ["privacy notice", "website terms and conditions"]);
  }
  function isEnsightenFooterSettings(element: Element, scope: Element, text: string): boolean {
    if (!pattern.test(text) || !element.matches(ensightenFooterAnchor) || element.closest(landmarks) !== scope ||
        element.closest('form,#ensNotifyBanner,#ensModalWrapper,#tcf2__ensNotifyBanner,#tcf2__ensModalWrapper') ||
        document.querySelectorAll("#ensFooterPrivacySettings").length !== 1 ||
        !document.querySelector("#ensNotifyBanner,#ensModalWrapper,#tcf2__ensNotifyBanner,#tcf2__ensModalWrapper") ||
        getComputedStyle(element).cursor !== "pointer" || !terminalFooter(scope, true)) return false;
    for (let group = element.parentElement, depth = 0; group && scope.contains(group) && depth++ < 5; group = group.parentElement) {
      const links = group.querySelectorAll<HTMLAnchorElement>("a[href]");
      if (links.length < 2 || links.length > 16) continue;
      const labels = Array.from(links).filter(link => link.protocol === "https:" && link.getAttribute("href") !== "#" &&
        !link.username && !link.password && !link.hasAttribute("download")).map(link => ownText(link).toLowerCase());
      if (labels.some(label => /^privacy (?:policy|notice|statement)$/.test(label)) &&
          labels.some(label => /^terms (?:of (?:use|service)|(?:and|&) conditions)$/.test(label))) return true;
    }
    return false;
  }
  function revealFooterScope(element: Element): Element | undefined {
    if (!(element instanceof HTMLButtonElement) || !element.matches("button" + oneTrustHook) || element.form ||
        element.matches(':disabled,[aria-disabled="true"]') || element.closest('header,[role="banner"],[hidden],[inert]') ||
        inExcludedRegion(element) || !pattern.test(ownText(element)) ||
        document.querySelectorAll(input.settingsIdSelector).length !== 1 ||
        !document.querySelector("#onetrust-consent-sdk :is(#onetrust-banner-sdk,#onetrust-pc-sdk)")) return;
    const height = document.scrollingElement?.scrollHeight ?? 0;
    if (height <= innerHeight + 24) return;
    let legalGroup = false;
    let fixedContent = false;
    // A reveal footer positions content over the viewport while its outer marker
    // still belongs to the document tail. The fixed layer alone proves no placement.
    for (let node = element.parentElement, depth = 0; node && depth++ < 20 && withinBudget(); node = node.parentElement) {
      if (node === document.body) break;
      if (/^(?:fixed|sticky)$/.test(getComputedStyle(node).position)) {fixedContent = true; continue;}
      if (fixedContent && legalGroup && (node.matches('footer,[role="contentinfo"]') ||
          /(?:^|[\s_-])footer\d*(?=$|[\s_-])/i.test(`${node.id} ${node.className}`))) {
        const box = node.getBoundingClientRect();
        const gap = height - (box.bottom + scrollY);
        if (box.width >= 2 && gap >= -2 && gap <= Math.min(240, innerHeight / 3) &&
            !/^(?:absolute|fixed|sticky)$/.test(getComputedStyle(node).position)) return node;
      }
      if (fixedContent || legalGroup || depth > 6) continue;
      const links = node.querySelectorAll<HTMLAnchorElement>("a[href]");
      if (links.length < 2 || links.length > 16) continue;
      const titles = Array.from(links).filter(link => link.protocol === "https:" && !link.username && !link.password &&
        !link.hasAttribute("download") && link.getClientRects().length > 0 && getComputedStyle(link).visibility === "visible")
        .map(link => ownText(link).toLowerCase());
      legalGroup = titles.some(title => /^privacy (?:policy|notice|statement)$/.test(title)) &&
        titles.some(title => /^terms (?:of (?:use|service)|(?:and|&) conditions)$/.test(title)) &&
        Boolean(nearbyCopyrightOwner(node, 2));
    }
  }
  function isOneTrustSlashSaleOwner(element: Element, scope: Element, text: string): boolean {
    if (!(element instanceof HTMLButtonElement) || !element.matches("button" + input.settingsIdSelector) || element.form ||
        !slashSaleButton.test(text) || typeof element.onclick !== "function" || !scope.matches(oneTrustLegalFooter) ||
        document.querySelectorAll(input.settingsIdSelector).length !== 1 ||
        !document.querySelector("#onetrust-consent-sdk :is(#onetrust-banner-sdk,#onetrust-pc-sdk)") || !terminalFooter(scope)) return false;
    // A generic .footer class needs nearby legal navigation as an additional placement witness.
    for (let rail = element.parentElement, depth = 0; rail && scope.contains(rail) && depth++ < 4; rail = rail.parentElement) {
      const links = rail.querySelectorAll('a[href]');
      if (links.length < 2 || links.length > 12) continue;
      const names = Array.from(links, link => ownText(link).toLowerCase());
      if (names.includes("privacy policy") && names.some(name => /^terms (?:&|and) conditions$|^terms of (?:use|service)$/.test(name))) return true;
    }
    return false;
  }
  function matchControl(element: Element, scopeElement: Element, scope: Candidate["scope"],
    placementWitness?: Candidate["placementWitness"]): Match | undefined {
    if (!element.isConnected) return;
    const aria = normalize(element.getAttribute("aria-label") ?? "");
    const text = ownText(element);
    const label = text || aria;
    const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") : null;
    const isWebAnchor = element instanceof HTMLAnchorElement && Boolean(href?.trim()) &&
      /^(?:http:|https:)$/.test(element.protocol) && !element.matches('[role="button"]');
    const linkVariant = isWebAnchor && linkPattern.test(label);
    const knownLabel = label && label.length <= 120 && (pattern.test(label) || shortPattern.test(label) || linkVariant);
    if (namedTailScopes.has(scopeElement) && namedTailScopes.get(scopeElement) !== element) return;
    const name = label.toLowerCase();
    if (scopeElement.matches(".emcmUi-GlobalFooter-under") && !isSensitiveDataFooterLink(element, scopeElement)) return;
    const iconNames = (value: string) => Array.from(element.querySelectorAll('img[alt],svg[aria-label],svg title'))
      .slice(0, 6).some(icon => normalize(icon.getAttribute("alt") ?? icon.getAttribute("aria-label") ?? icon.textContent ?? "").toLowerCase() === value);
    const persistentAnchor = name === "your privacy choices" && element.matches("a.qc-ccpa-persistent-link.sl_cmp_link") &&
      href === null && scopeElement.matches("body > #vsFooterLinks") &&
      iconNames("california consumer privacy act (ccpa) opt-out icon");
    const sheetMusicSettings = name === "your privacy choices" && element instanceof HTMLAnchorElement &&
      element.id === "hlYourPrivacyChoices" && href === null && scopeElement.matches("footer #layoutFooterInformation") &&
      document.querySelectorAll("#hlYourPrivacyChoices").length === 1 && typeof element.onclick === "function";
    const hearstSettings = name === input.reviewedFooter.hearstLabel && element instanceof HTMLAnchorElement &&
      aria === "do-not-sell-link" && element.protocol === "javascript:" && scopeElement.matches("#__next div.footer > div > section") &&
      iconNames("opt-out icon");
    const contractedSaleSettings = contractedSale.test(text) && element instanceof HTMLAnchorElement && href === "#" &&
      scopeElement.matches("footer.site-ftr") && !!element.closest("footer.site-ftr > .copyright > #mspa-footer-html-id") &&
      document.querySelectorAll("#mspa-footer-html-id").length === 1 && typeof element.onclick === "function";
    const webDestination = isWebAnchor && element instanceof HTMLAnchorElement && element.protocol === "https:" &&
      !element.username && !element.password && !element.hasAttribute("download") ? element : undefined;
    const footerColumn = scopeElement.matches("footer.page") && name === "do not share my personal information" &&
      webDestination?.origin === location.origin && webDestination?.pathname === input.reviewedFooter.registerPath
      ? element.closest("article.column") : null;
    const publisherSettings = name === input.reviewedFooter.publisherLabel && element instanceof HTMLAnchorElement &&
      href === "#" && scopeElement.matches(".informa-legal-notice > .baseline-footer") &&
      getComputedStyle(element).cursor === "pointer";
    const quantcastSettings = name === input.reviewedFooter.sellDataLabel && element instanceof HTMLAnchorElement &&
      href === "#" && scopeElement.matches(quantcastFooter) && getComputedStyle(element).cursor === "pointer";
    const mspaOwner = element instanceof HTMLDivElement && element.id === "consent-module-mspa";
    const mspaSettings = mspaOwner && name === "do not sell or share my personal information" &&
      scopeElement.matches("footer.site-footer-container") && !!element.closest("#colophon.site-footer") &&
      document.querySelectorAll("#consent-module-mspa").length === 1 && typeof element.onclick === "function";
    if (mspaOwner && !mspaSettings) return;
    const onetrustSellData = name === input.reviewedFooter.sellDataLabel && element instanceof HTMLButtonElement &&
      element.matches("button" + input.settingsIdSelector + ".ot-sdk-show-settings") && scopeElement.matches("footer") &&
      document.querySelectorAll(input.settingsIdSelector).length === 1;
    const onetrustTextOwner = element.matches(textTrigger);
    const onetrustTextSettings = onetrustTextOwner && text.toLowerCase() === "do not sell my personal information" &&
      hasBoundOneTrustHook(element, scopeElement);
    // A widget-bound consent opener can sit inside a page-wide form. Capture
    // its pointer exposure without treating it as an executable form action.
    const onetrustFormSettings = element instanceof HTMLButtonElement && !!element.form?.contains(scopeElement) &&
      !element.matches("[form],[type=submit i],[type=reset i],[formaction],[formmethod],[formtarget],[formenctype],[formnovalidate]") &&
      name === "your privacy choices" && hasBoundOneTrustHook(element, scopeElement);
    const onetrustSlashSettings = scope === "legal_footer_navigation" && isOneTrustSlashSaleOwner(element, scopeElement, text);
    const onetrustRevealSettings = scope === "legal_footer_navigation" && element.matches("button" + oneTrustHook) &&
      revealFooterScope(element) === scopeElement;
    const onetrustCustomFooterSettings = scope === "custom_legal_footer" && element.matches("button" + oneTrustHook) &&
      customOneTrustFooterScope(element) === scopeElement;
    const usercentricsSaleSettings = element instanceof HTMLAnchorElement && text.toLowerCase() === input.reviewedFooter.saleSharingRequestLabel &&
      usercentricsSettingsHref.test(href ?? "") && scopeElement.matches('footer,[role="contentinfo"],.site-footer') &&
      document.querySelector("#usercentrics-root,#usercentrics-cmp-ui") !== null && terminalFooter(scopeElement);
    const didomiSettings = ["footer", "contentinfo", "legal_footer_navigation"].includes(scope) &&
      isDidomiFooterSettings(element, scopeElement, text.toLowerCase(), href);
    const saleSharingSettings = scope === "footer" && isSaleSharingSettingsAnchor(element, scopeElement, text.toLowerCase());
    const saleSharingDialogOwner = scope === "footer" && element instanceof HTMLAnchorElement && element.matches(footerDialogAnchor) &&
      element.closest("footer") === scopeElement && !element.closest('article,aside,form,[role="dialog"],dialog') &&
      !element.hasAttribute("download") && saleSharingDialog.test(text) &&
      aria.toLowerCase() === text.toLowerCase() + ", opens a dialog" && typeof element.onclick === "function" &&
      getComputedStyle(element).cursor === "pointer" && terminalFooter(scopeElement, true);
    const footerDialogHasTarget = saleSharingDialogOwner && element.hasAttribute("target");
    const noticeBoundFooterDialog = footerDialogHasTarget && modalNamesFooterLauncher(name);
    const saleSharingDialogSettings = saleSharingDialogOwner && (!footerDialogHasTarget || noticeBoundFooterDialog);
    const ensightenSettings = ["footer", "contentinfo", "footer_strip"].includes(scope) &&
      isEnsightenFooterSettings(element, scopeElement, text);
    if (element.matches(ensightenFooterAnchor) && !ensightenSettings) return;
    if (onetrustTextOwner && !onetrustTextSettings) return;
    const ads = label.toLowerCase() === input.adsLabel && location.origin === "https://www.amazon.com" &&
      scopeElement.id === "navFooter" && scope === "contentinfo" && element instanceof HTMLAnchorElement &&
      (element.href === "https://www.amazon.com/privacyprefs" ||
        element.href === "https://www.amazon.com/privacyprefs?ref_=footer_iba");
    let controlWitness: Candidate["controlWitness"] = ads ? "amazon_ads_privacy_choices" : undefined;
    if (webDestination) {
      const path = webDestination.pathname;
      if (name === input.shortLabel && privacyRoutePattern.test(path)) controlWitness = "abbreviated_privacy_route";
      else if (tabNotice.test(name) && tabPath.test(path)) controlWitness = "privacy_choices_tab_notice";
      else if (name === input.scopedNames.stateLabel && path === input.scopedNames.statePath) controlWitness = "state_privacy_choices";
      else if (isCombinedSaleAdsRoute(webDestination, name)) controlWitness = "sale_sharing_and_targeted_advertising";
      else if (hearstLink.test(name) && path === input.reviewedFooter.hearstLinkPath && webDestination.origin === location.origin &&
          !webDestination.search && !webDestination.hash && scopeElement.matches("footer#footer") &&
          !!element.closest("footer#footer > #footer-inner #footer-legal-items-rows > li.footer-legal-row-item"))
        controlWitness = "hearst_sale_ads_link";
      else if (name === input.reviewedFooter.rokuLabel && webDestination.href === input.reviewedFooter.rokuUrl) controlWitness = "roku_privacy_choices";
      else if (footerColumn) controlWitness = "named_privacy_policy_entrance";
      else if (caPrefixedSale.test(name) && scopeElement.matches(caLegalBar) && webDestination.origin === location.origin && path === "/ccpa")
        controlWitness = "ca_prefixed_sale_link";
      else if (name === input.adsLabel && scopeElement.matches("footer#global-footer") && !!element.closest(".privacy") &&
          location.origin === "https://www.woot.com" && webDestination.href === input.reviewedFooter.wootAdsUrl)
        controlWitness = "woot_ads_privacy_choices";
      else if (isSensitiveDataFooterLink(element, scopeElement))
        controlWitness = "sale_sharing_and_sensitive_data";
      else if (name === input.reviewedFooter.sensitiveWebformLabel && scopeElement.matches("footer") &&
          !!element.closest(".footer__bottom") && /^privacyportal(?:-[a-z]{2})?\.onetrust\.com$/.test(webDestination.hostname) &&
          /^\/webform(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}){2}\/?$/i.test(path) &&
          !webDestination.hash && !webDestination.search)
        controlWitness = "onetrust_sensitive_data_webform";
      else if (scope === "footer" && scopeElement.matches("footer") && webDestination.origin === location.origin &&
          path === input.reviewedFooter.saleSharingRequestPath && !webDestination.search && !webDestination.hash &&
          text.toLowerCase() === input.reviewedFooter.saleSharingRequestLabel &&
          aria.toLowerCase() === input.reviewedFooter.saleSharingRequestLabel + " subject access request")
        controlWitness = "sale_sharing_subject_access_request";
      else if (scope === "footer" && scopeElement.matches("footer") && webDestination.origin === location.origin &&
          path === input.reviewedFooter.slashSaleFormPath && !webDestination.search && !webDestination.hash &&
          slashSaleForm.test(text) && !!element.closest("li") && terminalFooter(scopeElement))
        controlWitness = "footer_slash_sale_form_link";
      else if (scope === "footer" && isDataPrivacyPreferencesLink(webDestination, scopeElement, text))
        controlWitness = "footer_data_privacy_preferences_link";
      else if (scope === "legal_footer_navigation" && isAemSharingPreferencesLink(webDestination, scopeElement, text.toLowerCase()))
        controlWitness = "aem_footer_sharing_preferences_link";
      else if (name === "your privacy choices" && scope === "legal_footer_navigation" &&
          scopeElement.matches("body > div.footer > div.footermid > .section-inner-footer") && policyPath.test(path))
        controlWitness = "named_privacy_policy_entrance";
      else if (legalRailScopes.get(scopeElement) === element && isLegalRailRoute(element))
        controlWitness = "named_privacy_policy_entrance";
    }
    if (publisherSettings) controlWitness = "cookie_preferences_do_not_sell";
    if (quantcastSettings) controlWitness = "quantcast_footer_sell_data";
    if (onetrustSellData) controlWitness = "onetrust_footer_sell_data";
    if (mspaSettings) controlWitness = "mspa_footer_handler";
    if (persistentAnchor) controlWitness = "quantcast_persistent_anchor";
    if (sheetMusicSettings) controlWitness = "hal_leonard_footer_handler";
    if (hearstSettings) controlWitness = "hearst_sale_ads_handler";
    if (contractedSaleSettings) controlWitness = "mspa_footer_contracted_sale_handler";
    if (onetrustTextSettings) controlWitness = "onetrust_footer_text_trigger";
    if (onetrustFormSettings) controlWitness = "onetrust_form_footer_settings";
    if (onetrustSlashSettings) controlWitness = "onetrust_footer_slash_sale_settings";
    if (onetrustRevealSettings) controlWitness = "onetrust_reveal_footer_settings";
    if (onetrustCustomFooterSettings) controlWitness = "onetrust_custom_legal_footer_settings";
    if (usercentricsSaleSettings) controlWitness = "usercentrics_footer_sale_settings";
    if (didomiSettings) controlWitness = "didomi_footer_settings";
    if (saleSharingSettings) controlWitness = "footer_sale_sharing_settings_anchor";
    if (ensightenSettings) controlWitness = "ensighten_footer_settings_anchor";
    if (saleSharingDialogSettings) controlWitness = noticeBoundFooterDialog
      ? "footer_sale_sharing_dialog_notice" : "footer_sale_sharing_dialog_anchor";
    if (!knownLabel && !controlWitness) {
      if (label.length <= 120 && (isWebAnchor || element instanceof HTMLButtonElement) &&
          /^(?:your (?:[a-z-]+ )?privacy choices\b|do not (?:sell(?:\s*\/\s*share| or share)?|share)(?: my (?:personal|information|info)\b|$))/i.test(label) && !inExcludedRegion(element)) {
        const name = label.toLowerCase();
        const knownScopedName = name === input.shortLabel || tabNotice.test(name) ||
          name === input.scopedNames.stateLabel || combinedLabel.test(name);
        limitations.add(knownScopedName ? "unverified_control" : "unsupported_control_name");
      }
      return;
    }
    let insideScope = false;
    for (let el: Element | null = element, depth = 0; el && depth++ < 100; el = parent(el)) {
      if (el === scopeElement) {insideScope = true; break;}
    }
    if (!insideScope || !element.matches(controls)) return;
    if (inExcludedRegion(element, footerColumn && scopeElement.contains(footerColumn) ? footerColumn : undefined)) return;
    let displayElement = element;
    let semanticRole: Candidate["semanticRole"] = publisherSettings || quantcastSettings || mspaSettings ||
      persistentAnchor || sheetMusicSettings || hearstSettings || contractedSaleSettings || onetrustTextSettings || onetrustFormSettings ||
      onetrustSlashSettings || onetrustRevealSettings || onetrustCustomFooterSettings || usercentricsSaleSettings || didomiSettings || saleSharingSettings || ensightenSettings ||
      saleSharingDialogSettings ? "settings_control" :
      element.matches('button,[role="button"]') ? "button" : "link";
    const alternateSettings = element.matches("a" + input.reviewedFooter.alternateSettingsId + ".ot-sdk-show-settings");
    const settingsId = alternateSettings ? input.reviewedFooter.alternateSettingsId : input.settingsIdSelector;
    const hrefLessSettings = element instanceof HTMLAnchorElement && href === null &&
      element.matches("a" + settingsId + ".ot-sdk-show-settings") &&
      pattern.test(text) && document.querySelectorAll(settingsId).length === 1 &&
      !!document.querySelector("#onetrust-consent-sdk #onetrust-pc-sdk") &&
      (alternateSettings || getComputedStyle(element).cursor === "pointer");
    if (hrefLessSettings) {
      semanticRole = "settings_control";
      controlWitness = "onetrust_no_href_anchor";
    }
    const settingsAnchor = element instanceof HTMLAnchorElement && href === "" &&
      element.classList.contains("ot-sdk-show-settings") && getComputedStyle(element).cursor === "pointer";
    let actionable = element instanceof HTMLButtonElement || settingsAnchor || hrefLessSettings ||
      publisherSettings || quantcastSettings || mspaSettings || persistentAnchor || sheetMusicSettings || hearstSettings || contractedSaleSettings ||
      onetrustTextSettings || usercentricsSaleSettings || didomiSettings || saleSharingSettings ||
      (element instanceof HTMLAnchorElement && Boolean(href?.trim()) && /^(?:http:|https:)$/.test(element.protocol)) ||
      (scope === "custom_legal_footer" && isCustomLegalDivButton(element)) ||
      (element.matches('[role="button"],[role="link"]') && element instanceof HTMLElement &&
        element.tabIndex >= 0 && Boolean(element.getAttribute("onclick")));
    if (element.matches("div.animated-link.oneTrust.ot-sdk-show-settings")) {
      const wrapper = element.closest(".--footer-link");
      const visual = wrapper?.querySelector(":scope > span.animated-link.--after");
      if (!visual || !text || ownText(visual).toLowerCase() !== text.toLowerCase() ||
          getComputedStyle(element).cursor !== "pointer") return;
      displayElement = visual;
      semanticRole = "settings_control";
      controlWitness = "onetrust_visible_label";
      actionable = true;
    }
    const comparableName = (value: string) => value.toLowerCase()
      .replace(/(?:\s*,\s*opens in a new tab| \(opens in a new tab\))$/, "")
      .replace(/\s*\/\s*share my personal information$/, " or share my personal information");
    const providerPath = !!webDestination && /^[a-z0-9-]+\.my\.onetrust\.com$/.test(webDestination.hostname) &&
      /^\/webform(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}){2}\/?$/i.test(webDestination.pathname);
    const namesAgree = comparableName(text) === comparableName(aria);
    const verifiedProviderDecoration = providerPath && pattern.test(text) &&
      comparableName(aria) === comparableName(text) + " company";
    const agreesWithAria = hearstSettings || saleSharingDialogSettings || controlWitness === "sale_sharing_subject_access_request" ||
      !aria || !text || aria.toLowerCase() === text.toLowerCase() ||
      (!!webDestination && (pattern.test(text) || linkPattern.test(text) || linkPattern.test(aria) ||
        controlWitness === "privacy_choices_tab_notice") && (namesAgree || verifiedProviderDecoration));
    actionable &&= !(element instanceof HTMLButtonElement && (element.matches(":disabled") ||
      (element.form && element.type === "submit" && !onetrustFormSettings))) &&
      element.getAttribute("aria-disabled") !== "true" && agreesWithAria &&
      (!ensightenSettings || !element.closest('[aria-hidden="true" i]'));
    return {element, displayElement, scopeElement, scope, label, semanticRole, actionable, href: href === null || !(element instanceof HTMLAnchorElement) ? href : element.href,
      ...(placementWitness ? {placementWitness} : {}), ...(controlWitness ? {controlWitness} : {})};
  }
  function stillMatches(item: Match): boolean {
    if (item.placementWitness === "funding_choices_ipr" && !isFundingChoicesIpr(item.element, item.scopeElement)) return false;
    if (item.scope === "custom_legal_footer" && item.controlWitness !== "onetrust_custom_legal_footer_settings" &&
        (!isCustomLegalFooter(item.scopeElement) || !isCustomLegalControl(item.element))) return false;
    if ((item.scope === "legal_footer_navigation" || item.scope === "namespaced_legal_footer") &&
        item.controlWitness !== "onetrust_footer_slash_sale_settings" && item.controlWitness !== "didomi_footer_settings" &&
        item.controlWitness !== "aem_footer_sharing_preferences_link" && item.controlWitness !== "onetrust_reveal_footer_settings" &&
        legalFooterScope(item.scopeElement) !== item.scope) return false;
    const next = matchControl(item.element, item.scopeElement, item.scope, item.placementWitness);
    return !!next && next.label === item.label && next.actionable === item.actionable && next.href === item.href &&
      next.displayElement === item.displayElement && next.controlWitness === item.controlWitness && next.semanticRole === item.semanticRole;
  }
  function discoverCustomLegalFooters() {
    const known = new Set<Element>();
    for (const [selector, cap] of [[customLegalGroups,24],["ul,ol",32]] as const) {
      if (!canWalk()) break;
      const groups = document.querySelectorAll(selector);
      for (let i = groups.length - 1; i >= Math.max(0, groups.length - cap) && canWalk(); i--) {
        if (seenFooters.size >= 16 || matched.length >= 16 || inspectedControls >= 200) return;
        const group = groups[i]!;
        if (known.has(group) || seenFooters.has(group) || selector !== customLegalGroups && !isLabeledLegalColumn(group)) continue;
        known.add(group);
        if (!isCustomLegalFooter(group)) continue;
        const elements = group.querySelectorAll('button,a[href],div[role="button"][tabindex]');
        if (elements.length > 24) {limitations.add("controls_limited");continue;}
        for (const element of elements) {
          if (seenControls.has(element)) continue;
          if (matched.length >= 16 || inspectedControls >= 200 || !withinBudget()) break;
          inspectedControls++;
          if (!isCustomLegalControl(element)) continue;
          const item = matchControl(element, group, "custom_legal_footer");
          if (!item?.actionable) continue;
          seenFooters.add(group);
          seenControls.add(element);
          matched.push(item);
        }
      }
    }
  }
  function discoverStrips() {
    const height = document.scrollingElement?.scrollHeight ?? 0;
    const selectors = {
      funding_choices_dns: ".fc-ccpa-root .fc-dns-dialog button" + input.strips.funding_choices_dns,
      ezoic_ccpa: "button" + input.strips.ezoic_ccpa,
      consumer_privacy_footer: "body > #consumer-privacy-footer-wrapper.consumer-privacy > button.consumer-privacy-btn" + input.strips.consumer_privacy_footer,
    };
    for (const placementWitness of ["funding_choices_dns", "ezoic_ccpa", "consumer_privacy_footer"] as const) {
      const items = document.querySelectorAll(selectors[placementWitness]);
      if (items.length !== 1 || !withinBudget()) continue;
      const element = items[0]!;
      const scope = placementWitness === "funding_choices_dns" ? element.closest(".fc-dns-dialog") : element.parentElement;
      if (!scope) continue;
      const box = element.getBoundingClientRect();
      if (box.height < 2 || box.top + scrollY < height - innerHeight ||
          box.bottom + scrollY > height + 2) continue;
      let normalFlow = true;
      for (let el: Element | null = element, depth = 0; el && depth++ < 100; el = parent(el)) {
        if (/^(?:fixed|sticky)$/.test(getComputedStyle(el).position)) {normalFlow = false; break;}
      }
      if (!normalFlow) continue;
      const item = matchControl(element, scope, "footer_strip", placementWitness);
      if (!item) continue;
      seenFooters.add(scope);
      seenControls.add(element);
      inspectedControls++;
      matched.push(item);
    }
  }
  function discoverFundingChoicesIpr() {
    for (let host = document.body?.lastElementChild, examined = 0; host && examined++ < 8 && withinBudget(); host = host.previousElementSibling) {
      if (seenFooters.size >= 16 || matched.length >= 16) break;
      const element = host.shadowRoot?.querySelector("div.ipr-container > button.ipr-button");
      if (!element || !isFundingChoicesIpr(element, host)) continue;
      const item = matchControl(element, host, "footer_strip", "funding_choices_ipr");
      if (!item) continue;
      seenFooters.add(host);
      seenControls.add(element);
      inspectedControls++;
      matched.push(item);
    }
  }
  function discoverTextTriggerInDenseFooter(): boolean {
    if (!withinBudget()) return false;
    const owner = document.querySelector(textTrigger);
    const footer = owner?.closest("footer");
    if (!owner || !footer || footer.getElementsByTagName("a").length <= 32) return false;
    const item = matchControl(owner, footer, "footer");
    if (!item?.actionable || item.controlWitness !== "onetrust_footer_text_trigger") return false;
    seenFooters.add(footer);
    seenControls.add(owner);
    inspectedControls++;
    matched.push(item);
    return true;
  }
  function scopedControls(scope: Element | ShadowRoot, kind: Candidate["scope"]) {
    if (seenScopes.has(scope) || !withinBudget()) return;
    seenScopes.add(scope);
    const items = scope.querySelectorAll(controls);
    // On large footers, inspect likely privacy routes before unrelated navigation can
    // consume the time or control cap. Every retained row still passes matchControl.
    const priority = items.length > 32 ? scope.querySelectorAll(
      'a[href*="opt-out" i],a[href*="optout" i],a[href*="privacy" i],a[href*="ccpa" i],.ot-sdk-show-settings,[aria-label*="privacy" i],[aria-label*="do not sell" i]') : [];
    for (const group of [priority,items]) {
      let selected=0;
      for (const element of group) {
        if (group === priority && ++selected > 32) break;
        if (seenControls.has(element) || !element.matches(controls)) continue;
        const namedHandlerScope = element.id === "hlYourPrivacyChoices" ? element.closest("footer #layoutFooterInformation") : null;
        if (namedHandlerScope && scope !== namedHandlerScope && legalFooterScope(namedHandlerScope)) continue;
        if (inspectedControls >= 200 || matched.length >= 16) {limitations.add("controls_limited"); break;}
        if (!withinBudget()) break;
        seenControls.add(element); inspectedControls++;
        const item = matchControl(element, scope instanceof ShadowRoot ? scope.host : scope, kind);
        if (item) matched.push(item);
      }
    }
    scopesToWalk.push({scope,kind});
  }
  const canWalk = () => {
    if (Date.now() < readDeadline-40) return true;
    limitations.add("traversal_limited");return false;
  };
  function walkFooterScope(scope: Element | ShadowRoot,kind: Candidate["scope"]) {
    // Open shadow descendants of a known footer inherit its landmark. An opaque custom element
    // or embedded frame prevents a negative across that part of this bounded inventory.
    if (scope instanceof Element && scope.shadowRoot) scopedControls(scope.shadowRoot, kind);
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    let n = 0;
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (++n > 1200 || !canWalk()) {limitations.add("traversal_limited"); break;}
      const el = node as Element;
      if (el.shadowRoot) scopedControls(el.shadowRoot, kind);
      else if (el.localName.includes("-") || el.matches("iframe,frame")) {
        // Astro can render the complete, separately enumerated native footer in light DOM.
        // This check describes that public subtree only. Other custom children and frames
        // retain their own opacity/coverage checks; an empty island remains unverified.
        const innerFooter = el.localName === "astro-island" ? el.querySelector(":scope > footer") : null;
        if (!innerFooter || !seenFooters.has(innerFooter) ||
            !matched.some(item=>innerFooter.contains(item.displayElement) && item.displayElement.getClientRects().length > 0))
          limitations.add("opaque_footer_content");
      }
    }
  }
  function legalFooterScope(element: Element): Candidate["scope"] | undefined {
    const legalRailTarget = legalRailScopes.get(element);
    if (legalRailTarget) return isLegalRailRoute(legalRailTarget) && isLegalRail(element, legalRailTarget) ? "legal_footer_navigation" : undefined;
    const parentElement = element.parentElement;
    const namespace = Array.from(element.classList)
      .map(token => /^(mc[0-9a-f]{8,16})_legalFooter$/i.exec(token)?.[1])
      .find(prefix => prefix && parentElement?.classList.contains(prefix + "_footer"));
    const isFooterNav = element.matches("#main-footer nav#main-footer-nav-v2");
    const isCompanyFooterNav = element.matches("body > div.footer > div.footermid > .section-inner-footer");
    const isF5LegalNav = element.matches("body > section#f5-footer #f5-footer-legal-links");
    const isMspaFooter = element.matches("body > div .container > #mspa-footer-html-id");
    const isPublisherFooter = element.matches("body .baseline-footer-wrapper .informa-legal-notice > .baseline-footer");
    const isQuantcastFooter = element.matches(quantcastFooter);
    const isCaLegalBar = element.matches(caLegalBar);
    const tree = element.getRootNode();
    const isThomsonFooter = element.matches(".emcmUi-GlobalFooter-under") &&
      (element.closest("dcl-globalfooter") || tree instanceof ShadowRoot && tree.host.localName === "dcl-globalfooter");
    const embeddedFooter = isThomsonFooter && Array.from(element.querySelectorAll("a.emcmUi-GlobalFooterUnder-link"))
      .slice(0, 8).some(anchor => isSensitiveDataFooterLink(anchor, element));
    const isReviewedLegalNav = element.matches(reviewedLegalNav) &&
      (!element.matches(".emcmUi-GlobalFooter-under") || isThomsonFooter) &&
      (!element.matches("div.footer-link") || !!element.querySelector('a[href*="/form/opt_out"]') &&
        !!element.querySelector('a[href*="privacy" i]:not([href*="/form/opt_out"])'));
    const tailTarget = namedTailScopes.get(element);
    if (tailTarget && !element.contains(tailTarget)) return;
    if (!namespace && !isFooterNav && !isCompanyFooterNav && !isF5LegalNav && !isMspaFooter && !isPublisherFooter &&
        !isQuantcastFooter && !isCaLegalBar && !isReviewedLegalNav && !tailTarget) return;
    const root = isFooterNav ? element.closest("#main-footer") : isCompanyFooterNav ? element.closest("div.footer") :
      isF5LegalNav ? element.closest("section#f5-footer") : isPublisherFooter ? element.closest(".baseline-footer-wrapper") :
      isQuantcastFooter ? element.closest(".container-choice-footer-msg") : isCaLegalBar ? element.closest(".m-footer__legal-bar") :
      isReviewedLegalNav || tailTarget ? element : parentElement;
    if (!root || root.closest('header,[role="banner"]') || inExcludedRegion(root) ||
        root.closest('main,[role="main"]') && !embeddedFooter) return;
    const height = document.scrollingElement?.scrollHeight ?? 0;
    const box = root.getBoundingClientRect();
    if (box.width < 2 || box.height < 2 || box.bottom + scrollY < height - innerHeight) return;
    for (let current: Element | null = root, depth = 0; current && depth++ < 100; current = parent(current)) {
      if (/^(?:fixed|sticky)$/.test(getComputedStyle(current).position)) return;
    }
    return namespace ? "namespaced_legal_footer" : "legal_footer_navigation";
  }
  function discoverLegalRail() {
    const routes = document.querySelectorAll<HTMLAnchorElement>(`a[href*="${input.scopedNames.cookiePolicyPath}"]`);
    for (let i = 0; i < Math.min(routes.length, 12) && withinBudget(); i++) {
      if (seenFooters.size >= 16 || matched.length >= 16 || inspectedControls >= 200) break;
      const anchor = routes[i]!;
      if (!isLegalRailRoute(anchor) || inExcludedRegion(anchor)) continue;
      for (let scope = anchor.parentElement, depth = 0; scope && depth < 3 && withinBudget(); scope = scope.parentElement, depth++) {
        if (seenFooters.has(scope) || !isLegalRail(scope, anchor)) continue;
        legalRailScopes.set(scope, anchor);
        const item = matchControl(anchor, scope, "legal_footer_navigation");
        if (!item) {legalRailScopes.delete(scope); break;}
        seenFooters.add(scope);
        seenControls.add(anchor);
        inspectedControls++;
        matched.push(item);
        break;
      }
    }
  }
  function discoverNamedTailLink(tree: Document | ShadowRoot) {
    // Where a page uses generic wrappers, a reviewed route and nearby legal
    // navigation establish scope together. Route text alone is insufficient.
    const routes = tree.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/privacy-policy#opt-out"],a[href*="/form/opt_out"],a[href$="/privacy/exercising-your-rights"]');
    const apex = location.hostname.replace(/^www\./, "");
    for (let i = 0; i < Math.min(routes.length, 24); i++) {
      if (!withinBudget() || seenFooters.size >= 16 || matched.length >= 16 || inspectedControls >= 200) break;
      const anchor = routes[i]!;
      if (seenControls.has(anchor) || inExcludedRegion(anchor) || anchor.protocol !== "https:" || anchor.username ||
          anchor.password || anchor.hasAttribute("download") || !pattern.test(ownText(anchor))) continue;
      const relevantRoute = anchor.origin === location.origin && anchor.pathname === "/privacy-policy" && anchor.hash === "#opt-out" ||
        anchor.hostname === "preferences." + apex && anchor.pathname === "/form/opt_out" ||
        anchor.hostname === "legal." + apex && anchor.pathname === "/docs/policies/privacy/exercising-your-rights";
      if (!relevantRoute) continue;
      for (let scope = anchor.parentElement, depth = 0; scope && depth < 8 && withinBudget(); scope = scope.parentElement, depth++) {
        const neighbors = scope.querySelectorAll("a[href]");
        if (neighbors.length > 32) break;
        const labels = Array.from(neighbors).filter(link => link !== anchor).map(link => ownText(link).toLowerCase());
        if (!labels.some(label => /^(?:privacy (?:policy|notice|statement)|cookie policy)(?:\s|$)/.test(label)) ||
            !labels.some(label => /^(?:terms\b|legal\b|cookie preferences\b|accessibility\b)/.test(label))) continue;
        namedTailScopes.set(scope, anchor);
        const kind = legalFooterScope(scope);
        const item = kind && matchControl(anchor, scope, kind);
        if (!item) {namedTailScopes.delete(scope); break;}
        seenFooters.add(scope);
        seenControls.add(anchor);
        inspectedControls++;
        matched.push(item);
        break;
      }
    }
  }
  function discover(tree: Document | ShadowRoot) {
    if (seenTrees.has(tree) || !withinBudget()) return;
    if (seenTrees.size >= 24) {limitations.add("traversal_limited");return;}
    seenTrees.add(tree);
    for (const el of tree.querySelectorAll(landmarks + "," + legalLandmarks)) {
      if (!withinBudget()) break;
      if (seenFooters.has(el) || inExcludedRegion(el)) continue;
      if (seenFooters.size >= 16) {limitations.add("traversal_limited");break;}
      const scope = el.matches(landmarks) ? el.localName === "footer" ? "footer" :
        el.getAttribute("role") === "contentinfo" ? "contentinfo" : "footer_strip" : legalFooterScope(el);
      if (!scope) continue;
      seenFooters.add(el);
      if (el.localName.includes("-") && !el.shadowRoot) limitations.add("opaque_footer_content");
      scopedControls(el, scope);
    }
    if (canWalk()) discoverNamedTailLink(tree);
    if (tree === document && canWalk()) discoverCustomLegalFooters();
    treesToWalk.push(tree);
  }
  function discoverOpenPublisherFooter() {
    // A known publisher footer mounts its native landmark inside an open
    // shadow root. Read that root before the generic bidirectional tree walk.
    const host = document.querySelector("blz-nav-footer");
    const root = host?.shadowRoot;
    if (!host || !root || inExcludedRegion(host) || !canWalk()) return;
    const footer = root.querySelector("footer");
    if (!footer) return;
    discover(root);
    const trademark = footer.querySelector("blz-nav-content-block#trademark")?.shadowRoot;
    if (seenFooters.has(footer) && trademark) scopedControls(trademark, "footer");
  }
  function walkForAdditionalFooters(tree: Document | ShadowRoot) {
    // Search both ends. A long article must not exhaust every slot before a
    // document-end open shadow host is seen. Known footer scopes are walked separately.
    const skipKnown = {acceptNode: (n: Node) => seenScopes.has(n as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT};
    const front=document.createTreeWalker(tree,NodeFilter.SHOW_ELEMENT,skipKnown);
    const back=document.createTreeWalker(tree,NodeFilter.SHOW_ELEMENT,skipKnown);
    let head=front.nextNode(), tail=back.lastChild();
    for (let depth=0;tail && depth<100;depth++) {
      const last=back.lastChild();if (!last) break;tail=last;
    }
    const visited=new Set<Node>();
    for (let n=0;head || tail;n++) {
      if (n>=3200 || !canWalk()) {limitations.add("traversal_limited");break;}
      const fromEnd=n%2===0 && !!tail || !head;
      const node=(fromEnd ? tail : head)!;
      if (visited.has(node)) break;
      visited.add(node);
      const el=node as Element;
      if (el.shadowRoot) discover(el.shadowRoot);
      else if (el.localName.includes("-") && /footer/i.test(el.localName)) limitations.add("opaque_footer_content");
      if (fromEnd) tail=back.previousNode();else head=front.nextNode();
      if (tail===tree) tail=null;
    }
  }
  function geometry(element: Element, actionable: boolean, view: Candidate["view"], displayElement: Element,
    retainIframeOcclusions: boolean, probeCustomFooterClipping = false, allowNativeModalOcclusion = false): Visibility {
    const rect = displayElement.getBoundingClientRect();
    const facts = {view, bounds: [rect.x,rect.y,rect.width,rect.height].map(n => Math.round(n*100)/100) as Visibility["bounds"],
      testedPoints: 0, matchingPoints: 0, occludingPoints: 0};
    let iframeOccludingPoints = 0;
    const ownStyle = getComputedStyle(displayElement);
    if (ownStyle.visibility === "hidden" || ownStyle.visibility === "collapse") return {...facts, visibility:"hidden"};
    for (let el: Element | null = displayElement, depth=0; el; el=parent(el)) {
      if (++depth > 100) return {...facts, visibility:"unverified"};
      const style = getComputedStyle(el);
      if (el.hasAttribute("hidden") || style.display === "none" || style.contentVisibility === "hidden" ||
          Number(style.opacity) === 0) return {...facts, visibility:"hidden"};
      if (el.hasAttribute("inert")) actionable = false;
    }
    if (!actionable || !element.isConnected || getComputedStyle(element).pointerEvents === "none" ||
        !(facts.bounds[2] >= 2 && facts.bounds[3] >= 2)) return {...facts, visibility:"unverified"};
    const viewportLeft = Math.max(0, rect.left), viewportTop = Math.max(0, rect.top);
    const viewportRight = Math.min(innerWidth, rect.right), viewportBottom = Math.min(innerHeight, rect.bottom);
    let left = viewportLeft, top = viewportTop, right = viewportRight, bottom = viewportBottom;
    if (right <= left || bottom <= top) return {...facts, visibility:"offscreen_unverified"};
    // A scroller or clip is not an independently observed overlay.
    for (let el = parent(element), depth = 0; el && depth++ < 100; el = parent(el)) {
      if (el === document.documentElement || el === document.body) break;
      const style = getComputedStyle(el), box = el.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {left=Math.max(left,box.left);right=Math.min(right,box.right);}
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}
    }
    if (right <= left || bottom <= top) {
      if (!probeCustomFooterClipping) return {...facts, visibility:"unverified"};
      // An absolute layout can escape an intermediate overflow ancestor when
      // its containing block is outside it. The live pointer stack resolves
      // this case without treating the assumed rectangle as positive evidence.
      left = viewportLeft; top = viewportTop; right = viewportRight; bottom = viewportBottom;
    }
    const points: Array<[number, number]> = [];
    const fragments = displayElement.getClientRects();
    if (fragments.length > 1) {
      // Inline links can wrap into rectangles with gaps that belong to other elements.
      // Sample their actual fragments before claiming that an overlay covers the link.
      for (let i = 0; i < Math.min(fragments.length, 8) && points.length < 5; i++) {
        const fragment = fragments[i]!;
        const x1 = Math.max(left, fragment.left), x2 = Math.min(right, fragment.right);
        const y1 = Math.max(top, fragment.top), y2 = Math.min(bottom, fragment.bottom);
        if (x2 > x1 && y2 > y1) points.push([(x1+x2)/2, (y1+y2)/2]);
      }
    } else {
      for (const [x,y] of [[.5,.5],[.2,.25],[.8,.25],[.2,.75],[.8,.75]] as const) {
        points.push([left+(right-left)*x, top+(bottom-top)*y]);
      }
    }
    for (const [px,py] of points) {
      let hit = document.elementFromPoint(px,py);
      for (let i=0; hit?.shadowRoot && i<12; i++) {
        const inner = hit.shadowRoot.elementFromPoint(px,py);
        if (!inner || inner === hit) break;
        hit=inner;
      }
      facts.testedPoints++;
      if (!hit) continue;
      let matches=false, ancestor=false;
      for (let el: Element | null=hit, depth=0; el && depth++<100; el=parent(el)) if(el===element) {matches=true;break;}
      if (matches) {facts.matchingPoints++;continue;}
      for (let el: Element | null=element, depth=0; el && depth++<100; el=parent(el)) if(el===hit) {ancestor=true;break;}
      // A background html/body/ancestor hit does not prove an overlay covers the control.
      // Native modal inertness can remove the otherwise laid-out owner from the hit stack.
      const modalIntercept = allowNativeModalOcclusion && !!hit.closest("dialog:modal");
      if (!ancestor && hit !== document.body && hit !== document.documentElement && (modalIntercept || beneathPointer(element,px,py))) {
        facts.occludingPoints++;
        if (retainIframeOcclusions && hit instanceof HTMLIFrameElement) iframeOccludingPoints++;
      }
    }
    return {...facts, ...(iframeOccludingPoints ? {iframeOccludingPoints} : {}), visibility:facts.matchingPoints ? "rendered_exposed" :
      facts.testedPoints > 0 && facts.occludingPoints === facts.testedPoints ? "covered" : "unverified"};
  }
  // A different topmost element by itself can be the background of a clipped or
  // non-hit-testable target. Verify the target is in the stack underneath it.
  function beneathPointer(target: Element, x: number, y: number): boolean {
    for (let current=target, depth=0; depth<12; depth++) {
      const root=current.getRootNode();
      if (!(root instanceof Document || root instanceof ShadowRoot)) return false;
      if (!root.elementsFromPoint(x,y).some(el => current === el || current.contains(el))) return false;
      if (root instanceof Document) return true;
      current=root.host;
    }
    return false;
  }
  function readStartingBanner(): Read["startingBanner"] {
    if (!withinBudget()) return;
    const controls = document.querySelectorAll("#onetrust-pc-btn-handler");
    const button = controls[0];
    if (controls.length !== 1 || !(button instanceof HTMLButtonElement) || button.matches(':disabled,[form],[aria-disabled="true"]') || button.form ||
        button.closest('[hidden],[inert],[aria-hidden="true" i],footer')) return;
    const banner = button.closest("#onetrust-consent-sdk #onetrust-banner-sdk");
    const group = button.closest("#onetrust-button-group");
    if (!banner || !group || !banner.contains(group) || document.querySelectorAll("#onetrust-banner-sdk").length !== 1 ||
        !group.querySelector("button:is(#onetrust-accept-btn-handler,#onetrust-reject-all-handler)")) return;
    const label = ownText(button);
    const ariaLabel = normalize(button.getAttribute("aria-label") ?? "");
    if (!pattern.test(label) || ![", opens the preference center dialog", ", opens preference center dialog"]
      .some(suffix => ariaLabel.toLowerCase() === label.toLowerCase()+suffix)) return;
    const {testedPoints,matchingPoints} = geometry(button,true,"original",button,false);
    return testedPoints === 5 && matchingPoints >= 3 ? {label,ariaLabel,testedPoints,matchingPoints,atEpochMs:Date.now()} : undefined;
  }
  function discoverPendingFooterReveal(): boolean {
    const links = document.querySelectorAll('footer a[href*="privacy-choices"],footer a[href*="privacy-rights"],' + ensightenFooterAnchor);
    if (links.length > 8 || !canWalk()) return false;
    const pending: Match[] = [];
    for (const link of links) {
      if (seenControls.has(link) || !withinBudget()) continue;
      const scope = link.closest(link.matches(ensightenFooterAnchor) ? landmarks : "footer");
      const box = link.getBoundingClientRect();
      if (!scope || box.width < 2 || box.height < 2 || box.top < innerHeight) continue;
      const kind = scope.matches("footer") ? "footer" : scope.matches('[role="contentinfo"]') ? "contentinfo" : "footer_strip";
      const item = matchControl(link, scope, kind);
      if (item?.actionable && (item.controlWitness === "ensighten_footer_settings_anchor" || hasPendingFooterReveal(item))) pending.push(item);
    }
    const [item] = pending;
    if (pending.length !== 1 || !item) return false;
    seenFooters.add(item.scopeElement);
    seenControls.add(item.element);
    inspectedControls++;
    matched.push(item);
    return true;
  }
  function discoverBoundFooterControls(): boolean {
    if (!canWalk()) return false;
    const owners = document.querySelectorAll([
      `footer a[href*="${input.reviewedFooter.saleSharingRequestPath}"]`,
      `footer a[href*="${input.reviewedFooter.slashSaleFormPath}"]`,
      `${oneTrustLegalFooter} button${input.settingsIdSelector}`,
      'a[href^="javascript:"][href*="UC_UI.showSecondLayer"]',
      didomiFooterControl,
      `footer a[href*="${input.reviewedFooter.dataPrivacyPreferencesPath}"]`,
      `footer ${saleSharingSettingsAnchor}`,
      footerDialogAnchor,
      `${input.aemFooter.link}[href*="${input.aemFooter.path}"]`,
      "button" + oneTrustHook,
    ].join(","));
    if (owners.length > 8) return false;
    const bound: Match[] = [];
    const positioned: Match[] = [];
    for (const element of owners) {
      if (!withinBudget()) return false;
      const isOneTrustButton = element.matches("button" + oneTrustHook);
      const custom = isOneTrustButton ? customOneTrustFooterScope(element) : undefined;
      const reveal = isOneTrustButton && !custom ? revealFooterScope(element) : undefined;
      const footer = custom ?? reveal ?? (element instanceof HTMLButtonElement ? element.closest(oneTrustLegalFooter) :
        element.matches(didomiFooterControl) ? element.closest(didomiFooterScope) :
        element.matches(input.aemFooter.link) ? element.closest(input.aemFooter.root) :
        element.closest("footer") ?? element.closest('[role="contentinfo"],.site-footer'));
      if (!footer) continue;
      const scope = custom ? "custom_legal_footer" : reveal ? "legal_footer_navigation" : footer.localName === "footer" ? "footer" : footer.matches('[role="contentinfo"]') ? "contentinfo" :
        element instanceof HTMLButtonElement || footer.matches(`#mnFooter,${input.aemFooter.root}`) ? "legal_footer_navigation" : "footer_strip";
      const item = matchControl(element, footer, scope);
      if (!item?.actionable || !["sale_sharing_subject_access_request", "onetrust_footer_slash_sale_settings",
        "footer_slash_sale_form_link", "usercentrics_footer_sale_settings", "didomi_footer_settings", "footer_data_privacy_preferences_link",
        "footer_sale_sharing_settings_anchor", "aem_footer_sharing_preferences_link", "onetrust_reveal_footer_settings",
        "footer_sale_sharing_dialog_anchor", "footer_sale_sharing_dialog_notice", "onetrust_custom_legal_footer_settings"].includes(item.controlWitness ?? "")) continue;
      bound.push(item);
      const box = item.displayElement.getBoundingClientRect();
      if (box.width >= 2 && box.height >= 2) positioned.push(item);
    }
    const [owner, secondOwner] = positioned;
    if (!owner || secondOwner) return false;
    // Keep the boxless responsive duplicate in evidence, but test the unique
    // laid-out owner first. Every retained row still needs pointer proof.
    for (const item of [owner, ...bound.filter(row => row !== owner)]) {
      seenFooters.add(item.scopeElement);
      seenControls.add(item.element);
      inspectedControls++;
      matched.push(item);
    }
    return true;
  }
  // The initial viewport is still untouched, before any footer positioning.
  const startingBanner = readStartingBanner();
  discoverStrips();
  // A well-bound end strip can move when a long page appends content after
  // scrolling. Reserve the existing read for it before optional DOM sweeps.
  const longPage = (document.scrollingElement?.scrollHeight ?? 0) >= innerHeight * 16;
  const prioritizedStrip = (input.prioritizeFundingChoicesStrip || longPage) &&
    matched.some(item => item.placementWitness === "funding_choices_dns" && item.actionable);
  if (!prioritizedStrip) discoverFundingChoicesIpr();
  const prioritizedTextTrigger = !prioritizedStrip && discoverTextTriggerInDenseFooter();
  const prioritizedBoundControl = !matched.length && discoverBoundFooterControls();
  const prioritizedReveal = !matched.length && discoverPendingFooterReveal();
  const pendingReveal = prioritizedReveal ? matched.find(hasPendingFooterReveal) : undefined;
  const pendingOneTrust = input.allowOneTrustCustomFooterReveal && prioritizedBoundControl &&
    matched[0]?.controlWitness === "onetrust_custom_legal_footer_settings" && hasPendingFooterReveal(matched[0]);
  if (pendingOneTrust) readDeadline = input.oneTrustFooterDeadline;
  if (pendingReveal) readDeadline = pendingReveal.controlWitness === "ensighten_footer_settings_anchor" && input.allowEnsightenFooterReveal
    ? input.deadline : input.opacityDeadline;
  const usedExtendedReveal = readDeadline > input.ordinaryDeadline;
  if (prioritizedStrip || prioritizedTextTrigger || prioritizedBoundControl || prioritizedReveal) limitations.add("traversal_limited");
  else {
    discoverOpenPublisherFooter();
    discoverLegalRail();
    discover(document);
  }
  const candidates: Candidate[] = [];
  let positionedOnce=false;
  function hasPendingFooterReveal(item: Match): boolean {
    const anchor = item.element;
    const boundSettings = item.controlWitness === "ensighten_footer_settings_anchor" ||
      item.controlWitness === "onetrust_custom_legal_footer_settings";
    if (!boundSettings && (item.scope !== "footer" || !(anchor instanceof HTMLAnchorElement) || anchor.origin !== location.origin ||
        anchor.protocol !== "https:" || !tabPath.test(anchor.pathname) || anchor.search || anchor.hash ||
        anchor.username || anchor.password || anchor.hasAttribute("download") || !/^your (?:california )?privacy choices$/i.test(item.label))) return false;
    let transparent = false;
    for (let node: Element | null = anchor, depth = 0; node && depth++ < 32; node = parent(node)) {
      const style = getComputedStyle(node);
      if (node.matches('[hidden],[inert],[aria-hidden="true" i]') || style.display === "none" ||
          style.contentVisibility === "hidden" || style.visibility === "collapse" || (!boundSettings && style.visibility !== "visible")) return false;
      transparent ||= Number(style.opacity) === 0 || (boundSettings && style.visibility === "hidden");
    }
    return transparent;
  }
  async function measureDiscovered(startIndex: number) {
    for (let index=startIndex;index<matched.length;index++) {
      const item=matched[index]!;
      if (!withinBudget()) break;
      candidates.push({evidenceId:`footer-control-${index}`, label:item.label,scope:item.scope,semanticRole:item.semanticRole,
        ...(item.placementWitness ? {placementWitness: item.placementWitness} : {}),
        ...(item.controlWitness ? {controlWitness: item.controlWitness} : {}),
        ...geometry(item.element, item.actionable, "original", item.displayElement, item.placementWitness === "funding_choices_dns",
          item.scope === "custom_legal_footer", item.controlWitness === "footer_sale_sharing_dialog_anchor" ||
          item.controlWitness === "footer_sale_sharing_dialog_notice")});
    }
    // Only positioned reads yield to the renderer. All ordinary first-view controls retain
    // their original checkpoint and the same capture budget.
    type Item = typeof matched[number];
    type Phase = "initial" | "positioned" | "settled" | "alternate" | "reveal";
    function checkpoint(phase: Phase, facts: Visibility) {
      return {phase, elapsedMs: Math.round(performance.now()-started), scrollX: Math.round(scrollX), scrollY: Math.round(scrollY),
        view:facts.view, visibility:facts.visibility, bounds:facts.bounds, testedPoints:facts.testedPoints,
        matchingPoints:facts.matchingPoints, occludingPoints:facts.occludingPoints,
        ...(facts.iframeOccludingPoints ? {iframeOccludingPoints:facts.iframeOccludingPoints} : {})};
    }
    function targetY(item: Item, fraction: number): number | undefined {
      if (item.controlWitness === "onetrust_reveal_footer_settings")
        return Math.max(0,(document.scrollingElement?.scrollHeight ?? 0)-innerHeight);
      if (item.controlWitness === "ensighten_footer_settings_anchor") {
        const box = item.displayElement.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) return;
        // Leave a pixel at the lower edge. A fixed notice can cover the
        // ordinary center alignment while this same owner is reachable here.
        return Math.max(0, Math.min((document.scrollingElement?.scrollHeight ?? 0)-innerHeight, scrollY+box.bottom-innerHeight+1));
      }
      // If the control is boxless, position its closest rendered ancestor inside the
      // verified footer. Neither body nor a separate landmark stands in for this control.
      for (let el: Element | null = item.displayElement, depth=0; el && depth++ < 100; el=parent(el)) {
        if (el === document.body || el === document.documentElement) return;
        const rect=el.getBoundingClientRect();
        if (rect.width >= 2 && rect.height >= 2) {
          const anchor = rect.height > innerHeight ? rect.bottom : rect.top + rect.height/2;
          return Math.min(Math.max(0, (document.scrollingElement?.scrollHeight ?? 0)-innerHeight),
            Math.max(0, scrollY+anchor-innerHeight*fraction));
        }
        if (el === item.scopeElement) break;
      }
      return;
    }
    function renderOpportunity(): Promise<void> {
      // Give scroll/IntersectionObserver callbacks one rendering opportunity, then observe at a
      // second animation frame. A hidden/background tab cannot consume the remaining reserve.
      const budget = Math.min(45, readDeadline-Date.now()-25);
      if (budget <= 0) return Promise.resolve();
      return new Promise(resolve => {
        let frame=0;
        const finish = () => {window.clearTimeout(timer); window.cancelAnimationFrame(frame); resolve();};
        const timer=window.setTimeout(finish,budget);
        frame=window.requestAnimationFrame(() => {frame=window.requestAnimationFrame(finish);});
      });
    }
    function checkPosition(index: number, phase: Exclude<Phase,"initial">) {
      const item=matched[index]!, row=candidates[index]!;
      const ensighten = item.controlWitness === "ensighten_footer_settings_anchor";
      const needsSettledExposure = item.placementWitness === "funding_choices_dns" || item.placementWitness === "funding_choices_ipr" ||
        item.controlWitness === "footer_sale_sharing_settings_anchor" || item.controlWitness === "onetrust_reveal_footer_settings" ||
        item.controlWitness === "onetrust_custom_legal_footer_settings" || ensighten;
      let facts=geometry(item.element,item.actionable,"footer_position",item.displayElement,needsSettledExposure,
        item.scope === "custom_legal_footer", item.controlWitness === "footer_sale_sharing_dialog_anchor" ||
          item.controlWitness === "footer_sale_sharing_dialog_notice");
      const bound = stillMatches(item);
      if (!bound) facts={...facts,visibility:"unverified",testedPoints:0,matchingPoints:0,occludingPoints:0,iframeOccludingPoints:undefined};
      row.checkpoints!.push(checkpoint(phase,facts));
      // Some end-of-page controls can be reached before scroll-driven overlays paint.
      // Retain the raw hit and require the bounded second read before publishing exposure.
      const verifiedReveal = phase === "reveal" && item.controlWitness === "onetrust_custom_legal_footer_settings";
      if (needsSettledExposure && phase !== "settled" && !verifiedReveal && !(ensighten && (phase === "reveal" || phase === "alternate")) &&
          facts.visibility === "rendered_exposed") return;
      if (!bound || facts.visibility === "rendered_exposed" || row.visibility !== "rendered_exposed" &&
          (row.visibility !== "covered" || facts.visibility === "covered")) {
        Object.assign(row,facts);
        if (facts.iframeOccludingPoints === undefined) delete row.iframeOccludingPoints;
      }
    }
    let primary = candidates.findIndex((c,i) => matched[i]!.actionable &&
      (c.visibility === "offscreen_unverified" || c.visibility === "hidden" || c.visibility === "unverified" ||
       c.visibility === "covered") && targetY(matched[i]!, .45) !== undefined);
    const first = candidates[primary];
    const firstOwner = matched[primary];
    const hasHorizontalOverlap = ({bounds: [left,,width]}: Candidate) => width >= 2 && left < innerWidth && left + width > 0;
    if (first && firstOwner?.href && (first.visibility === "hidden" || !hasHorizontalOverlap(first))) {
      // A hidden responsive copy can appear earlier in the footer inventory.
      // Spend the same positioning opportunity on the laid-out owner of that exact link.
      const peer = candidates.findIndex((row, index) => row.visibility === "offscreen_unverified" &&
        row.label.toLowerCase() === first.label.toLowerCase() && matched[index]!.href === firstOwner.href &&
        hasHorizontalOverlap(row) && matched[index]!.actionable && targetY(matched[index]!, .45) !== undefined);
      if (peer >= 0) primary = peer;
    }
    if (primary >= 0 && !positionedOnce && withinBudget()) {
      positionedOnce=true;
      const oldX=scrollX, oldY=scrollY, chosen=matched[primary]!;
      const initial=candidates.map(c=>checkpoint("initial",c));
      const indices: number[]=[];
      function documentEndTarget(item: Item): number | undefined {
        const box = item.displayElement.getBoundingClientRect();
        const bottom = Math.max(0,(document.scrollingElement?.scrollHeight ?? 0) - innerHeight);
        return box.bottom+scrollY > bottom && box.top+scrollY < bottom+innerHeight ? bottom : undefined;
      }
      function includeNeighborsInView() {
        for (const [i,item] of matched.entries()) {
          if (i>=candidates.length || !withinBudget()) break;
          if (!item.actionable || candidates[i]!.visibility === "rendered_exposed" || indices.includes(i)) continue;
          const rect=item.displayElement.getBoundingClientRect();
          if (item.scopeElement !== chosen.scopeElement && !(rect.width>=2 && rect.height>=2 && rect.right>0 && rect.left<innerWidth &&
              rect.bottom>0 && rect.top<innerHeight)) continue;
          candidates[i]!.checkpoints=[initial[i]!];
          indices.push(i);
        }
      }
      try {
        const ordinaryEnsightenRead = chosen.controlWitness === "ensighten_footer_settings_anchor" && !input.allowEnsightenFooterReveal;
        const initialTarget = (prioritizedReveal && !ordinaryEnsightenRead) || pendingOneTrust ? documentEndTarget(chosen) : undefined;
        window.scrollTo({left:oldX,top:initialTarget ?? targetY(chosen,.45)!,behavior:"instant"});
        includeNeighborsInView();
        for (const i of indices) if (withinBudget()) checkPosition(i,"positioned");
        if (indices.some(i=>candidates[i]!.visibility !== "rendered_exposed") && readDeadline-Date.now() > 25) {
          await renderOpportunity();
          if (location.href !== input.expectedUrl) return;
          includeNeighborsInView();
          for (const i of indices) if (withinBudget()) checkPosition(i,"settled");
        }
        const reveal=indices.find(i => candidates[i]!.visibility === "hidden" && candidates[i]!.bounds[2] >= 2 &&
          candidates[i]!.bounds[3] >= 2 && (matched[i]!.controlWitness !== "onetrust_custom_legal_footer_settings" || pendingOneTrust) &&
          hasPendingFooterReveal(matched[i]!));
        if (reveal !== undefined && readDeadline - Date.now() >= 63) {
          const item = matched[reveal]!;
          const footerSettings = item.controlWitness === "ensighten_footer_settings_anchor";
          if (pendingOneTrust && item.controlWitness === "onetrust_custom_legal_footer_settings") {
            // A scroll-triggered entrance animation can leave its laid-out control
            // transparent for several hundred milliseconds even on a settled page.
            for (const checkpointMs of [650, 900]) {
              const delay = Math.max(0, checkpointMs - (performance.now() - started));
              if (delay + 45 >= readDeadline - Date.now()) break;
              await new Promise<void>(resolve => {window.setTimeout(resolve,delay);});
              if (location.href !== input.expectedUrl) return;
              if (!stillMatches(item) || !hasPendingFooterReveal(item)) break;
            }
          } else if (footerSettings && input.allowEnsightenFooterReveal) {
            // Scroll anchoring and transitions can move the footer during the initial reveal.
            // Leave that scroll undisturbed before letting the browser align the same owner.
            for (const checkpointMs of [650, 1250, 1700]) {
              const delay = Math.max(0, checkpointMs - (performance.now() - started));
              if (delay + 45 >= readDeadline - Date.now()) break;
              await new Promise<void>(resolve => {window.setTimeout(resolve,delay);});
              if (location.href !== input.expectedUrl) return;
              if (!stillMatches(item)) break;
              if (hasPendingFooterReveal(item)) continue;
              // Do not reposition a nested scroll container during the starting-page read.
              let nestedScroller = false;
              for (let ancestor = item.displayElement.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
                const style = getComputedStyle(ancestor);
                if (/(?:auto|scroll|hidden)/.test(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight ||
                    /(?:auto|scroll|hidden)/.test(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) {
                  nestedScroller = true;
                  break;
                }
              }
              if (nestedScroller) break;
              item.displayElement.scrollIntoView({block:"end", inline:"nearest", behavior:"instant"});
              await renderOpportunity();
              if (location.href !== input.expectedUrl) return;
              if (geometry(item.element,item.actionable,"footer_position",item.displayElement,true).visibility === "rendered_exposed") break;
            }
          } else {
            const bottom = footerSettings ? targetY(item,.99) : documentEndTarget(item);
            if (bottom !== undefined && (footerSettings ? Math.abs(bottom - scrollY) : bottom - scrollY) > 2)
              window.scrollTo({left:oldX,top:bottom,behavior:"instant"});
            const revealBudget = Math.min(360, readDeadline - Date.now() - 38);
            await new Promise<void>(resolve => {window.setTimeout(resolve,revealBudget);});
          }
          if (location.href !== input.expectedUrl) return;
          if (withinBudget()) checkPosition(reveal,"reveal");
        }
        const alternate=indices.find(i => candidates[i]!.checkpoints!.length < 4 &&
          (candidates[i]!.visibility === "covered" || candidates[i]!.visibility === "offscreen_unverified" ||
           candidates[i]!.visibility === "unverified" && candidates[i]!.bounds[2] >= 2 && candidates[i]!.bounds[3] >= 2));
        if (alternate !== undefined && (!pendingOneTrust || Date.now() < input.ordinaryDeadline - 15) && withinBudget()) {
          const item=matched[alternate]!;
          const rect=item.displayElement.getBoundingClientRect();
          let y=targetY(item,rect.top + rect.height/2 < innerHeight/2 ? .8 : .2);
          // At document end the usual alignment can clamp to the current position.
          // Move the link toward the lower edge only if some of its box stays in view.
          if (y!==undefined && Math.abs(y-scrollY)<=2 && candidates[alternate]!.visibility==="covered") {
            const edge=targetY(item,.99);
            if (edge!==undefined && rect.bottom+scrollY-edge>0 && rect.top+scrollY-edge<innerHeight) y=edge;
          }
          if (y !== undefined && Math.abs(y-scrollY)>2 && stillMatches(item)) {
            window.scrollTo({left:oldX,top:y,behavior:"instant"});
            if (location.href !== input.expectedUrl) return;
            // Re-test the same control, only if its rendered box actually intersects the alternate viewport.
            const positioned = item.displayElement.getBoundingClientRect();
            if (positioned.bottom>0 && positioned.top<innerHeight && withinBudget()) checkPosition(alternate,"alternate");
          }
        }
      } finally {
        window.scrollTo({left:oldX,top:oldY,behavior:"instant"});
        if (Math.abs(scrollX-oldX)>1 || Math.abs(scrollY-oldY)>1) limitations.add("scroll_restore_failed");
      }
    }
  }
  // Freeze evidence for visible native controls before any optional shadow expansion.
  await measureDiscovered(0);
  if (location.href!==input.expectedUrl) return;
  let scopeIndex=0, treeIndex=0;
  while ((scopeIndex<scopesToWalk.length || treeIndex<treesToWalk.length) && canWalk()) {
    if (scopeIndex<scopesToWalk.length) {
      const {scope,kind}=scopesToWalk[scopeIndex++]!;walkFooterScope(scope,kind);
    } else {walkForAdditionalFooters(treesToWalk[treeIndex++]!);}
    if (matched.length>candidates.length && withinBudget()) await measureDiscovered(candidates.length);
    if (location.href!==input.expectedUrl) return;
  }
  if (!seenFooters.size) limitations.add("no_footer_landmark");
  for (const c of candidates) if (c.checkpoints?.length === 1) delete c.checkpoints;
  if (candidates.some(c => c.visibility === "unverified" || c.visibility === "offscreen_unverified")) limitations.add("unverified_control");
  return {coverage: limitations.size ? "limited" : "complete", limitations:[...limitations], viewport,
    inspectedControls,footerCount:seenFooters.size,candidates,startingBanner,usedExtendedReveal};
}

// Keep bundler-injected function-name helpers local to this one browser evaluation.
const footerBrowserRead = new Function("input", `const __name = fn => fn; return (${readFooter.toString()})(input)`) as typeof readFooter;
