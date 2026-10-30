import {receiptCaptureToken,retainReceiptWrites,retainReceiptCookies} from './consent-receipt-capture.js';
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
  complianzReceiptEvidence?: import("@certscore/contracts").ComplianzReceiptEvidence;
  stateHash: string;
  key: string;
  observedAtEpochMs?: number;
  decision: Exclude<ConsentStateDecision, "unknown">;
};

export async function readActionStateWrites(scope: Page | Frame): Promise<ActionStateWrite[]> {
  return (await readActionStateSnapshot(scope)).writes;
}

async function readActionStateSnapshot(scope: Page | Frame): Promise<{writes:ActionStateWrite[];complianz:unknown}> {
  const token = cmpPassiveReadToken(scope);
  const receiptToken = receiptCaptureToken(scope);
  const raw = await scope.evaluate(() => {
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
      const own=(key:string)=>{const d=config && Object.getOwnPropertyDescriptor(config,key);return d && "value" in d ? d.value : undefined;};
      const categoryDescriptor=Object.getOwnPropertyDescriptor(window,"cmplz_categories");
      const categories=categoryDescriptor && !("value" in categoryDescriptor) ? undefined
        : typeof cmplz_categories === "undefined" ? undefined : cmplz_categories;
      const values=Array.isArray(categories) && categories.length===4 ? [0,1,2,3].map(index=>{
        const d=Object.getOwnPropertyDescriptor(categories,index);return d && "value" in d ? d.value : undefined;
      }) : undefined;
      if (values && values.every(v=>typeof v==="string") &&
        [false,0,""].includes(own("tcf_active"))) {
        complianz={prefix:own("prefix"),tcfActive:false,categories:values};
      }
    } catch { /* Unsupported configuration supplies no decision proof. */ }
    return {writes,passive,complianz};
  }).catch(() => ({writes:[],passive:undefined}));
  retainReceiptWrites(receiptToken,Array.isArray(raw)?raw:raw.writes);
  if (Array.isArray(raw)) return {writes:raw,complianz:undefined}; // Existing test/historical read helpers.
  recordCmpPassiveRead(token,raw.passive);
  return {writes:raw.writes,complianz:"complianz" in raw ? raw.complianz : undefined};
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
  const cookies = await input.context.cookies(input.scope.url());
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
  const [writes, currentCookies] = await Promise.all([
    readActionStateWrites(input.scope), candidateCookies ?? input.context.cookies(input.scope.url()),
  ]);
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
