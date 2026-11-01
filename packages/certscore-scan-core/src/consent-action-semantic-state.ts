import {receiptCaptureToken,retainReceiptWrites,retainReceiptCookies} from './consent-receipt-capture.js';
import { verifyLegacyCookieYesReceipt, legacyCookieYesIdentity, type CookieYesLegacyBaseline } from "./cookieyes-legacy-consent-state.js";
import { cookieYesLegacyConfigurationSchema } from "@certscore/contracts";
import type { Locator } from "playwright";
import { verifyComplianzReceipt } from "./complianz-consent-state.js";
import { cmpPassiveReadToken, recordCmpPassiveRead } from "./cmp-passive-diagnostics.js";
import { decodeCanonicalConsentDecision, type ConsentStateDecision, type OneTrustGroupEvidence, type ConsentConfirmationReason } from "@certscore/contracts";
import { createHash } from "node:crypto";
import type { BrowserContext, Frame, Page } from "playwright";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";
import { oneTrustCookieIdentityHash, verifyOneTrustCookieDecision, type OneTrustBaseline } from "./onetrust-consent-state.js";

declare const cmplz_categories: unknown;

export type ActionStateWrite = {
  cookieAssignment?: string;
  documentUrl?: string;
  storageType: "cookie" | "local_storage" | "session_storage";
  name: string;
  observedAtEpochMs: number;
  sequence: number;
  /** Ephemeral bounded confirmation input; never copied into evidence packets. */
  value?: string;
};

export type SemanticState = {
  oneTrustGroupEvidence?: OneTrustGroupEvidence;
  cookieYesLegacyReceiptEvidence?: import("@certscore/contracts").CookieYesLegacyReceiptEvidence;
  complianzReceiptEvidence?: import("@certscore/contracts").ComplianzReceiptEvidence;
  stateHash: string;
  key: string;
  observedAtEpochMs?: number;
  decision: Exclude<ConsentStateDecision, "unknown">;
};

export async function readActionStateWrites(scope: Page | Frame): Promise<ActionStateWrite[]> {
  return (await readActionStateSnapshot(scope)).writes;
}

async function readActionStateSnapshot(scope: Page | Frame) {
  const token = cmpPassiveReadToken(scope);
  const receiptToken = receiptCaptureToken(scope);
  const raw = await scope.evaluate(readConsentActionSnapshot).catch(() => ({writes:[],passive:undefined,complianz:undefined,cookieYesLegacy:undefined,legacyControlBound:false}));
  retainReceiptWrites(receiptToken,Array.isArray(raw)?raw:raw.writes);
  if (Array.isArray(raw)) return {writes:raw as ActionStateWrite[],complianz:undefined,cookieYesLegacy:undefined};
  recordCmpPassiveRead(token,raw.passive);
  return {writes:raw.writes,complianz:raw.complianz,cookieYesLegacy:raw.cookieYesLegacy};
}

/** Serialized without imported closures; only own loaded data and bounded DOM
 * facts. No SDK calls, preference opening, category toggling or consent action. */
