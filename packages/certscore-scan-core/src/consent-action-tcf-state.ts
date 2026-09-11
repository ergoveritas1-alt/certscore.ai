import type { Frame, Page } from "playwright";

export type ActionTcfData = {
  purposeEvidence?: { policyVersion: "iab_tcf_sparse_purposes.v1"; tcfPolicyVersion: 4 | 5; cmpId: number; cmpVersion: number; explicitPurposeIds: number[] };
  apiSource: "addEventListener" | "getTCData";
  eventStatus?: string;
  purposeConsents: Record<string, boolean>;
  success: boolean;
  /** Ephemeral bounded input for hashing/decoding; never retained verbatim. */
  tcString?: string;
};

/** TCF 2.2 uses addEventListener. Keep one observer per live API/document and
 * retain the existing bounded getTCData compatibility read for older CMPs.
 * Reading or subscribing never updates consent or invokes an action.
 */
export async function readConsentActionTcfData(scope: Page | Frame): Promise<ActionTcfData | undefined> {
  const raw = await scope.evaluate(`(() => {
    const api = window.__tcfapi;
    if (typeof api !== "function") return Promise.resolve(undefined);
    const normalize = (data, success, apiSource) => {
      if (success !== true || !data || typeof data !== "object") return undefined;
      const plain = value => value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
      const purposes = data.purpose?.consents;
      const validMap = plain(data.purpose) && Object.hasOwn(data.purpose, "consents") && plain(purposes) &&
        Object.entries(purposes).every(([key, value]) => /^(?:[1-9]|1[0-9]|2[0-4])$/.test(key) && typeof value === "boolean");
      // OneTrust returns a TCData class instance. Validate its own protocol
      // fields rather than requiring Object.prototype for the outer envelope.
      const validEnvelope = !Array.isArray(data) && ["gdprApplies", "cmpStatus", "eventStatus", "tcfPolicyVersion", "cmpId", "cmpVersion", "tcString", "purpose"].every(key => Object.hasOwn(data, key)) && data.gdprApplies === true && data.cmpStatus === "loaded" &&
        ["tcloaded", "cmpuishown", "useractioncomplete"].includes(data.eventStatus) &&
        [4, 5].includes(data.tcfPolicyVersion) && Number.isInteger(data.cmpId) && data.cmpId > 0 && data.cmpId <= 4095 &&
        Number.isInteger(data.cmpVersion) && data.cmpVersion > 0 && data.cmpVersion <= 4095 && validMap;
      return {
        apiSource,
        ...(validEnvelope ? { sparseEnvelope: { tcfPolicyVersion:data.tcfPolicyVersion, cmpId:data.cmpId, cmpVersion:data.cmpVersion } } : {}),
        ...(typeof data.eventStatus === "string" ? { eventStatus: data.eventStatus.slice(0, 40) } : {}),
        purposeConsents: Object.fromEntries(Object.entries(data.purpose?.consents || {})
          .filter(([key, value]) => /^\\d{1,2}$/.test(key) && typeof value === "boolean").slice(0, 24)),
        success: true,
        ...(typeof data.tcString === "string" && data.tcString.length <= 2048 ? { tcString: data.tcString } : {}),
      };
    };
    let tracker = window.__certscoreActionTcfObserver;
    if (!tracker || tracker.api !== api) {
      if (tracker && tracker.listenerId !== undefined) {
        try { tracker.api("removeEventListener", 2, () => {}, tracker.listenerId); } catch (_) {}
      }
      tracker = { api, current: undefined, listenerId: undefined, pending: new Set() };
      Object.defineProperty(window, "__certscoreActionTcfObserver", {
        configurable: true, enumerable: false, writable: false, value: tracker,
      });
      try {
        api("addEventListener", 2, (data, success) => {
          if (window.__tcfapi !== api) return;
          if (Number.isInteger(data?.listenerId)) tracker.listenerId = data.listenerId;
          const current = normalize(data, success, "addEventListener");
          // A failed update invalidates the old state rather than replaying it.
          tracker.current = current;
          if (current) for (const finish of tracker.pending) finish(current);
        });
      } catch (_) {}
    }
    if (tracker.current) return Promise.resolve(tracker.current);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); tracker.pending.delete(finish);
        resolve(window.__tcfapi === api ? value : undefined);
      };
      const timer = setTimeout(() => finish(undefined), 250);
      tracker.pending.add(finish);
      try { api("getTCData", 2, (data, success) => {
        const current = normalize(data, success, "getTCData");
        if (current) finish(current);
      }); } catch (_) {}
    });
  })()`).catch(() => undefined) as (ActionTcfData & { sparseEnvelope?: { tcfPolicyVersion: 4 | 5; cmpId: number; cmpVersion: number } }) | undefined;
  if (!raw) return undefined;
  const { sparseEnvelope, ...result } = raw;
  if (!sparseEnvelope) return result;
  // IAB TCData explicitly defines false OR undefined purpose consent as no
  // consent. Require a valid loaded envelope and agreement with all 24 encoded
  // purpose bits; an arbitrary partial category map never enters this branch.
  const decoded = decodeTcfV2PurposeConsents(raw.tcString);
  if (!raw.tcString || raw.tcString.split(".")[0]!.length < 43 ||
    !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(raw.tcString) || decoded.status !== "parsed_v2") return undefined;
  const normalized = Object.fromEntries(Array.from({ length:24 }, (_, i) => [String(i + 1), raw.purposeConsents[String(i + 1)] === true]));
  if (Object.entries(normalized).some(([id, consent]) => decoded.purposeConsents[id] !== consent)) return undefined;
  return { ...result, purposeConsents: normalized, purposeEvidence: {
    policyVersion:"iab_tcf_sparse_purposes.v1", ...sparseEnvelope,
    explicitPurposeIds:Object.keys(raw.purposeConsents).map(Number).sort((a,b) => a-b),
  } };
}


export function decodeTcfV2PurposeConsents(tcString: string | undefined): {
  purposeConsents: Record<string, boolean>;
  status: "missing" | "invalid" | "unsupported_version" | "parsed_v2";
} {
  if (!tcString) return { purposeConsents: {}, status: "missing" };
  try {
    const coreSegment = tcString.split(".", 1)[0];
    if (!coreSegment || !/^[A-Za-z0-9_-]+$/.test(coreSegment)) {
      return { purposeConsents: {}, status: "invalid" };
    }
    const base64 = coreSegment.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Buffer.from(padded, "base64");
    if (bytes.length * 8 < 176) return { purposeConsents: {}, status: "invalid" };
    const bit = (index: number) => (bytes[Math.floor(index / 8)]! >> (7 - (index % 8))) & 1;
    const numberAt = (offset: number, length: number) => {
      let value = 0;
      for (let index = 0; index < length; index += 1) value = value * 2 + bit(offset + index);
      return value;
    };
    if (numberAt(0, 6) !== 2) {
      return { purposeConsents: {}, status: "unsupported_version" };
    }
    const purposeConsents: Record<string, boolean> = {};
    const purposeConsentOffset = 152;
    for (let purposeId = 1; purposeId <= 24; purposeId += 1) {
      purposeConsents[String(purposeId)] = bit(purposeConsentOffset + purposeId - 1) === 1;
    }
    return { purposeConsents, status: "parsed_v2" };
  } catch {
    return { purposeConsents: {}, status: "invalid" };
  }
}
