import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { readActionStateWrites, type SemanticState } from "./consent-action-semantic-state.js";
import { receiptCaptureToken, retainTrustArcReceiptCookies } from "./consent-receipt-capture.js";
import { captureExactCookieWrite } from "./exact-cookie-write-capture.js";

// Retained Reject snapshots establish the expected value and scope on
// these routes. A fresh run must still join each value to its exact write.
export const TRUSTARC_REJECT_COOKIE_DOMAINS: ReadonlyMap<string, string> = new Map([
  ["https://buschgardens.com/", "buschgardens.com"],
  ["https://www.aboutamazon.eu/", "aboutamazon.eu"],
  ["https://www.assurant.com/", "assurant.com"],
  ["https://www.digitalocean.com/", "digitalocean.com"],
  ["https://www.ea.com/ea-studios/popcap", "ea.com"],
  ["https://www.ea.com/games/battlefield", "ea.com"],
  ["https://www.exprealty.com/", "exprealty.com"],
  ["https://www.garmin.com/en-US/", "garmin.com"],
  ["https://www.jmp.com/en/home", "jmp.com"],
  ["https://www.kornferry.com/", "kornferry.com"],
  ["https://www.mobvista.com/en", "mobvista.com"],
  ["https://trustarc.com/", "trustarc.com"],
  ["https://www.padi.com/", "padi.com"],
  ["https://www.productmadness.com/", "productmadness.com"],
  ["https://www.swtor.com/", "swtor.com"],
  ["https://www.waveapps.com/", "waveapps.com"],
]);

export const TRUSTARC_REQUIRED_ONLY_COOKIES = {
  notice_preferences: "0:",
  notice_gdpr_prefs: "0:",
  cmapi_cookie_privacy: "permit 1 required",
} as const;

export const TRUSTARC_UNDERSCORE_RECEIPT_ROUTES = ["https://www.mobvista.com/en", "https://trustarc.com/"] as const;
export function usesTrustArcUnderscoreReceipt(url: string): boolean {
  return TRUSTARC_UNDERSCORE_RECEIPT_ROUTES.some(route => route === url);
}

export type TrustArcRejectReceipt = SemanticState & {
  documentUrl: string;
  dispatchAtEpochMs: number;
  readAtEpochMs: number;
  writes: Array<{ name: string; identitySha256: string; valueSha256: string; observedAtEpochMs: number }>;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function readTrustArcRejectReceipt(
  context: BrowserContext,
  page: Page,
  dispatchedAt: number,
): Promise<TrustArcRejectReceipt | undefined> {
  const target = page.url();
  const domain = TRUSTARC_REJECT_COOKIE_DOMAINS.get(target);
  if (!domain) return;
  const token = receiptCaptureToken(page);
  const readStartedAt = Date.now();
  const underscore = usesTrustArcUnderscoreReceipt(target);
  // The reviewed reload route cannot spend a second browser round trip after
  // reading cookies. Use the existing two reads in parallel on these routes.
  const [cookies, earlyWrites] = await Promise.all([
    context.cookies(target), underscore ? readActionStateWrites(page) : undefined,
  ]);
  retainTrustArcReceiptCookies(token, cookies);
  const expected = Object.entries(TRUSTARC_REQUIRED_ONLY_COOKIES);
  const receipt = expected.flatMap(([name, legacyValue]) => {
    const value = underscore && name === "cmapi_cookie_privacy" ? "permit_1_required" : legacyValue;
    const matches = cookies.filter(cookie => cookie.name === name);
    const cookie = matches[0];
    if (matches.length !== 1 || !cookie || cookie.value !== value ||
        cookie.domain.replace(/^\./, "") !== domain || cookie.path !== "/" || cookie.partitionKey) return [];
    const identity = ["cookie_name_domain_path_partition", domain, cookie.path, "", name];
    return [{ name, identityHash: sha256(JSON.stringify(identity)), valueHash: sha256(value) }];
  });
  if (receipt.length !== expected.length || page.url() !== target) return;

  const writes = earlyWrites ?? await readActionStateWrites(page);
  if (page.url() !== target) return;
  const proofs = writes.flatMap(write => {
    if (write.storageType !== "cookie" || !write.cookieAssignment || write.documentUrl !== target ||
        write.observedAtEpochMs <= dispatchedAt || write.observedAtEpochMs > readStartedAt ||
        !Object.hasOwn(TRUSTARC_REQUIRED_ONLY_COOKIES, write.name)) return [];
    const proof = captureExactCookieWrite({
      assignment: write.cookieAssignment, url: write.documentUrl, source: "main_document_setter",
      observedAtMs: write.observedAtEpochMs,
    });
    return proof ? [proof] : [];
  });
  proofs.reverse();
  const matched = receipt.flatMap(cookie => {
    const write = proofs.find(proof => proof.identityHash === cookie.identityHash);
    return write?.valueHash === cookie.valueHash ? [write] : [];
  });
  if (matched.length !== expected.length) return;
  return {
    key: "notice_gdpr_prefs", decision: "denied", stateHash: sha256(JSON.stringify(receipt)),
    documentUrl: target, dispatchAtEpochMs: dispatchedAt, readAtEpochMs: Date.now(),
    writes: matched.map(write => ({
      name: write.name, identitySha256: write.identityHash, valueSha256: write.valueHash, observedAtEpochMs: write.observedAtMs,
    })),
    observedAtEpochMs: Math.max(...matched.map(write => write.observedAtMs)),
  };
}