export function readConsentActionSnapshot(control?: Element | void) {
    const target = window as unknown as {
      __certscoreReadCmpPassiveEvents?: () => unknown;
      __certscoreReadPostAcceptWrites?: () => ActionStateWrite[];
      __certscoreReadPostRefusalWrites?: () => ActionStateWrite[];
    };
    const writes=(target.__certscoreReadPostAcceptWrites ?? target.__certscoreReadPostRefusalWrites)?.() ?? [];
    let passive:unknown;try { passive=target.__certscoreReadCmpPassiveEvents?.(); } catch { /* Optional diagnostics cannot discard writes. */ }
    // Read only already-loaded data in the existing write snapshot. No SDK
    // function, getter, extra round trip, wait or preference panel.
    let complianz:unknown;
    try {
      const descriptor=Object.getOwnPropertyDescriptor(window,"complianz");
      const config=descriptor && "value" in descriptor ? descriptor.value : undefined;
      const data={own(key:string){const d=config && Object.getOwnPropertyDescriptor(config,key);return d && "value" in d ? d.value : undefined;}};
      const categoryDescriptor=Object.getOwnPropertyDescriptor(window,"cmplz_categories");
      const categories=categoryDescriptor && !("value" in categoryDescriptor) ? undefined
        : typeof cmplz_categories === "undefined" ? undefined : cmplz_categories;
      const values=Array.isArray(categories) && categories.length===4 ? [0,1,2,3].map(index=>{
        const d=Object.getOwnPropertyDescriptor(categories,index);return d && "value" in d ? d.value : undefined;
      }) : undefined;
      if (values && values.every(v=>typeof v==="string") &&
        [false,0,""].includes(data.own("tcf_active"))) {
        complianz={prefix:data.own("prefix"),tcfActive:false,categories:values};
      }
    } catch { /* Unsupported configuration supplies no decision proof. */ }
    let cookieYesLegacy: unknown;
    let legacyControlBound = false;
    try {
      const data = {own(object: unknown, key: string | number): unknown {
        if (!object || (typeof object !== "object" && typeof object !== "function")) return undefined;
        const d = Object.getOwnPropertyDescriptor(object, key); return d && "value" in d ? d.value : undefined;
      }};
      const config = data.own(window, "Cli_Data"), cli = data.own(window, "CLI");
      if (typeof data.own(cli, "generateConsent") === "function" &&
        data.own(window, "CLI_PREFERNCE_COOKIE") === "CookieLawInfoConsent" &&
        data.own(window, "CLI_ACCEPT_COOKIE_NAME") === "viewed_cookie_policy") {
      const bars = document.querySelectorAll("#cookie-law-info-bar"), panels = document.querySelectorAll("#cliSettingsPopup");
      const boxes = document.querySelectorAll(".cli-user-preference-checkbox");
      const required = data.own(config, "strictlyEnabled");
      if (bars.length === 1 && panels.length === 1 && boxes.length > 0 && boxes.length <= 7 &&
        !Object.getOwnPropertyDescriptor(window, "__tcfapi") &&
        typeof data.own(cli, "generateConsent") === "function" &&
        data.own(window, "CLI_PREFERNCE_COOKIE") === "CookieLawInfoConsent" &&
        data.own(window, "CLI_ACCEPT_COOKIE_NAME") === "viewed_cookie_policy" &&
        Array.isArray(required) && required.length > 0 && required.length <= 7) {
        const categories: string[] = [], requiredCategories: unknown[] = [];
        let valid = true;
        for (let index = 0; index < boxes.length; index++) {
          const box = boxes[index]!;
          const id = box.getAttribute("data-id");
          if (box.localName !== "input" || box.getAttribute("type") !== "checkbox" ||
            !panels[0]!.contains(box) || !id || !/^checkbox-[a-z-]{1,24}$/.test(id)) { valid = false; break; }
          categories.push(id.slice("checkbox-".length));
        }
        for (let index = 0; index < required.length; index++) requiredCategories.push(data.own(required, index));
        if (valid && requiredCategories.every(value => typeof value === "string")) {
          cookieYesLegacy = {cookieName: "CookieLawInfoConsent", flagName: "viewed_cookie_policy",
            consentVersion: data.own(config, "consentVersion"), categories: categories.sort(), requiredCategories: requiredCategories.sort()};
          legacyControlBound = Boolean(control?.isConnected && control.closest("#cookie-law-info-bar") === bars[0]);
        }
      }
      }
    } catch { /* Incomplete or unsupported current category proof stays unknown. */ }
    return {writes, passive, complianz, cookieYesLegacy, legacyControlBound};
}

/** One bounded passive baseline read on the already selected control. The
 * existing cookie baseline read is reused for both protocol generations. */
