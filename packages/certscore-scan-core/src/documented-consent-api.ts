import { createHash } from "node:crypto";
import type { ElementHandle, Frame, Locator, Page } from "playwright";
import type { ConsentConfirmationReason } from "@certscore/contracts";
import type { CmpApiConsentSnapshot } from "./cmp-api-consent-state.js";

export type DocumentedConsentProvider = "cookie_information" | "cookiescript" | "finsweet";
export const COOKIE_INFORMATION_STATE_POLICY = "cookie_information_active_categories.v2";
export type CookieInformationReadBinding =
  | { control: Locator | ElementHandle<HTMLElement | SVGElement> }
  | { actionDispatchedAtEpochMs: number };

/** Passive documented getters and saved-decision events only. No queues,
 * initialization, consent setters, UI actions or network calls are invoked.
 * Callers must bind the provider to the live control's canonical CMP scope.
 */
export async function readDocumentedConsentApi(
  scope: Page | Frame,
  provider: DocumentedConsentProvider,
  onDiagnostic?: (reason: ConsentConfirmationReason) => void,
  binding?: CookieInformationReadBinding,
): Promise<CmpApiConsentSnapshot | undefined> {
  const read = async () => {
    const control = binding && "control" in binding ? binding.control : undefined;
    let acquired: ElementHandle<HTMLElement | SVGElement> | undefined;
    let element: ElementHandle<HTMLElement | SVGElement> | undefined;
    if (control && "elementHandle" in control) {
      const resolved = await control.elementHandle({timeout: 75}).catch(() => undefined);
      if (!resolved) return { diagnostic: "receipt_missing" as const };
      acquired = resolved;
      element = resolved;
    } else {
      element = control;
    }
    return scope.evaluate(({ provider, cookieInformationPolicy, control, actionAt }) => {
      type State = { canonicalState: string; decision: "granted" | "denied" | "mixed" | "unknown"; configuration: string };
      type Tracker = {
        api: unknown; sequence: number; at?: number; state?: State;
        control?: Element; owner?: Element; clickedAt?: number;
      };
      const target = window as unknown as {
        __tcfapi?: unknown;
        CookieInformation?: { getConsentGivenFor?: (category: string) => unknown };
        CookieScript?: { instance?: { currentState?: () => unknown; categories?: () => unknown } };
        FinsweetConsentPro?: { consents?: { get?: () => unknown } };
        __certscoreDocumentedDecisionReaders?: Partial<Record<typeof provider, Tracker>>;
      };
      if (provider === "cookie_information" && typeof target.__tcfapi === "function") {
        return { diagnostic: "category_iab_unsupported" as const };
      }
      let owner: Element | undefined;
      if (control) {
        owner = control.closest("#coiOverlay") ?? undefined;
        if (!(control instanceof HTMLButtonElement) || !control.isConnected ||
            control.getRootNode() !== document || !owner) return { diagnostic: "receipt_missing" as const };
        if (document.querySelectorAll("#coiOverlay").length !== 1) return { diagnostic: "receipt_ambiguous" as const };
      } else if (actionAt === undefined) {
        const bannerSelector = provider === "finsweet" ? '[fs-consent-element="banner"]'
          : provider === "cookiescript" ? "#cookiescript_injected" : "#coiOverlay, [id*='cookie-information' i]";
        const bannerCount = document.querySelectorAll(bannerSelector).length;
        if (bannerCount !== 1) {
          return provider === "cookie_information"
            ? { diagnostic: bannerCount ? "receipt_ambiguous" as const : "receipt_missing" as const }
            : undefined;
        }
      }
      const api = provider === "cookie_information" ? target.CookieInformation
        : provider === "cookiescript" ? target.CookieScript?.instance : target.FinsweetConsentPro?.consents;
      if (!api || (provider === "cookie_information" && typeof target.CookieInformation?.getConsentGivenFor !== "function") ||
        (provider === "cookiescript" && (typeof target.CookieScript?.instance?.currentState !== "function" || typeof target.CookieScript.instance.categories !== "function")) ||
        (provider === "finsweet" && typeof target.FinsweetConsentPro?.consents?.get !== "function")) return undefined;
      // The configured categories are available independently of the visitor’s decision.
      let cookieScriptConfiguration: string | undefined;
      const reader = { read(): State | undefined {
        let entries: Array<[string, boolean]>;
        let configuration: string[];
        if (provider === "cookie_information") {
          // The reviewed writer installs its active universe in cicl, and its
          // getter returns cicc[category]. Reuse those already-loaded own data
          // properties in this existing evaluation: no extra getter or SDK call.
          const data = {own(object: unknown, key: string): unknown {
            if (!object || typeof object !== "object" && typeof object !== "function") return undefined;
            const d = Object.getOwnPropertyDescriptor(object, key);
            return d && "value" in d ? d.value : undefined;
          }};
          const active = data.own(window, "cicl"), state = data.own(window, "cicc");
          const known = ["cookie_cat_necessary", "cookie_cat_functional", "cookie_cat_statistic", "cookie_cat_marketing", "cookie_cat_unclassified"];
          if (!Array.isArray(active)) return undefined;
          const length = data.own(active, "length");
          if (typeof length !== "number" || !Number.isInteger(length) || length < 1 || length > known.length) return undefined;
          const categories: string[] = [];
          for (let index = 0; index < length; index++) {
            const key = data.own(active, String(index));
            if (typeof key !== "string" || !known.includes(key) || categories.includes(key)) return undefined;
            categories.push(key);
          }
          if (!categories.includes("cookie_cat_necessary") || data.own(state, "cookie_cat_necessary") !== true) return undefined;
          const optional = categories.filter(key => key !== "cookie_cat_necessary").sort();
          if (!optional.length) return undefined;
          configuration = [cookieInformationPolicy, ...categories.sort()];
          const values = optional.map(key => data.own(state, key));
          if (values.every(value => value === undefined)) return {canonicalState: "unregistered", configuration: JSON.stringify(configuration), decision: "unknown"};
          if (values.some(value => typeof value !== "boolean")) return undefined;
          entries = optional.map((key, index) => [key, values[index] as boolean]);
        } else if (provider === "finsweet") {
          configuration = ["analytics", "marketing", "personalization"];
          const raw = target.FinsweetConsentPro!.consents!.get!();
          if (raw === undefined) return {canonicalState: "unregistered", configuration: JSON.stringify(configuration), decision: "unknown"};
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
          const state = raw as Record<string, unknown>;
          const keys = ["essential", ...configuration];
          if (state.essential !== true || Object.keys(state).length !== keys.length ||
            Object.keys(state).some(key => !keys.includes(key)) || configuration.some(key => typeof state[key] !== "boolean")) return undefined;
          entries = configuration.map(key => [key, state[key] as boolean]);
        } else {
          const available = target.CookieScript!.instance!.categories!();
          const known = ["strict", "performance", "targeting", "functionality", "unclassified"];
          if (!Array.isArray(available) || available.length > known.length || new Set(available).size !== available.length ||
            available.some(key => typeof key !== "string" || !known.includes(key))) return undefined;
          configuration = (available as string[]).filter(key => key !== "strict").sort();
          if (!configuration.length) return undefined;
          cookieScriptConfiguration = JSON.stringify(configuration);
          let raw: unknown;
          try { raw = target.CookieScript!.instance!.currentState!(); } catch { return undefined; }
          if (raw === undefined) return {canonicalState: "unregistered", configuration: JSON.stringify(configuration), decision: "unknown"};
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
          const state = raw as { action?: unknown; categories?: unknown };
          if (state.action === undefined && (state.categories === undefined || Array.isArray(state.categories) && state.categories.length === 0)) return {canonicalState: "unregistered", configuration: JSON.stringify(configuration), decision: "unknown"};
          if (!["accept", "reject"].includes(state.action as string) || !Array.isArray(state.categories) ||
            new Set(state.categories).size !== state.categories.length || state.categories.length > known.length ||
            state.categories.some(key => typeof key !== "string" || (key !== "strict" && !configuration.includes(key)))) return undefined;
          entries = configuration.map(key => [key, (state.categories as unknown[]).includes(key)]);
          if (state.action === "reject" && entries.some(([, value]) => value) ||
            state.action === "accept" && !entries.some(([, value]) => value)) return undefined;
        }
        const decision = entries.every(([, value]) => value) ? "granted" : entries.every(([, value]) => !value) ? "denied" : "mixed";
        return { canonicalState: JSON.stringify(entries), configuration: JSON.stringify(configuration), decision };
      } };
      target.__certscoreDocumentedDecisionReaders ??= {};
      let tracker = target.__certscoreDocumentedDecisionReaders[provider];
      if (actionAt !== undefined && (!tracker?.control || !tracker.owner || tracker.api !== api ||
          tracker.clickedAt === undefined || tracker.clickedAt < actionAt)) {
        return { diagnostic: "api_saved_event_unverified" as const };
      }
      // A saved decision must come from the same SDK instance as its category baseline.
      if (provider === "cookiescript" && tracker && tracker.api !== api) return undefined;
      if (!tracker || tracker.api !== api || (actionAt === undefined && tracker.control !== control)) {
        tracker = { api, sequence: 0, control: control ?? undefined, owner };
        target.__certscoreDocumentedDecisionReaders[provider] = tracker;
        const current = tracker;
        control?.addEventListener("click", event => {
          if (current.clickedAt === undefined && event.isTrusted && event.composedPath().includes(control) &&
              target.__certscoreDocumentedDecisionReaders?.[provider] === current &&
              control.closest("#coiOverlay") === owner && document.querySelectorAll("#coiOverlay").length === 1) {
            current.clickedAt = Date.now();
          }
        }, {capture: true});
        const handler = { listener() {
          if (target.__certscoreDocumentedDecisionReaders?.[provider] !== current ||
              current.control && current.clickedAt === undefined) return;
          current.sequence++; current.at = Date.now();
          try { current.state = reader.read(); } catch { current.state = undefined; }
        } };
        if (provider === "finsweet") document.documentElement.addEventListener("consentpro:consent-updated", handler.listener);
        else for (const event of provider === "cookie_information" ? ["CookieInformationConsentGiven"] : ["CookieScriptReject", "CookieScriptAcceptAll", "CookieScriptAccept"]) window.addEventListener(event, handler.listener);
      }
      const live = reader.read();
      if (provider === "cookie_information" && !live) return { diagnostic: "configuration_or_groups_unverified" as const };
      // A malformed latest event or a changed live API cannot reuse old proof.
      if (tracker.sequence && (!live || !tracker.state || tracker.state.canonicalState !== live.canonicalState || tracker.state.configuration !== live.configuration)) {
        return provider === "cookie_information" ? { diagnostic: "receipt_readback_mismatch" as const } : undefined;
      }
      return { canonicalState: live?.canonicalState ?? (cookieScriptConfiguration ? "unknown" : "unregistered"), decision: live?.decision ?? "unknown" as const,
        configuration: live?.configuration ?? cookieScriptConfiguration, eventSequence: tracker.sequence, eventObservedAtEpochMs: tracker.at };
    }, { provider, cookieInformationPolicy: COOKIE_INFORMATION_STATE_POLICY, control: element,
      actionAt: binding && "actionDispatchedAtEpochMs" in binding ? binding.actionDispatchedAtEpochMs : undefined })
      .finally(() => { void acquired?.dispose().catch(() => undefined); });
  };
  let timer: NodeJS.Timeout | undefined;
  const raw = await Promise.race([read().catch(() => undefined),
    new Promise<undefined>(resolve => {timer = setTimeout(() => resolve(undefined), 150);}),
  ]).finally(() => {if (timer) clearTimeout(timer);});
  if (!raw || raw.diagnostic) {
    onDiagnostic?.(raw?.diagnostic ?? "api_unavailable");
    return undefined;
  }
  const { configuration, diagnostic: _diagnostic, ...state } = raw;
  return { ...state, ...(configuration ? {configurationSha256: createHash("sha256").update(configuration).digest("hex")} : {}) };
}
