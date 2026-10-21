import { decodeCanonicalConsentDecision, type ConsentStateDecision, type OneTrustGroupEvidence, type ConsentConfirmationReason } from "@certscore/contracts";
import { createHash } from "node:crypto";
import type { BrowserContext, Frame, Page } from "playwright";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";
import { verifyOneTrustCookieDecision, type OneTrustBaseline } from "./onetrust-consent-state.js";

export type ActionStateWrite = {
  storageType: "cookie" | "local_storage" | "session_storage";
  name: string;
  observedAtEpochMs: number;
  sequence: number;
  /** Ephemeral bounded confirmation input; never copied into evidence packets. */
  value?: string;
};

export type SemanticState = {
  oneTrustGroupEvidence?: OneTrustGroupEvidence;
  stateHash: string;
  key: string;
  observedAtEpochMs?: number;
  decision: Exclude<ConsentStateDecision, "unknown">;
};

export async function readActionStateWrites(scope: Page | Frame): Promise<ActionStateWrite[]> {
  return scope.evaluate(() => {
    const target = window as unknown as {
      __certscoreReadPostAcceptWrites?: () => ActionStateWrite[];
      __certscoreReadPostRefusalWrites?: () => ActionStateWrite[];
    };
    return (target.__certscoreReadPostAcceptWrites ?? target.__certscoreReadPostRefusalWrites)?.() ?? [];
  }).catch(() => []);
}

export function matchingStateWriteTime(
  writes: ActionStateWrite[], key: string, value: string, after: number, storageType: ActionStateWrite["storageType"],
) {
  // Bind the timestamp to the *value* that was verified, not merely to a write
  // to the same key. A later reversal must not inherit an earlier timestamp.
  return [...writes].reverse().find((write) => write.storageType === storageType && write.name === key && write.value === value &&
    write.observedAtEpochMs >= after)?.observedAtEpochMs;
}

export async function verifiedCookieDecision(input: {
  context: BrowserContext;
  scope: Page | Frame;
  cookieName: string;
  actionAt: number;
  oneTrustBaseline?: OneTrustBaseline;
  onDiagnostic?: (reason: ConsentConfirmationReason) => void;
}): Promise<SemanticState | undefined> {
  // Both reads are passive and independent. Share the existing confirmation
  // window instead of serializing two browser round trips on a busy renderer.
  const [writes, currentCookies] = await Promise.all([
    readActionStateWrites(input.scope), input.context.cookies(input.scope.url()),
  ]);
  const cookies = currentCookies.filter((cookie) =>
    matchesCanonicalCmpCookieName(cookie.name, input.cookieName));
  // Multiple paths/domains/partitions with the same logical cookie are ambiguous.
  if (cookies.length !== 1) { input.onDiagnostic?.(cookies.length ? "receipt_ambiguous" : "receipt_missing"); return undefined; }
  const cookie = cookies[0]!;
  if (input.cookieName === "OptanonConsent" && input.oneTrustBaseline) {
    const state = await verifyOneTrustCookieDecision(input.context, input.scope, input.oneTrustBaseline);
    if (!state || state.stateHash !== sha256(cookie.value)) { input.onDiagnostic?.("configuration_or_groups_unverified"); return undefined; }
    const observedAtEpochMs = matchingStateWriteTime(writes, cookie.name, cookie.value, input.actionAt, "cookie");
    // A partial pre-click receipt cannot establish the previous decision.
    // Require the complete replacement value to be written after dispatch.
    if (state.oneTrustGroupEvidence?.policyVersion === "onetrust_cookie_groups.v2" && observedAtEpochMs === undefined) { input.onDiagnostic?.("no_fresh_decision"); return undefined; }
    return { ...state, observedAtEpochMs };
  }
  const decision = decodeCanonicalConsentDecision(cookie.name, cookie.value, true);
  if (decision === "unknown") { input.onDiagnostic?.("receipt_malformed_or_unsupported"); return undefined; }
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
  onDiagnostic?: (reason: ConsentConfirmationReason) => void;
}): Promise<SemanticState | undefined> {
  const writes = (await readActionStateWrites(input.scope)).filter((write) =>
    write.observedAtEpochMs >= input.actionAt && write.sequence > (input.afterSequence ?? 0));
  const states: SemanticState[] = [];
  // Repeated writes to a registered receipt are common during CMP startup.
  // Read each current identity once per confirmation pass; every candidate
  // still needs exact value equality, a fresh timestamp and semantic decoding.
  let cookieRead: ReturnType<BrowserContext["cookies"]> | undefined;
  const storageReads = new Map<string, Promise<string | undefined>>();
  for (const write of writes.slice(-96)) {
    const registered = input.registeredKeys?.includes(write.name) === true;
    if (write.value === undefined || decodeCanonicalConsentDecision(write.name, write.value, registered) === "unknown") continue;
    let value: string | undefined;
    if (write.storageType === "cookie") {
      cookieRead ??= input.context.cookies(input.scope.url());
      const cookies = (await cookieRead).filter((cookie) => cookie.name === write.name);
      if (cookies.length === 1) value = cookies[0]!.value;
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