export async function captureCookieYesConfirmationBaseline(scope: Page | Frame, control: Locator, cookiesRead: ReturnType<BrowserContext["cookies"]>) {
  const documentUrl = scope.url();
  const cookies = await cookiesRead;
  // Modern receipts keep their existing path without an added renderer read.
  if (cookies.some(cookie => cookie.name === "cookieyes-consent")) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const factsRead = Promise.race([
    control.evaluate(readConsentActionSnapshot).catch(() => undefined),
    new Promise<undefined>(resolve => {timer = setTimeout(() => resolve(undefined), 25);}),
  ]).finally(() => clearTimeout(timer));
  const raw = await factsRead;
  const configuration = cookieYesLegacyConfigurationSchema.safeParse(raw?.cookieYesLegacy);
  const legacy = cookies.filter(cookie => cookie.name === "CookieLawInfoConsent");
  const eligible = raw?.legacyControlBound && configuration.success && scope.url() === documentUrl && legacy.length <= 1 &&
    !cookies.some(cookie => cookie.name === "cookieyes-consent") && !legacy.some(cookie => cookie.httpOnly || cookie.partitionKey);
  const cookieYesLegacyBaseline: CookieYesLegacyBaseline | undefined = eligible && configuration.success ? {
    configuration: configuration.data, documentUrl, capturedAtEpochMs: Date.now(),
    lastSequence: raw?.writes.at(-1)?.sequence ?? 0,
    ...(legacy[0] ? {beforeValueSha256: sha256(legacy[0].value), beforeIdentitySha256: legacyCookieYesIdentity(legacy[0])} : {}),
  } : undefined;
  return cookieYesLegacyBaseline;
}

export function matchingStateWriteTime(
  writes: ActionStateWrite[], key: string, value: string, after: number, storageType: ActionStateWrite["storageType"],
) {
  // Bind the timestamp to the *value* that was verified, not merely to a write
  // to the same key. A later reversal must not inherit an earlier timestamp.
  return [...writes].reverse().find((write) => write.storageType === storageType && write.name === key && write.value === value &&
    write.observedAtEpochMs >= after)?.observedAtEpochMs;
}

type CookieDecisionInput = {
  context: BrowserContext;
  scope: Page | Frame;
  cookieName: string;
  actionAt: number;
  oneTrustBaseline?: OneTrustBaseline;
  cookieYesLegacyBaseline?: CookieYesLegacyBaseline;
  onDiagnostic?: (reason: ConsentConfirmationReason) => void;
};

export async function verifiedCookieDecision(input: CookieDecisionInput): Promise<SemanticState | undefined> {
  return verifiedCookieDecisionFromRead(input);
}

/** The changed-receipt gate and the candidate read are the same snapshot.
 * OneTrust's later independent readback still verifies identity, value and the
 * baseline-bound configuration. Unchanged receipts add no configuration read. */
export async function verifiedChangedOneTrustDecision(input: CookieDecisionInput & {
  cookieName: "OptanonConsent";
  oneTrustBaseline: Extract<OneTrustBaseline, {status: "verified"}>;
}): Promise<SemanticState | undefined> {
  const receiptToken=receiptCaptureToken(input.scope);
  const documentUrl = input.scope.url();
  if (input.oneTrustBaseline.documentUrl !== undefined && input.oneTrustBaseline.documentUrl !== documentUrl) {
    input.onDiagnostic?.("sdk_document_changed"); return undefined;
  }
  const cookies = await input.context.cookies(documentUrl);
  if (input.scope.url() !== documentUrl) { input.onDiagnostic?.("sdk_document_changed"); return undefined; }
  retainReceiptCookies(receiptToken,cookies,input.cookieName);
  const matching = cookies.filter(cookie => matchesCanonicalCmpCookieName(cookie.name, "OptanonConsent"));
  if (matching.length !== 1) { input.onDiagnostic?.(matching.length ? "receipt_ambiguous" : "receipt_missing"); return undefined; }
  if (oneTrustCookieIdentityHash(matching[0]!) !== input.oneTrustBaseline.identityHash) {
    input.onDiagnostic?.("receipt_identity_changed"); return undefined;
  }
  if (sha256(matching[0]!.value) === input.oneTrustBaseline.valueHash) { input.onDiagnostic?.("no_fresh_decision"); return undefined; }
  return verifiedCookieDecisionFromRead(input, cookies);
}

