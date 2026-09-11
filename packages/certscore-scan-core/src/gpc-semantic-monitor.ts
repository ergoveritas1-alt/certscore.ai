import type { BrowserContext } from "playwright";
import { parseGpcGppPing } from "./gpc-gpp-parser.js";

/** Bounded passive listener; no global API replacement, timers, clicks or polling. */
export async function installGpcSemanticMonitor(context: BrowserContext, key: string) {
  function bootstrap(key: string, parse: typeof parseGpcGppPing) {
    if (window !== window.top) return;
    const w = window as unknown as Record<string, any>;
    let closed = false, attempts = 0, listenerId: number | null = null, api: any;
    let callbacks = 0, dropped = 0, checks = 0;
    const startedAt = Date.now();
    const history: Array<{ at: number; status: string; state: unknown }> = [];
    let observer: MutationObserver | undefined;
    const onEvent = (event: any, success: boolean) => {
      if (closed) return;
      if (++callbacks > 64) { dropped++; return; }
      if (success !== true || !event || typeof event !== "object") return;
      if (event.eventName === "listenerRegistered" && event.data === true && Number.isInteger(event.listenerId) && event.listenerId > 0) listenerId = event.listenerId;
      if (!["listenerRegistered", "signalStatus", "sectionChange", "cmpStatus"].includes(event.eventName)) return;
      const value = parse(event.pingData);
      const previous = history.at(-1);
      if (previous && previous.status === value.status && JSON.stringify(previous.state) === JSON.stringify(value.state)) return;
      if (history.length >= 16) { dropped++; history.shift(); }
      history.push({ at: Date.now(), ...value });
    };
    const attach = () => {
      if (closed || api) return;
      if (++checks > 128 || attempts >= 2) { observer?.disconnect(); return; }
      if (typeof w.__gpp !== "function") return;
      api = w.__gpp; attempts++;
      try { api("addEventListener", onEvent); } catch { api = undefined; }
      if (api) observer?.disconnect();
    };
    document.addEventListener("DOMContentLoaded", attach);
    document.addEventListener("load", attach, true);
    observer = new MutationObserver(attach);
    observer.observe(document, { childList: true, subtree: true });
    attach();
    Object.defineProperty(w, key, { configurable: false, value: {
      finish: () => {
        attach(); closed = true; observer?.disconnect();
        document.removeEventListener("DOMContentLoaded", attach);
        document.removeEventListener("load", attach, true);
        if (api && listenerId !== null) { try { api("removeEventListener", () => {}, listenerId); } catch {} }
        return { startedAt, endedAt: Date.now(), callbacks, dropped, listenerRegistered: listenerId !== null, history };
      },
    } });
  }
  // tsx can emit __name helpers inside serialized functions; keep that harmless
  // helper lexical without modifying any website global.
  await context.addInitScript({ content: `(() => { const __name = (fn) => fn; (${bootstrap.toString()})(${JSON.stringify(key)}, (${parseGpcGppPing.toString()})); })();` });
}
