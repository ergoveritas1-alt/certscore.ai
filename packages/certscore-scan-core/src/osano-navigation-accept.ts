import {createHash} from "node:crypto";
import type {ElementHandle} from "playwright";
import {readWithinActionBoundary} from "./action-operation-boundary.js";

/** Subscribe in the proof-bound element's realm before input. The pending read is
 * started there too. Navigating to another document cannot redirect the read. */
export async function armOsanoNavigationAccept(button: ElementHandle<HTMLElement | SVGElement>, url: string) {
  const handle = await button.evaluateHandle((element, target) => {
    type Api = {getConsent(): unknown; addEventListener(name: string, fn: (event: unknown) => void): void};
    const win = window as Window & {Osano?: {cm?: Api}};
    const api = win.Osano?.cm;
    const doc = element.ownerDocument;
    if (!api || typeof api.addEventListener !== "function" || typeof api.getConsent !== "function" ||
        doc !== document || window !== window.top || location.href !== target || Object.hasOwn(win,"__tcfapi") ||
        !element.isConnected || !element.closest(".osano-cm-window")) return null;
    function config() {
      if (doc.scripts.length > 96) return;
      const urls = Array.from(doc.scripts,s => s.src).filter(s => s.startsWith("https://cmp.osano.com/"));
      if (urls.length >= 1 && urls.length <= 4 && new Set(urls).size === 1 &&
          /^https:\/\/cmp\.osano\.com\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9-]{1,80}\/osano\.js$/.test(urls[0]!)) return urls[0];
    }
    const source = config();
    if (!source) return null;
    function categories(raw: unknown) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const v = raw as Record<string, unknown>;
      const opt = Object.hasOwn(v,"OPT_OUT") ? "OPT_OUT" : "OPT-OUT";
      const keys = ["ANALYTICS","MARKETING","PERSONALIZATION","ESSENTIAL","STORAGE",opt];
      if (Object.keys(v).length !== keys.length || v.ESSENTIAL !== "ACCEPT" ||
          !keys.every(k => Object.hasOwn(v,k) && (v[k] === "DENY" || v[k] === "ACCEPT"))) return;
      return keys.map(k => v[k] as "ACCEPT" | "DENY");
    }
    const prior = api.getConsent();
    if (prior !== undefined && !categories(prior)) return null;
    type Receipt = {clickAt:number; savedAt:number; storage:"ACCEPT"|"DENY"; optOut:"ACCEPT"|"DENY"};
    let settle!: (result:Receipt|null) => void;
    const result = new Promise<Receipt|null>(resolve => {settle=resolve;});
    let clickAt: number | undefined;
    doc.addEventListener("click", event => {
      if (clickAt === undefined && event.isTrusted && element.isConnected && event.composedPath().includes(element) &&
          location.href === target) clickAt = Date.now();
    }, {capture:true,once:true});
    let consumed = false;
    api.addEventListener("osano-cm-consent-saved", event => {
      if (clickAt === undefined || consumed) return;
      consumed = true;
      try {
        if (win.Osano?.cm !== api || document !== doc || location.href !== target ||
            Object.hasOwn(win,"__tcfapi") || config() !== source) return settle(null);
        const saved = categories(event), current = categories(api.getConsent());
        if (!saved || !current || !saved.every((v,i) => v === current[i]) ||
            !saved.slice(0,3).every(v => v === "ACCEPT")) return settle(null);
        settle({clickAt,savedAt:Date.now(),storage:saved[4]!,optOut:saved[5]!});
      } catch { settle(null); }
    });
    return {result};
  },url);
  // A context destroyed before delivery yields no evidence. Never rebind to its successor.
  const delivery = handle.evaluate(value => value?.result ?? null).catch(() => null)
    .finally(() => {void handle.dispose().catch(() => {});});
  return async (dispatch: number, deadline: number, signal?: AbortSignal) => {
    const receipt = await readWithinActionBoundary(() => delivery,null,deadline,signal);
    if (!receipt || receipt.clickAt < dispatch || receipt.savedAt < receipt.clickAt ||
        receipt.savedAt > Date.now() || receipt.savedAt > deadline) return;
    const entries = ["ANALYTICS","MARKETING","PERSONALIZATION"].map(name => [name,true]);
    const stateHash = createHash("sha256").update(JSON.stringify({entries,storage:receipt.storage,optOut:receipt.optOut})).digest("hex");
    return {stateHash,observedAtEpochMs:receipt.savedAt};
  };
}
