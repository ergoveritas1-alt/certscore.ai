import { createHash } from "node:crypto";
import type { Frame, Page } from "playwright";
import type { CmpApiConsentSnapshot } from "./cmp-api-consent-state.js";

export type DocumentedConsentProvider = "cookie_information" | "cookiescript" | "finsweet";

/** Passive documented getters and saved-decision events only. No queues,
 * initialization, consent setters, UI actions or network calls are invoked.
 * Callers must bind the provider to the live control's canonical CMP scope.
 */
export async function readDocumentedConsentApi(scope: Page | Frame, provider: DocumentedConsentProvider): Promise<CmpApiConsentSnapshot | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const raw = await Promise.race([scope.evaluate(({ provider }) => {
    type State = { canonicalState: string; decision: "granted" | "denied" | "mixed" | "unknown"; configuration: string };
    type Tracker = { api: unknown; sequence: number; at?: number; state?: State };
    const target = window as unknown as {
      __tcfapi?: unknown;
      CookieInformation?: { getConsentGivenFor?: (category: string) => unknown };
      CookieScript?: { instance?: { currentState?: () => unknown; categories?: () => unknown } };
      FinsweetConsentPro?: { consents?: { get?: () => unknown } };
      __certscoreDocumentedDecisionReaders?: Partial<Record<typeof provider, Tracker>>;
    };
    if (provider === "cookie_information" && typeof target.__tcfapi === "function") return undefined;
    const bannerSelector = provider === "finsweet" ? '[fs-consent-element="banner"]'
      : provider === "cookiescript" ? "#cookiescript_injected" : "#coiOverlay, [id*='cookie-information' i]";
    if (document.querySelectorAll(bannerSelector).length !== 1) return undefined;
    const api = provider === "cookie_information" ? target.CookieInformation
      : provider === "cookiescript" ? target.CookieScript?.instance : target.FinsweetConsentPro?.consents;
    if (!api || (provider === "cookie_information" && typeof target.CookieInformation?.getConsentGivenFor !== "function") ||
      (provider === "cookiescript" && (typeof target.CookieScript?.instance?.currentState !== "function" || typeof target.CookieScript.instance.categories !== "function")) ||
      (provider === "finsweet" && typeof target.FinsweetConsentPro?.consents?.get !== "function")) return undefined;
    const reader = { read(): State | undefined {
      let entries: Array<[string, boolean]>;
      let configuration: string[];
      if (provider === "cookie_information") {
        configuration = ["cookie_cat_functional", "cookie_cat_marketing", "cookie_cat_statistic"];
        const values = configuration.map(key => target.CookieInformation!.getConsentGivenFor!(key));
        if (values.every(value => value === undefined)) return {canonicalState: "unregistered", configuration: JSON.stringify(configuration), decision: "unknown"};
        if (values.some(value => typeof value !== "boolean")) return undefined;
        entries = configuration.map((key, index) => [key, values[index] as boolean]);
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
        const raw = target.CookieScript!.instance!.currentState!();
        const known = ["strict", "performance", "targeting", "functionality", "unclassified"];
        if (!Array.isArray(available) || available.length > known.length || new Set(available).size !== available.length ||
          available.some(key => typeof key !== "string" || !known.includes(key))) return undefined;
        configuration = (available as string[]).filter(key => key !== "strict").sort();
        if (!configuration.length) return undefined;
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
    if (!tracker || tracker.api !== api) {
      tracker = { api, sequence: 0 };
      target.__certscoreDocumentedDecisionReaders[provider] = tracker;
      const current = tracker;
      const handler = { listener() {
        if (target.__certscoreDocumentedDecisionReaders?.[provider] !== current) return;
        current.sequence++; current.at = Date.now();
        try { current.state = reader.read(); } catch { current.state = undefined; }
      } };
      if (provider === "finsweet") document.documentElement.addEventListener("consentpro:consent-updated", handler.listener);
      else for (const event of provider === "cookie_information" ? ["CookieInformationConsentGiven"] : ["CookieScriptReject", "CookieScriptAcceptAll", "CookieScriptAccept"]) window.addEventListener(event, handler.listener);
    }
    const live = reader.read();
    // A malformed latest event or a changed live API cannot reuse old proof.
    if (tracker.sequence && (!live || !tracker.state || tracker.state.canonicalState !== live.canonicalState || tracker.state.configuration !== live.configuration)) return undefined;
    return { canonicalState: live?.canonicalState ?? "unregistered", decision: live?.decision ?? "unknown" as const,
      configuration: live?.configuration, eventSequence: tracker.sequence, eventObservedAtEpochMs: tracker.at };
  }, { provider }).catch(() => undefined),
    new Promise<undefined>(resolve => {timer = setTimeout(() => resolve(undefined), 150);}),
  ]).finally(() => {if (timer) clearTimeout(timer);});
  if (!raw) return undefined;
  const { configuration, ...state } = raw;
  return { ...state, ...(configuration ? {configurationSha256: createHash("sha256").update(configuration).digest("hex")} : {}) };
}
