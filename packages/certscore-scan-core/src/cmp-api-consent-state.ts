import {receiptCaptureToken,retainReceiptApi,retainReceiptApiPartial} from './consent-receipt-capture.js';
import { readDocumentedConsentApi, type DocumentedConsentProvider } from "./documented-consent-api.js";
import type { Frame, Page } from "playwright";
import { readDidomiConsentSnapshot } from "./didomi-consent-state.js";
import type { ConsentConfirmationReason } from "@certscore/contracts";

export type CmpApiConsentProvider = DocumentedConsentProvider | "termly" | "transcend" | "borlabs" | "osano" | "hubspot" | "drupal_eu_cookie" | "didomi";

export type PartialApiReceipt = {fields:Record<string,unknown>;limited:boolean;omittedFields:number;
 apiReadKind?:'get_state'|'saved_event';readbackMatched?:boolean;eventSequence?:number;eventObservedAtEpochMs?:number};

export type CmpApiConsentSnapshot = {
  canonicalState: string;
  configurationSha256?: string;
  decision: "granted" | "denied" | "mixed" | "unknown";
  eventSequence: number;
  /** Ephemeral event clock for action binding; never a retained state-write timestamp. */
  eventObservedAtEpochMs?: number;
};

async function readCmpApiConsentSnapshotInternal(
  scope: Page | Frame,
  provider: CmpApiConsentProvider,
  onDiagnostic?: (reason: ConsentConfirmationReason) => void,
  onPartial?: (value: PartialApiReceipt) => void,
): Promise<CmpApiConsentSnapshot | undefined> {
  if (provider === "cookie_information" || provider === "cookiescript" || provider === "finsweet" || provider === "didomi") {
    const snapshot = provider === "didomi" ? await readDidomiConsentSnapshot(scope) : await readDocumentedConsentApi(scope, provider);
    if (!snapshot) onDiagnostic?.("api_unavailable");
    return snapshot;
  }
  const result: (CmpApiConsentSnapshot & { diagnosticReason?: ConsentConfirmationReason }) |
    { diagnosticReason: ConsentConfirmationReason; receiptPartial?: PartialApiReceipt } | undefined = await scope.evaluate(async ({ provider }) => {
    const partialCapture={read(raw:unknown){
      const fields:Record<string,boolean|string>=Object.create(null);let inspected=0,retained=0,omittedFields=0,limited=false;
      if(!raw||typeof raw!=='object'||Array.isArray(raw))return {fields,limited:true,omittedFields:0};
      for(const key in raw){if(!Object.hasOwn(raw,key))continue;if(inspected++===24){limited=true;break;}
        const descriptor=Object.getOwnPropertyDescriptor(raw,key),value=descriptor&&'value'in descriptor?descriptor.value:undefined;
        if(key.length<=160&&(typeof value==='boolean'||typeof value==='string'&&['ACCEPT','DENY','yes','no','allow','deny'].includes(value))){
          if(retained===8){limited=true;break;}fields[key]=value;retained++;
        }else omittedFields++;
      }return {fields,limited,omittedFields};
    }};
    if (provider === "osano" || provider === "hubspot") {
      type Tracker = { sequence: number; state?: string; decision?: "granted" | "denied" | "mixed"; observedAtEpochMs?: number; partial?: ReturnType<typeof partialCapture.read>; partialSamples?:number };
      const target = window as unknown as {
        __tcfapi?: unknown;
        Osano?: { cm?: { getConsent?: () => unknown; addEventListener?: (event: string, callback: (data: unknown) => void) => void } };
        _hsp?: { push: (command: [string, (data: unknown) => void]) => unknown };
        __certscoreDocumentedConsentEvents?: Partial<Record<"osano" | "hubspot", Tracker>>;
      };
      const categoryNames = provider === "osano" ? ["ANALYTICS", "MARKETING", "PERSONALIZATION"] : ["analytics", "advertisement", "functionality"];
      const decoder = { decode(raw: unknown) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
        const values = raw as Record<string, unknown>;
        // Osano documents both spellings, including OPT_OUT in its GPC/DNT
        // getter examples. Accept exactly one; both keys remain ambiguous.
        // https://docs.osano.com/en-US/osano/article/Hk-0Dnay-global-privacy-control-gpc
        // https://developers.osano.com/cmp/javascript-api/developer-documentation-consent-javascript-api
        const optOutKey = Object.hasOwn(values, "OPT_OUT") ? "OPT_OUT" : "OPT-OUT";
        const allowed = provider === "osano" ? [...categoryNames, "ESSENTIAL", optOutKey, "STORAGE"] : [...categoryNames, "necessary"];
        if (Object.keys(values).length > allowed.length || Object.keys(values).some(key => !allowed.includes(key))) return undefined;
        // HubSpot's served Consent.getSafeCopy includes necessary:true. It is
        // an always-active category, not a vote on the three optional purposes.
        // Preserve older three-key responses; reject malformed mandatory state.
        if (provider === "hubspot" && Object.hasOwn(values, "necessary") && values.necessary !== true) return undefined;
        if (provider === "osano" && (values.ESSENTIAL !== "ACCEPT" || allowed.some(key => values[key] !== "ACCEPT" && values[key] !== "DENY"))) return undefined;
        if (categoryNames.some(key => provider === "osano" ? !["ACCEPT", "DENY"].includes(values[key] as string) : typeof values[key] !== "boolean")) return undefined;
        const entries = categoryNames.map(key => [key, provider === "osano" ? values[key] === "ACCEPT" : values[key] === true] as const);
        const decision = entries.every(([, value]) => value) ? "granted" as const : entries.every(([, value]) => !value) ? "denied" as const : "mixed" as const;
        // IAB STORAGE/OPT-OUT are separate scopes, not all-purpose consent. Keep
        // their typed values in the state hash without treating defaults as votes.
        return { canonicalState: JSON.stringify({ entries, ...(provider === "osano" ? { storage: values.STORAGE, optOut: values[optOutKey] } : {}) }), decision };
      } };
      // This recipe confirms the non-TCF category scope. A TCF-enabled Osano
      // visit also needs separately verified IAB purposes; do not infer them.
      if (provider === "osano" && typeof target.__tcfapi === "function") return { diagnosticReason: "configuration_or_groups_unverified" as const };
      if (provider === "osano" && (typeof target.Osano?.cm?.getConsent !== "function" || typeof target.Osano.cm.addEventListener !== "function")) return undefined;
      // HubSpot documents this read-only queue initialization before its
      // tracking script loads. Queue the listener before dispatch, rather than
      // first discovering an API after the visitor action has already happened.
      if (provider === "hubspot") target._hsp ??= [] as Array<[string, (data: unknown) => void]>;
      if (provider === "hubspot" && typeof target._hsp?.push !== "function") return undefined;
      if (!target.__certscoreDocumentedConsentEvents) Object.defineProperty(target, "__certscoreDocumentedConsentEvents", { value: {}, enumerable: false });
      let tracker = target.__certscoreDocumentedConsentEvents![provider];
      if (!tracker) {
        tracker = { sequence: 0 }; target.__certscoreDocumentedConsentEvents![provider] = tracker;
        const handlers = { listener(data: unknown) {
          const raw = provider === "hubspot" && data && typeof data === "object" ? (data as { categories?: unknown }).categories : data;
          const state = decoder.decode(raw);
          // Invalid subsequent events invalidate earlier evidence rather than
          // leaving a stale complete decision eligible for an action witness.
          tracker!.sequence += 1; tracker!.observedAtEpochMs = Date.now();
          tracker!.state = state?.canonicalState; tracker!.decision = state?.decision;tracker!.partial=state?undefined:(tracker!.partialSamples??0)<8?
            (tracker!.partialSamples=(tracker!.partialSamples??0)+1,partialCapture.read(raw)):{fields:{},limited:true,omittedFields:0};
        } };
        if (provider === "osano") target.Osano!.cm!.addEventListener!("osano-cm-consent-saved", handlers.listener);
        else target._hsp!.push(["addPrivacyConsentListener", handlers.listener]);
      }
      if (provider === "osano") {
        const value = target.Osano!.cm!.getConsent!();
        const live = decoder.decode(value);
        // A first-time visitor can have no decision yet. The listener is still
        // installed before dispatch; only a fresh complete saved event can confirm.
        if (value === undefined && tracker.sequence === 0) return {canonicalState: "unregistered", decision: "unknown" as const, eventSequence: 0};
        if (!live) return { diagnosticReason: "receipt_format_unsupported" as const,receiptPartial:{...partialCapture.read(value),apiReadKind:'get_state' as const} };
        if (tracker.sequence > 0 && tracker.state !== live.canonicalState) return { diagnosticReason: "receipt_readback_mismatch" as const,receiptPartial:tracker.partial?{...tracker.partial,apiReadKind:'saved_event' as const,readbackMatched:false,eventSequence:tracker.sequence,eventObservedAtEpochMs:tracker.observedAtEpochMs}:{...partialCapture.read(value),apiReadKind:'get_state' as const,readbackMatched:false} };
        return { ...live, eventSequence: tracker.sequence, eventObservedAtEpochMs: tracker.observedAtEpochMs };
      }
      return { canonicalState: tracker.state ?? "unregistered", decision: tracker.decision ?? "unknown" as const, eventSequence: tracker.sequence, eventObservedAtEpochMs: tracker.observedAtEpochMs,
        ...(tracker.sequence > 0 && !tracker.state ? { diagnosticReason: "receipt_format_unsupported" as const,receiptPartial:tracker.partial?{...tracker.partial,apiReadKind:'saved_event' as const,eventSequence:tracker.sequence,eventObservedAtEpochMs:tracker.observedAtEpochMs}:undefined } : {}) };
    }
    if (provider === "drupal_eu_cookie") {
      type Config = { method?: string; cookie_name?: string; cookie_value_disagreed?: string; cookie_value_agreed?: string; cookie_value_agreed_show_thank_you?: string;
        cookie_categories?: string[]; cookie_categories_details?: Record<string, { id?: string; checkbox_default_state?: string }> };
      const target = window as unknown as {
        drupalSettings?: { eu_cookie_compliance?: Config };
        Drupal?: { eu_cookie_compliance?: { getCookieStatus?: () => unknown; getAcceptedCategories?: () => unknown } };
        __certscoreReadPostAcceptWrites?: () => Array<{ storageType: string; name: string; value?: string; sequence: number; observedAtEpochMs: number }>;
        __certscoreReadPostRefusalWrites?: () => Array<{ storageType: string; name: string; value?: string; sequence: number; observedAtEpochMs: number }>;
      };
      const config = target.drupalSettings?.eu_cookie_compliance, api = target.Drupal?.eu_cookie_compliance;
      if (!config || !["opt_in", "categories"].includes(config.method ?? "") || typeof api?.getCookieStatus !== "function") return undefined;
      const key = config.cookie_name || "cookie-agreed";
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(key)) return undefined;
      const status = api.getCookieStatus();
      const denied = config.cookie_value_disagreed || "0", accepted = [config.cookie_value_agreed_show_thank_you || "1", config.cookie_value_agreed || "2"];
      if (new Set([denied, ...accepted]).size !== 3 || [denied, ...accepted].some(value => typeof value !== "string" || value.length > 32)) return undefined;
      const statusText = status == null ? null : String(status);
      let decision: "granted" | "denied" | "mixed" | "unknown" = statusText === denied ? "denied" : accepted.includes(statusText ?? "") ? "granted" : "unknown";
      let categories: Array<[string, boolean]> | undefined;
      if (config.method === "categories") {
        const configured = config.cookie_categories, details = config.cookie_categories_details;
        if (!Array.isArray(configured) || !configured.length || configured.length > 96 || new Set(configured).size !== configured.length ||
          configured.some(id => typeof id !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(id) || details?.[id]?.id !== id) ||
          !details || Object.keys(details).length !== configured.length || typeof api.getAcceptedCategories !== "function") return undefined;
        const selected = api.getAcceptedCategories();
        if (!Array.isArray(selected) || selected.length > configured.length || new Set(selected).size !== selected.length || selected.some(id => !configured.includes(id))) return undefined;
        const optional = configured.filter(id => details[id]!.checkbox_default_state !== "required");
        if (!optional.length) return undefined;
        categories = optional.sort().map(id => [id, selected.includes(id)]);
        if (decision !== "unknown") {
          const categoryDecision = categories.every(([, value]) => value) ? "granted" : categories.every(([, value]) => !value) ? "denied" : "mixed";
          decision = categoryDecision === decision ? decision : "mixed";
        }
      }
      const writes = (target.__certscoreReadPostAcceptWrites ?? target.__certscoreReadPostRefusalWrites)?.() ?? [];
      const witness = writes.slice(-96).reverse().find(write => write.storageType === "cookie" && write.name === key && write.value === statusText);
      return { canonicalState: JSON.stringify({ method: config.method, status: statusText, categories }), decision,
        eventSequence: witness?.sequence ?? 0, eventObservedAtEpochMs: witness?.observedAtEpochMs };
    }
    if (provider === "borlabs") {
      const target = window as unknown as {
        BorlabsCookie?: { Consents?: { hasConsent?: (id: string, group: string) => boolean } };
        borlabsCookieConfig?: { services?: Record<string, { id?: string; serviceGroupId?: string }> };
        __certscoreBorlabsConsentEvents?: { sequence: number };
      };
      const api = target.BorlabsCookie?.Consents;
      const services = target.borlabsCookieConfig?.services;
      if (typeof api?.hasConsent !== "function" || !services || typeof services !== "object") return undefined;
      const configured = Object.entries(services);
      if (!configured.length || configured.length > 96) return undefined;
      if (!target.__certscoreBorlabsConsentEvents) {
        const tracker = { sequence: 0 };
        Object.defineProperty(target, "__certscoreBorlabsConsentEvents", { value: tracker, enumerable: false });
        window.addEventListener("borlabs-cookie-consent-saved", () => { tracker.sequence += 1; });
      }
      const entries: Array<[string, string, boolean]> = [];
      for (const [id, service] of configured) {
        if (!service || service.id !== id || typeof service.serviceGroupId !== "string" ||
          !/^[a-z0-9_-]{1,100}$/i.test(id) || !/^[a-z0-9_-]{1,100}$/i.test(service.serviceGroupId)) return undefined;
        const granted = api.hasConsent(id, service.serviceGroupId);
        if (typeof granted !== "boolean") return undefined;
        entries.push([service.serviceGroupId, id, granted]);
      }
      entries.sort((left, right) => (left[0] + ":" + left[1]).localeCompare(right[0] + ":" + right[1]));
      const optional = entries.filter(([group]) => group !== "essential");
      if (!optional.length) return undefined;
      const decision = optional.every(([, , granted]) => granted) ? "granted" as const
        : optional.every(([, , granted]) => !granted) ? "denied" as const : "mixed" as const;
      return { canonicalState: JSON.stringify(entries), decision,
        eventSequence: target.__certscoreBorlabsConsentEvents!.sequence };
    }
    if (provider === "termly") {
      const target = window as unknown as {
        Termly?: {
          getConsentState?: () => unknown;
          on?: (event: string, callback: (data: { categories?: unknown } | null) => void) => void;
        };
        __certscoreTermlyConsentEvents?: {
          sequence: number;
          categories?: string[];
          observedAtEpochMs?: number;
        };
      };
      if (!target.Termly || typeof target.Termly.getConsentState !== "function") return undefined;
      if (!target.__certscoreTermlyConsentEvents && typeof target.Termly.on === "function") {
        const tracker = { sequence: 0, categories: undefined as string[] | undefined,
          observedAtEpochMs: undefined as number | undefined };
        Object.defineProperty(target, "__certscoreTermlyConsentEvents", {
          configurable: false,
          enumerable: false,
          value: tracker,
          writable: false,
        });
        target.Termly.on("consent", (data) => {
          // Termly's documented event carries the complete approved category
          // list, not a consentState object. Do not retain cookies or UUIDs.
          // Reject malformed/unknown categories before counting a fresh event.
          const categories = data?.categories;
          const known = ["essential", "performance", "analytics", "advertising", "social_networking", "unclassified"];
          if (!Array.isArray(categories) || categories.length > known.length ||
            categories.some(category => typeof category !== "string" || !known.includes(category)) ||
            new Set(categories).size !== categories.length) return;
          tracker.sequence += 1;
          tracker.categories = categories.slice();
          tracker.observedAtEpochMs = Date.now();
        });
      }
      const categoryNames = ["performance", "analytics", "advertising", "social_networking", "unclassified"];
      const eventCategories = target.__certscoreTermlyConsentEvents?.categories;
      const raw = eventCategories
        ? Object.fromEntries(categoryNames.map(category => [category, eventCategories.includes(category)]))
        : await Promise.resolve(target.Termly.getConsentState());
      if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        categoryNames.some(category => typeof (raw as Record<string, unknown>)[category] !== "boolean")) return {diagnosticReason:"api_unavailable" as const,receiptPartial:{...partialCapture.read(raw),apiReadKind:'get_state' as const}};
      const entries = categoryNames.map(key => [key, (raw as Record<string, unknown>)[key]] as const)
        .sort(([left], [right]) => left.localeCompare(right));
      if (entries.length === 0) return undefined;
      const values = entries.map(([, value]) => value === true);
      const decision = values.every(Boolean)
        ? "granted" as const
        : values.every((value) => !value)
          ? "denied" as const
          : "mixed" as const;
      return {
        canonicalState: JSON.stringify(entries),
        decision,
        eventSequence: target.__certscoreTermlyConsentEvents?.sequence ?? 0,
        ...(eventCategories ? { eventObservedAtEpochMs: target.__certscoreTermlyConsentEvents?.observedAtEpochMs } : {}),
      };
    }

    const target = window as unknown as {
      airgap?: {
        getConsent?: () => { purposes?: unknown; timestamp?: unknown };
      };
    };
    if (!target.airgap || typeof target.airgap.getConsent !== "function") return undefined;
    // getConsent reads the current local state. Cross-domain synchronization
    // is neither a passive read nor a prerequisite for confirming this click;
    // awaiting it can exhaust the existing bounded confirmation window.
    const consent = target.airgap.getConsent();
    const purposes = consent?.purposes;
    if (!purposes || typeof purposes !== "object") return undefined;
    const entries = Object.entries(purposes as Record<string, unknown>)
      .filter(([key, value]) =>
        typeof value === "boolean" && !["essential", "unknown"].includes(key.toLowerCase())
      )
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return undefined;
    const values = entries.map(([, value]) => value === true);
    const decision = values.every(Boolean)
      ? "granted" as const
      : values.every((value) => !value)
        ? "denied" as const
        : "mixed" as const;
    return {
      canonicalState: JSON.stringify({
        purposes: entries,
        timestamp: typeof consent.timestamp === "string" ? consent.timestamp.slice(0, 64) : null,
      }),
      decision,
      eventSequence: 0,
    };
  }, { provider }).catch(() => undefined);
  if (!result) { onDiagnostic?.("api_unavailable"); return undefined; }
  if('receiptPartial'in result&&result.receiptPartial)onPartial?.(result.receiptPartial);
  if ("diagnosticReason" in result) {
    if (result.diagnosticReason) onDiagnostic?.(result.diagnosticReason);
    const { diagnosticReason: _reason, receiptPartial: _partial, ...snapshot } = result as typeof result&{receiptPartial?:unknown};
    return "canonicalState" in snapshot ? snapshot : undefined;
  }
  return result;
}

export async function readCmpApiConsentSnapshot(scope:Page|Frame,provider:CmpApiConsentProvider,onDiagnostic?:(reason:ConsentConfirmationReason)=>void):Promise<CmpApiConsentSnapshot|undefined>{
 const token=receiptCaptureToken(scope);
 const snapshot=await readCmpApiConsentSnapshotInternal(scope,provider,onDiagnostic,partial=>{try{retainReceiptApiPartial(token,provider,partial);}catch{/* Retention is optional. */}});
 try{retainReceiptApi(token,provider,snapshot);}catch{/* Optional retention cannot change the existing decision. */}
 return snapshot;
}
