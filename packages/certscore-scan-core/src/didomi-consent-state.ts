import type { Frame, Page } from "playwright";
import type { CmpApiConsentSnapshot } from "./cmp-api-consent-state.js";

/** didomi_documented_status.v1. Read-only SDK methods and event subscription.
 * Never decode an opaque token or equate a hidden notice with registration.
 * https://developers.didomi.io/cmp/web-sdk/reference/api
 * https://developers.didomi.io/cmp/web-sdk/reference/events
 * https://developers.didomi.io/cmp/web-sdk/reference/api/deprecated#getuserstatus */
export async function readDidomiConsentSnapshot(scope: Page | Frame): Promise<CmpApiConsentSnapshot | undefined> {
  const result = await scope.evaluate(() => {
    const globalWithName = globalThis as typeof globalThis & {__name?: <T>(target: T) => T};
    globalWithName.__name ??= function (value) { return value; };
    const inspect = () => {
      type Api = {
        getCurrentUserStatus: () => unknown;
        getUserStatus: () => unknown;
        getRequiredPurposeIds: () => unknown;
        getRequiredVendors: () => unknown;
        isUserStatusPartial: () => unknown;
      };
      type State = { canonicalState: string; configuration: string; decision: "granted" | "denied" | "mixed" | "unknown" };
      type Tracker = { api?: Api; ready: boolean; configuration?: string; sequence: number;
        event?: { state: string; observedAtEpochMs: number }; invalidated: boolean; diagnostic?: Record<string, number | boolean | string> };
      const target = window as unknown as {
        Didomi?: Api;
        didomiOnReady?: Array<(api: Api) => void>;
        didomiEventListeners?: Array<{ event: string; listener: (context: unknown) => void }>;
        __certscoreDidomiStatus?: Tracker;
      };
      const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
      const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9:_-]{1,120}$/.test(value);
      const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 96 && value.every(id) && new Set(value).size === value.length;
      const diagnostics: Record<string, number | boolean | string> = {};
      const ownEnabled = (value: unknown): boolean | undefined => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
        const property = Object.getOwnPropertyDescriptor(value, "enabled");
        return property && "value" in property && typeof property.value === "boolean" ? property.value : undefined;
      };
      const decoder = { read(api: Api): State | undefined {
        try {
          const status = api.getCurrentUserStatus(), purposes = api.getRequiredPurposeIds(), vendors = api.getRequiredVendors(), partial = api.isUserStatusPartial();
          Object.assign(diagnostics, {statusObject: plain(status), requiredPurposeCount: Array.isArray(purposes) ? purposes.length : -1,
            configuredVendorCount: Array.isArray(vendors) ? vendors.length : -1, partial: typeof partial === "boolean" ? partial : "unknown",
            purposeStatusCount: plain(status) && plain(status.purposes) ? Object.keys(status.purposes).length : -1,
            vendorStatusCount: plain(status) && plain(status.vendors) ? Object.keys(status.vendors).length : -1,
            regulationMatches: plain(status) && typeof status.regulation === "string" && status.regulation.toUpperCase() === "GDPR"});
          if (!plain(status) || typeof status.regulation !== "string" || status.regulation.toUpperCase() !== "GDPR" || typeof partial !== "boolean" ||
            !ids(purposes) || !purposes.length || !Array.isArray(vendors) || !vendors.length || vendors.length > 96 ||
            !plain(status.purposes) || !plain(status.vendors) || Object.keys(status.purposes).length > 96 || Object.keys(status.vendors).length > 96) return undefined;
          // Current global status injects essential purposes as enabled. The
          // documented compatibility API exposes their explicit identities;
          // never infer essentiality from an enabled value after Reject.
          const legacy = api.getUserStatus();
          const essential = plain(legacy) && plain(legacy.purposes) ? legacy.purposes.essential : undefined;
          if (!ids(essential)) { diagnostics.essentialInventoryUnavailable = true; return undefined; }
          const optionalPurposes = purposes.filter(purpose => !essential.includes(purpose));
          if (!optionalPurposes.length) return undefined;
          diagnostics.essentialPurposeCount = purposes.length - optionalPurposes.length;
          diagnostics.optionalPurposeCount = optionalPurposes.length;
          const vendorStatuses = status.vendors;
          const configured: Array<[string, string[], string[]]> = [];
          for (const vendor of vendors) {
            if (!plain(vendor) || !(id(vendor.id) || (Number.isInteger(vendor.id) && Number(vendor.id) > 0 && Number(vendor.id) <= 65535)) || !ids(vendor.purposeIds)) { diagnostics.invalidVendorDefinition = true; return undefined; }
            const key = String(vendor.id);
            if (configured.some(([previous]) => previous === key)) return undefined;
            if (vendor.didomiId !== undefined && !id(vendor.didomiId)) return undefined;
            // The SDK publishes both an IAB/custom ID and its Didomi ID.
            // Bind an exact, unique declared identity to the status map; never
            // strip prefixes, infer aliases or choose between duplicate rows.
            const aliases = [...new Set([key, ...(id(vendor.didomiId) ? [vendor.didomiId] : [])])].sort();
            configured.push([key, [...vendor.purposeIds].sort(), aliases]);
          }
          configured.sort(([a], [b]) => a.localeCompare(b));
          const configuration = JSON.stringify({purposes: [...purposes].sort(), essential: [...essential].sort(), vendors: configured});
          const entries: Array<[string, string, boolean]> = [];
          for (const purpose of [...optionalPurposes].sort()) {
            const value = status.purposes[purpose];
            const enabled = ownEnabled(value);
            if (enabled === undefined) { diagnostics.missingOrMalformedPurpose = true; diagnostics.purposeValueExists = value !== undefined;
              diagnostics.purposeValueKind = typeof value; diagnostics.purposeOwnEnabled = Boolean(value && typeof value === "object" && Object.hasOwn(value, "enabled")); return undefined; }
            entries.push(["purpose", purpose, enabled]);
          }
          const statusKeysUsed = new Set<string>();
          for (const [vendor, consentPurposes, aliases] of configured) {
            // Only purposes for which consent is collected vote. Essential and
            // LI-only vendor states must not be counted as optional consent.
            if (!consentPurposes.some(purpose => optionalPurposes.includes(purpose))) continue;
            const matchingKeys = aliases.filter(key => Object.hasOwn(vendorStatuses, key));
            if (matchingKeys.length !== 1 || statusKeysUsed.has(matchingKeys[0]!)) { diagnostics.vendorIdentityNotUnique = true; return undefined; }
            statusKeysUsed.add(matchingKeys[0]!);
            const value = vendorStatuses[matchingKeys[0]!];
            const enabled = ownEnabled(value);
            if (enabled === undefined) { diagnostics.missingOrMalformedVendor = true; diagnostics.vendorValueExists = value !== undefined;
              diagnostics.vendorValueKind = typeof value; diagnostics.vendorOwnEnabled = Boolean(value && typeof value === "object" && Object.hasOwn(value, "enabled")); return undefined; }
            entries.push(["vendor", matchingKeys[0]!, enabled]);
          }
          const decision = partial ? "unknown" : entries.every(([, , enabled]) => enabled) ? "granted"
            : entries.every(([, , enabled]) => !enabled) ? "denied" : "mixed";
          return { configuration, canonicalState: JSON.stringify({policy: "didomi_documented_status.v1", configuration, partial, entries}), decision };
        } catch { return undefined; }
      } };
      let tracker = target.__certscoreDidomiStatus;
      if (!tracker) {
        tracker = { ready: false, sequence: 0, invalidated: false };
        Object.defineProperty(target, "__certscoreDidomiStatus", {value: tracker, enumerable: false});
        const current = tracker;
        // Queue read-only listeners before the authorized click, using Didomi's
        // documented queues. No SDK setter, preferences opening or reset occurs.
        target.didomiOnReady ??= [];
        target.didomiEventListeners ??= [];
        target.didomiOnReady.push(api => {
          if (api !== target.Didomi || current.api && current.api !== api) { current.invalidated = true; return; }
          current.api = api; current.ready = true;
        });
        target.didomiEventListeners.push({event: "consent.changed", listener(context) {
          current.sequence += 1; current.event = undefined;
          if (!plain(context) || context.action !== "click" || !current.ready || current.invalidated || current.api !== target.Didomi || !current.api) return;
          const state = decoder.read(current.api);
          if (!state || state.decision === "unknown" || !current.configuration || current.configuration !== state.configuration) return;
          current.event = {state: state.canonicalState, observedAtEpochMs: Date.now()};
        }});
      }
      tracker.diagnostic = diagnostics;
      const api = target.Didomi;
      if (!tracker.ready || tracker.invalidated || !api || tracker.api !== api ||
        [api.getCurrentUserStatus, api.getUserStatus, api.getRequiredPurposeIds, api.getRequiredVendors, api.isUserStatusPartial].some(method => typeof method !== "function")) return undefined;
      const state = decoder.read(api);
      if (!state) { tracker.event = undefined; return undefined; }
      tracker.configuration ??= state.configuration;
      if (tracker.configuration !== state.configuration) { tracker.invalidated = true; tracker.event = undefined; return undefined; }
      const witnessed = tracker.event?.state === state.canonicalState;
      return { canonicalState: state.canonicalState, decision: state.decision,
        eventSequence: witnessed ? tracker.sequence : 0,
        ...(witnessed ? {eventObservedAtEpochMs: tracker.event!.observedAtEpochMs} : {}) };
    };
    const snapshot = inspect();
    const tracker = (window as unknown as {__certscoreDidomiStatus?: {ready: boolean; invalidated: boolean; sequence: number; event?: unknown; diagnostic?: Record<string, number | boolean | string>}}).__certscoreDidomiStatus;
    return {snapshot, diagnostic: {policy: "didomi_documented_status.v1", ready: tracker?.ready ?? false,
      invalidated: tracker?.invalidated ?? false, eventSequence: tracker?.sequence ?? 0,
      eventBound: snapshot?.eventSequence ? true : false, ...tracker?.diagnostic}};
  }).catch(() => undefined);
  // Opt-in bounded diagnostics only. Never log API objects, IDs, state strings,
  // tokens or visitor identity. No extra browser round trip or SDK read.
  if (process.env.CERTSCORE_CMP_STATUS_DIAGNOSTICS === "1" && result) console.info("[cmp-status]", JSON.stringify(result.diagnostic));
  return result?.snapshot;
}