async function verifiedCookieDecisionFromRead(input: CookieDecisionInput,
  candidateCookies?: Awaited<ReturnType<BrowserContext["cookies"]>>): Promise<SemanticState | undefined> {
  if (matchesCanonicalCmpCookieName(input.cookieName, "OptanonConsent") && !input.oneTrustBaseline) {
    input.onDiagnostic?.("configuration_missing"); return undefined;
  }
  // Both reads are passive and independent. Share the existing confirmation
  // window instead of serializing two browser round trips on a busy renderer.
  const receiptToken=receiptCaptureToken(input.scope);
  const documentUrl = input.scope.url();
  const [snapshot, currentCookies] = await Promise.all([
    readActionStateSnapshot(input.scope), candidateCookies ?? input.context.cookies(documentUrl),
  ]);
  if (input.oneTrustBaseline && matchesCanonicalCmpCookieName(input.cookieName, "OptanonConsent") &&
      input.scope.url() !== documentUrl) { input.onDiagnostic?.("sdk_document_changed"); return undefined; }
  const writes = snapshot.writes;
  if (input.cookieName === "cookieyes-consent" && input.cookieYesLegacyBaseline) {
    retainReceiptCookies(receiptToken,currentCookies,"CookieLawInfoConsent");
    if (input.scope.url() !== documentUrl) {input.onDiagnostic?.("sdk_document_changed"); return undefined;}
    return verifyLegacyCookieYesReceipt({baseline: input.cookieYesLegacyBaseline, configuration: snapshot.cookieYesLegacy,
      documentUrl, cookies: currentCookies, writes, actionAt: input.actionAt, readAt: Date.now(), onDiagnostic: input.onDiagnostic});
  }
  retainReceiptCookies(receiptToken,currentCookies,input.cookieName);
  const cookies = currentCookies.filter((cookie) =>
    matchesCanonicalCmpCookieName(cookie.name, input.cookieName));
  // Multiple paths/domains/partitions with the same logical cookie are ambiguous.
  if (cookies.length !== 1) { input.onDiagnostic?.(cookies.length ? "receipt_ambiguous" : "receipt_missing"); return undefined; }
  const cookie = cookies[0]!;
  if (input.cookieName === "OptanonConsent" && input.oneTrustBaseline) {
    if (input.oneTrustBaseline.status === "verified" && oneTrustCookieIdentityHash(cookie) !== input.oneTrustBaseline.identityHash) {
      input.onDiagnostic?.("receipt_identity_changed"); return undefined;
    }
    const state = await verifyOneTrustCookieDecision(input.context, input.scope, input.oneTrustBaseline, input.onDiagnostic);
    if (!state) return undefined;
    if (state.stateHash !== sha256(cookie.value)) { input.onDiagnostic?.("receipt_readback_mismatch"); return undefined; }
    const observedAtEpochMs = matchingStateWriteTime(writes, cookie.name, cookie.value, input.actionAt, "cookie");
    // Partial-baseline and SDK-applicability proofs require a complete
    // replacement value instrumented after dispatch, not only a changed hash.
    if (state.oneTrustGroupEvidence && state.oneTrustGroupEvidence.policyVersion !== "onetrust_cookie_groups.v1" && observedAtEpochMs === undefined) { input.onDiagnostic?.("no_fresh_decision"); return undefined; }
    return { ...state, observedAtEpochMs };
  }
  const decision = decodeCanonicalConsentDecision(cookie.name, cookie.value, true, input.onDiagnostic);
  if (decision === "unknown") return undefined;
  return {
    key: cookie.name,
    stateHash: sha256(cookie.value),
    decision,
    observedAtEpochMs: matchingStateWriteTime(writes, cookie.name, cookie.value, input.actionAt, "cookie"),
  };
}

export async function verifiedCanonicalStateWrite(input: {
  context: BrowserContext;
  scope: Page | Frame;
  actionAt: number;
  afterSequence?: number;
  registeredKeys?: string[];
  baselineStateHashes?: Record<string, string>;
  complianzControlBound?: boolean;
  onDiagnostic?: (reason: ConsentConfirmationReason) => void;
}): Promise<SemanticState | undefined> {
  const snapshot = await readActionStateSnapshot(input.scope);
  const writes = snapshot.writes.filter((write) =>
    write.observedAtEpochMs >= input.actionAt && write.sequence > (input.afterSequence ?? 0));
  const states: SemanticState[] = [];
  // Repeated writes to a registered receipt are common during CMP startup.
  // Read each current identity once per confirmation pass; every candidate
  // still needs exact value equality, a fresh timestamp and semantic decoding.
  let cookieRead: ReturnType<BrowserContext["cookies"]> | undefined;
  const storageReads = new Map<string, Promise<string | undefined>>();
  if (input.complianzControlBound && writes.some(write => write.storageType === "cookie" && /^cmplz_(preferences|statistics|marketing)$/.test(write.name))) {
    const documentUrl = input.scope.url();
    cookieRead = input.context.cookies(documentUrl);
    const cookies = await cookieRead;
    if (input.scope.url() === documentUrl) {
      const state = verifyComplianzReceipt({configuration:snapshot.complianz,documentUrl,cookies,
        writes:writes.slice(-96),actionAt:input.actionAt,readAt:Date.now(),onDiagnostic:input.onDiagnostic});
      if (state) states.push(state);
    }
  }
  for (const write of writes.slice(-96)) {
    // Split receipts were considered together above; metadata is not a decision.
    if (write.name.startsWith("cmplz_")) continue;
    const registered = input.registeredKeys?.includes(write.name) === true;
    // Unknown unrelated writes are not consent receipt failures. Inspect only
    // registered keys or canonical consent identities for diagnostic purposes.
    const diagnostic = registered || /consent/i.test(write.name) ? input.onDiagnostic : undefined;
    // Generic write matching has no pre-click OneTrust configuration proof.
    // Keep its dynamic group receipts on the dedicated verified-cookie path.
    if (matchesCanonicalCmpCookieName(write.name, "OptanonConsent")) {
      diagnostic?.("configuration_missing"); continue;
    }
    if (write.value === undefined || decodeCanonicalConsentDecision(write.name, write.value, registered, diagnostic) === "unknown") continue;
    let value: string | undefined;
    if (write.storageType === "cookie") {
      cookieRead ??= input.context.cookies(input.scope.url());
      const allCookies=await cookieRead;
      retainReceiptCookies(receiptCaptureToken(input.scope),allCookies,write.name);
      const cookies = allCookies.filter((cookie) => cookie.name === write.name);
      if (cookies.length !== 1) { input.onDiagnostic?.(cookies.length ? "receipt_ambiguous" : "receipt_missing"); continue; }
      value = cookies[0]!.value;
    } else {
      const identity = `${write.storageType}\n${write.name}`;
      let read = storageReads.get(identity);
      if (!read) {
        read = input.scope.evaluate(({ name, type }) => {
        const storage = type === "local_storage" ? window.localStorage : window.sessionStorage;
        return storage.getItem(name) ?? undefined;
        }, { name: write.name, type: write.storageType }).catch(() => undefined);
        storageReads.set(identity, read);
      }
      value = await read;
    }
    if (value !== write.value) { input.onDiagnostic?.("receipt_readback_mismatch"); continue; }
    const decision = decodeCanonicalConsentDecision(write.name, value, registered);
    if (decision === "unknown") continue;
    states.push({ key: write.name, stateHash: sha256(value), decision, observedAtEpochMs: write.observedAtEpochMs });
  }
  if (states.length === 0 && input.baselineStateHashes) {
    const current = await input.scope.evaluate(() => {
      const values: Array<{ type: string; key: string; value: string }> = [];
      for (const [type, storage] of [["local_storage", localStorage], ["session_storage", sessionStorage]] as const) {
        for (let index = 0; index < Math.min(storage.length, 64); index++) {
          const key = storage.key(index);
          const value = key ? storage.getItem(key) : null;
          if (key && key.length <= 160 && value && value.length <= 2048) values.push({ type, key, value });
        }
      }
      return values;
    }).catch(() => []);
    for (const state of current) {
      const decision = decodeCanonicalConsentDecision(state.key, state.value, input.registeredKeys?.includes(state.key) === true);
      const stateHash = sha256(state.value);
      if (decision !== "unknown" && input.baselineStateHashes[`${state.type}\n${state.key}`] !== stateHash) {
        states.push({ key: state.key, stateHash, decision });
      }
    }
  }
  if (states.length === 0) { input.onDiagnostic?.(writes.length ? "no_registered_complete_decision" : "no_fresh_decision"); return undefined; }
  const decisions = new Set(states.map((state) => state.decision));
  if (decisions.size !== 1 || decisions.has("mixed")) {
    return { key: "conflicting_consent_state", stateHash: sha256(JSON.stringify(states.map((s) => s.stateHash))), decision: "mixed" };
  }
  return states.at(-1);
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
