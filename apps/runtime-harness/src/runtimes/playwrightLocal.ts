import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type ConsoleMessage, type Page, type Request, type Response } from "playwright";
import { cookieCheckpointsWithin, finalizeResult, writeSupportFile } from "../core/capture";
import { matchUrlToVendor } from "../core/classify";
import { buildLeakMap, buildPreConsentTimeline, detectCnameCloaking, getPersistedVendorsAfterReject } from "../core/evidence";
import type { RuntimeHarnessContext } from "../core/capture";
import type {
  BrowserObservationCollectorSnapshot,
  ConsentUiSummary,
  CookieRecord,
  FingerprintingCollectorSnapshot,
  PageSnapshotSummary,
  RuntimeOptions,
  RuntimeRunResult,
  UnifiedRuntime
} from "../core/types";

const CONSENT_ROOT_SELECTORS = [
  '[id*="consent"]',
  '[class*="consent"]',
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[aria-label*="consent" i]',
  '[aria-label*="cookie" i]',
  '[role="dialog"]',
  '[data-testid*="consent"]'
];

const REJECT_SELECTORS = [
  'button:has-text("Reject")',
  'button:has-text("Decline")',
  'button:has-text("No thanks")',
  '[role="button"]:has-text("Reject")',
  '[role="button"]:has-text("Decline")'
];

const ACCEPT_PATTERNS = /(accept|allow|agree|got it)/i;
const REJECT_PATTERNS = /(reject|decline|no thanks|deny)/i;
const MANAGE_PATTERNS = /(manage|preferences|settings|choices)/i;
const STOP_QUIET_WINDOW_MS = 2_500;
const STOP_POLL_INTERVAL_MS = 250;
const CDP_BLOCKED_MIN_DWELL_MS = 4_000;
const FIRST_MAIN_DOCUMENT_RESPONSE_CAP_MS = 12_000;
const DOM_CONTENT_LOADED_CAP_MS = 15_000;
const POST_DOM_NO_SIGNAL_CAP_MS = 6_000;
const CHALLENGE_TITLE_PATTERNS = /(just a moment|access denied|attention required|security check|verification)/i;
const CHALLENGE_HOST_PATTERNS = /(captcha-delivery|captcha|challenge|turnstile|human-security|datadome|perimeterx|px-cloud|px-client)/i;
const KNOWN_BOT_SCRIPT_SIGNATURES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "cloudflare_bot_management",
    pattern: /cdn-cgi\/challenge-platform|cdn-cgi\/rum|cloudflareinsights\.com\/beacon\.min\.js|challenges\.cloudflare\.com|turnstile|cf_chl/i
  },
  {
    label: "perimeterx",
    pattern: /perimeterx|px-cloud|px-client/i
  },
  {
    label: "datadome",
    pattern: /datadome/i
  },
  {
    label: "arkoselabs",
    pattern: /arkoselabs|funcaptcha/i
  },
  {
    label: "human_security",
    pattern: /human-security|humansecurity/i
  },
  {
    label: "fingerprint_botd",
    pattern: /fingerprint\.com\/botd/i
  }
];
const KNOWN_FINGERPRINT_SCRIPT_SIGNATURES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "fingerprintjs",
    pattern: /fingerprintjs|fingerprint2|fpjs/i
  },
  {
    label: "clientjs",
    pattern: /clientjs/i
  },
  {
    label: "deviceatlas",
    pattern: /deviceatlas/i
  }
];

function inferKnownSignatureMatch(haystack: string, signatures: Array<{ label: string; pattern: RegExp }>) {
  for (const signature of signatures) {
    if (signature.pattern.test(haystack)) {
      return signature.label;
    }
  }
  return null;
}

async function installFingerprintingCollector(context: BrowserContext) {
  await context.addInitScript(() => {
    type CategoryName =
      | "audio"
      | "canvas_webgl"
      | "fonts_plugins"
      | "hardware"
      | "input_touch"
      | "media_devices"
      | "network_device_state"
      | "screen_viewport"
      | "storage"
      | "timezone_locale";

    type CategoryState = {
      firstSeenMs: number | null;
      hits: number;
    };
    type InputEventType = "beforeinput" | "change" | "input" | "keydown" | "keypress" | "keyup" | "paste";
    type InputTargetKind = "contenteditable" | "document" | "form" | "input" | "other" | "textarea" | "window";

    const now = () => Math.round(performance.now());
    const maxHits = 3;
    const INPUT_EVENT_SAMPLE_CAP = 40;
    const INPUT_LISTENER_SAMPLE_CAP = 50;
    const INPUT_PROBE_SAMPLE_CAP = 6;
    const INPUT_EVENT_TYPES = new Set<InputEventType>(["beforeinput", "change", "input", "keydown", "keypress", "keyup", "paste"]);
    const state: Record<CategoryName, CategoryState> = {
      audio: { firstSeenMs: null, hits: 0 },
      canvas_webgl: { firstSeenMs: null, hits: 0 },
      fonts_plugins: { firstSeenMs: null, hits: 0 },
      hardware: { firstSeenMs: null, hits: 0 },
      input_touch: { firstSeenMs: null, hits: 0 },
      media_devices: { firstSeenMs: null, hits: 0 },
      network_device_state: { firstSeenMs: null, hits: 0 },
      screen_viewport: { firstSeenMs: null, hits: 0 },
      storage: { firstSeenMs: null, hits: 0 },
      timezone_locale: { firstSeenMs: null, hits: 0 }
    };

    const collector = {
      categories: state,
      eventSamples: [] as Array<{ api: string; category: string; scriptOrigin: "first_party" | "third_party" | "unknown"; tsMs: number }>,
      identifierShapingDetected: false,
      knownBotLibraryMatch: null as string | null,
      knownFingerprintLibraryMatch: null as string | null,
      mark(name: CategoryName) {
        const record = state[name];
        if (record.firstSeenMs === null) {
          record.firstSeenMs = now();
        }
        record.hits = Math.min(record.hits + 1, maxHits);
      },
      sample(name: CategoryName, api: string) {
        if (this.eventSamples.length < 10) {
          this.eventSamples.push({
            api,
            category: name,
            scriptOrigin: "unknown",
            tsMs: now()
          });
        }
      }
    };

    const globalScope = window as typeof window & {
      __certscoreBrowserCollector__?: {
        consentDismissedWithoutChoice: boolean;
        firstInteractionMs: number | null;
        inputListenerRegistrations: Array<{ capture: boolean; eventType: InputEventType; targetKind: InputTargetKind; tsMs: number }>;
        inputProbeRuns: Array<{
          endMs: number | null;
          fieldTag: string;
          fieldType: string | null;
          startMs: number;
          targetKind: "contenteditable" | "input" | "textarea";
          typedCharCount: number;
          valueLength: number | null;
        }>;
        indexedDbUsed: boolean;
        jsCookieWrites: Array<{ cookieName: string; tsMs: number }>;
        jsNavigationDetected: boolean;
        localStorageKeys: string[];
        localStorageWrites: Array<{ key: string; tsMs: number }>;
        popupCount: number;
        sessionStorageKeys: string[];
        sessionStorageWrites: Array<{ key: string; tsMs: number }>;
        textInputEventSamples: Array<{
          eventType: InputEventType;
          inputType: string | null;
          targetKind: "contenteditable" | "input" | "textarea";
          tsMs: number;
          valueLength: number | null;
        }>;
        userInteracted: boolean;
        finishInputProbe(meta?: { valueLength?: number | null }): void;
        startInputProbe(meta: {
          fieldTag: string;
          fieldType: string | null;
          targetKind: "contenteditable" | "input" | "textarea";
          typedCharCount: number;
        }): void;
      };
      __certscoreFingerprintingCollector__?: typeof collector;
    };

    const getInputTargetKind = (target: EventTarget | null): InputTargetKind => {
      if (target === window) {
        return "window";
      }
      if (target === document) {
        return "document";
      }
      if (target instanceof HTMLInputElement) {
        return "input";
      }
      if (target instanceof HTMLTextAreaElement) {
        return "textarea";
      }
      if (target instanceof HTMLFormElement) {
        return "form";
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        return "contenteditable";
      }
      return "other";
    };

    const getEditableTargetKind = (target: EventTarget | null) => {
      const kind = getInputTargetKind(target);
      return kind === "input" || kind === "textarea" || kind === "contenteditable" ? kind : null;
    };

    globalScope.__certscoreFingerprintingCollector__ = collector;
    globalScope.__certscoreBrowserCollector__ = {
      consentDismissedWithoutChoice: false,
      firstInteractionMs: null,
      inputListenerRegistrations: [],
      inputProbeRuns: [],
      indexedDbUsed: false,
      jsCookieWrites: [],
      jsNavigationDetected: false,
      localStorageKeys: [],
      localStorageWrites: [],
      popupCount: 0,
      sessionStorageKeys: [],
      sessionStorageWrites: [],
      textInputEventSamples: [],
      userInteracted: false
      ,
      finishInputProbe(meta) {
        const currentProbe = this.inputProbeRuns[this.inputProbeRuns.length - 1];
        if (!currentProbe || currentProbe.endMs !== null) {
          return;
        }
        currentProbe.endMs = now();
        currentProbe.valueLength = meta?.valueLength ?? null;
      },
      startInputProbe(meta) {
        if (this.inputProbeRuns.length >= INPUT_PROBE_SAMPLE_CAP) {
          return;
        }
        this.inputProbeRuns.push({
          endMs: null,
          fieldTag: meta.fieldTag,
          fieldType: meta.fieldType,
          startMs: now(),
          targetKind: meta.targetKind,
          typedCharCount: meta.typedCharCount,
          valueLength: null
        });
      }
    };

    const browserCollector = globalScope.__certscoreBrowserCollector__;
    const noteInteraction = () => {
      if (!browserCollector.userInteracted) {
        browserCollector.userInteracted = true;
        browserCollector.firstInteractionMs = now();
      }
    };
    window.addEventListener("click", noteInteraction, { capture: true, passive: true });
    window.addEventListener("keydown", noteInteraction, { capture: true, passive: true });
    window.addEventListener("pointerdown", noteInteraction, { capture: true, passive: true });

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patchedAddEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      if (INPUT_EVENT_TYPES.has(type as InputEventType) && browserCollector.inputListenerRegistrations.length < INPUT_LISTENER_SAMPLE_CAP) {
        browserCollector.inputListenerRegistrations.push({
          capture: typeof options === "boolean" ? options : Boolean(options?.capture),
          eventType: type as InputEventType,
          targetKind: getInputTargetKind(this),
          tsMs: now()
        });
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    const recordTextInputEvent = (event: Event) => {
      const targetKind = getEditableTargetKind(event.target);
      if (!targetKind || browserCollector.textInputEventSamples.length >= INPUT_EVENT_SAMPLE_CAP) {
        return;
      }
      const target =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
          ? event.target
          : event.target instanceof HTMLElement && event.target.isContentEditable
            ? event.target
            : null;
      browserCollector.textInputEventSamples.push({
        eventType: event.type as InputEventType,
        inputType: event instanceof InputEvent && typeof event.inputType === "string" ? event.inputType : null,
        targetKind,
        tsMs: now(),
        valueLength:
          target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
            ? target.value.length
            : target instanceof HTMLElement
              ? target.innerText.length
              : null
      });
    };
    for (const eventType of INPUT_EVENT_TYPES) {
      document.addEventListener(eventType, recordTextInputEvent, true);
    }

    document.addEventListener(
      "play",
      (event) => {
        const target = event.target;
        if (target instanceof HTMLMediaElement && !target.getAttribute("data-certscore-first-play-ms")) {
          target.setAttribute("data-certscore-first-play-ms", String(now()));
        }
      },
      true
    );

    const patchMethod = <T extends object, K extends keyof T>(target: T | undefined, key: K, category: CategoryName, afterCall?: () => void) => {
      const original = target?.[key];
      if (typeof original !== "function") {
        return;
      }
      Object.defineProperty(target, key, {
        configurable: true,
        value: function patched(this: unknown, ...args: unknown[]) {
          collector.mark(category);
          collector.sample(category, String(key));
          afterCall?.();
          return Reflect.apply(original as (...innerArgs: unknown[]) => unknown, this, args);
        }
      });
    };

    const patchGetter = <T extends object, K extends keyof T>(target: T | undefined, key: K, category: CategoryName) => {
      if (!target) {
        return;
      }
      let cursor: object | null = target;
      while (cursor) {
        const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
        if (descriptor?.get) {
          Object.defineProperty(target, key, {
            configurable: true,
            get() {
              collector.mark(category);
              collector.sample(category, String(key));
              return descriptor.get?.call(this);
            }
          });
          break;
        }
        cursor = Object.getPrototypeOf(cursor);
      }
    };

    patchMethod(HTMLCanvasElement.prototype, "toDataURL", "canvas_webgl");
    patchMethod(HTMLCanvasElement.prototype, "toBlob", "canvas_webgl");
    patchMethod(CanvasRenderingContext2D?.prototype, "getImageData", "canvas_webgl");
    patchMethod(WebGLRenderingContext?.prototype, "getParameter", "canvas_webgl");
    patchMethod(WebGLRenderingContext?.prototype, "readPixels", "canvas_webgl");
    patchMethod(WebGL2RenderingContext?.prototype, "getParameter", "canvas_webgl");
    patchMethod(WebGL2RenderingContext?.prototype, "readPixels", "canvas_webgl");

    patchMethod(AudioBuffer?.prototype, "getChannelData", "audio");
    patchMethod(AnalyserNode?.prototype, "getFloatFrequencyData", "audio");
    patchMethod(AnalyserNode?.prototype, "getByteFrequencyData", "audio");

    patchGetter(window, "screen", "screen_viewport");
    patchGetter(window, "innerWidth", "screen_viewport");
    patchGetter(window, "innerHeight", "screen_viewport");
    patchGetter(screen, "width", "screen_viewport");
    patchGetter(screen, "height", "screen_viewport");
    patchGetter(screen, "availWidth", "screen_viewport");
    patchGetter(screen, "availHeight", "screen_viewport");
    patchGetter(screen, "colorDepth", "screen_viewport");
    patchGetter(screen, "pixelDepth", "screen_viewport");

    patchMethod(Date.prototype, "getTimezoneOffset", "timezone_locale");
    patchMethod(Intl.DateTimeFormat.prototype, "resolvedOptions", "timezone_locale");
    patchGetter(navigator, "language", "timezone_locale");
    patchGetter(navigator, "languages", "timezone_locale");

    patchGetter(navigator, "hardwareConcurrency", "hardware");
    patchGetter(navigator as Navigator & { deviceMemory?: number }, "deviceMemory", "hardware");
    patchGetter(navigator, "platform", "hardware");
    patchGetter(navigator, "userAgent", "hardware");

    patchGetter(navigator, "plugins", "fonts_plugins");
    patchGetter(navigator, "mimeTypes", "fonts_plugins");
    if (document.fonts) {
      patchMethod(document.fonts, "check", "fonts_plugins");
    }

    patchMethod(navigator.mediaDevices, "enumerateDevices", "media_devices");
    patchMethod(navigator.mediaDevices, "getUserMedia", "media_devices");

    patchGetter(navigator, "maxTouchPoints", "input_touch");

    patchGetter(navigator as Navigator & { connection?: unknown }, "connection", "network_device_state");
    patchGetter(navigator, "onLine", "network_device_state");

    patchMethod(Storage.prototype, "getItem", "storage");
    const originalSetItem = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: function patchedSetItem(this: Storage, key: string, value: string) {
        collector.mark("storage");
        const entry = { key, tsMs: now() };
        if (this === window.localStorage) {
          browserCollector.localStorageWrites.push(entry);
          if (!browserCollector.localStorageKeys.includes(key)) {
            browserCollector.localStorageKeys.push(key);
          }
        } else if (this === window.sessionStorage) {
          browserCollector.sessionStorageWrites.push(entry);
          if (!browserCollector.sessionStorageKeys.includes(key)) {
            browserCollector.sessionStorageKeys.push(key);
          }
        }
        if (FINGERPRINT_KEY_RE.test(key)) {
          collector.identifierShapingDetected = true;
        }
        return originalSetItem.call(this, key, value);
      }
    });

    const originalBtoa = window.btoa;
    window.btoa = function patchedBtoa(value: string) {
      collector.identifierShapingDetected = true;
      return originalBtoa.call(this, value);
    };

    if (window.indexedDB?.open) {
      const originalIndexedDbOpen = window.indexedDB.open.bind(window.indexedDB);
      window.indexedDB.open = function patchedIndexedDbOpen(...args: Parameters<typeof originalIndexedDbOpen>) {
        browserCollector.indexedDbUsed = true;
        return originalIndexedDbOpen(...args);
      };
    }

    let cookieDescriptor =
      Object.getOwnPropertyDescriptor(Document.prototype, "cookie") ??
      Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "cookie");
    if (cookieDescriptor?.set) {
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get() {
          return cookieDescriptor?.get?.call(document) ?? "";
        },
        set(value: string) {
          const cookieName = value.split("=")[0]?.trim() ?? "unknown";
          browserCollector.jsCookieWrites.push({ cookieName, tsMs: now() });
          if (FINGERPRINT_KEY_RE.test(cookieName)) {
            collector.identifierShapingDetected = true;
          }
          cookieDescriptor?.set?.call(document, value);
        }
      });
    }

    const originalOpen = window.open;
    window.open = function patchedOpen(...args: Parameters<typeof originalOpen>) {
      browserCollector.popupCount += 1;
      return originalOpen.apply(this, args);
    };

    const originalPushState = history.pushState.bind(history);
    history.pushState = function patchedPushState(...args: Parameters<typeof originalPushState>) {
      browserCollector.jsNavigationDetected = true;
      return originalPushState(...args);
    };
    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function patchedReplaceState(...args: Parameters<typeof originalReplaceState>) {
      browserCollector.jsNavigationDetected = true;
      return originalReplaceState(...args);
    };
    const originalAssign = window.location.assign.bind(window.location);
    window.location.assign = function patchedAssign(...args: Parameters<typeof originalAssign>) {
      browserCollector.jsNavigationDetected = true;
      return originalAssign(...args);
    };
    const originalReplace = window.location.replace.bind(window.location);
    window.location.replace = function patchedReplace(...args: Parameters<typeof originalReplace>) {
      browserCollector.jsNavigationDetected = true;
      return originalReplace(...args);
    };

    if (window.crypto?.subtle?.digest) {
      const originalDigest = window.crypto.subtle.digest.bind(window.crypto.subtle);
      window.crypto.subtle.digest = function patchedDigest(...args: Parameters<typeof originalDigest>) {
        collector.identifierShapingDetected = true;
        return originalDigest(...args);
      };
    }

    const originalFetch = window.fetch;
    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      try {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (FINGERPRINT_KEY_RE.test(requestUrl)) {
          collector.identifierShapingDetected = true;
        }
      } catch {}
      return originalFetch.call(this, input, init);
    };

    const FINGERPRINT_KEY_RE = /(?:fingerprint|visitor|device|browser|entropy|canvas|audio|webgl)/i;
  });
}

async function captureFingerprintingCollector(page: Page): Promise<FingerprintingCollectorSnapshot | null> {
  return page
    .evaluate(() => {
      const collector = (window as typeof window & {
        __certscoreFingerprintingCollector__?: {
          categories: Record<string, { firstSeenMs: number | null; hits: number }>;
          eventSamples: Array<{ api: string; category: string; scriptOrigin: "first_party" | "third_party" | "unknown"; tsMs: number }>;
          identifierShapingDetected: boolean;
          knownBotLibraryMatch: string | null;
          knownFingerprintLibraryMatch: string | null;
        };
      }).__certscoreFingerprintingCollector__;

      if (!collector) {
        return null;
      }

      const scriptSources = Array.from(document.querySelectorAll("script[src]"))
        .map((script) => script.getAttribute("src") ?? "")
        .join(" ");

      return {
        categories: Object.entries(collector.categories).map(([name, record]) => ({
          firstSeenMs: record.firstSeenMs,
          hits: record.hits,
          name
        })),
        eventSamples: collector.eventSamples,
        identifierShapingDetected: collector.identifierShapingDetected,
        knownBotLibraryMatch:
          collector.knownBotLibraryMatch ?? inferKnownSignatureMatch(scriptSources, KNOWN_BOT_SCRIPT_SIGNATURES),
        knownFingerprintLibraryMatch:
          collector.knownFingerprintLibraryMatch ?? inferKnownSignatureMatch(scriptSources, KNOWN_FINGERPRINT_SCRIPT_SIGNATURES)
      };
    })
    .catch(() => null);
}

async function captureBrowserCollector(page: Page): Promise<BrowserObservationCollectorSnapshot | null> {
  return page
    .evaluate(() => {
      const collector = (window as typeof window & {
        __certscoreBrowserCollector__?: BrowserObservationCollectorSnapshot;
      }).__certscoreBrowserCollector__;
      if (!collector) {
        return null;
      }
      return {
        consentDismissedWithoutChoice: collector.consentDismissedWithoutChoice,
        firstInteractionMs: collector.firstInteractionMs,
        indexedDbUsed: collector.indexedDbUsed,
        inputListenerRegistrations: collector.inputListenerRegistrations,
        inputProbeRuns: collector.inputProbeRuns,
        jsCookieWrites: collector.jsCookieWrites,
        jsNavigationDetected: collector.jsNavigationDetected,
        localStorageKeys: collector.localStorageKeys,
        localStorageWrites: collector.localStorageWrites,
        popupCount: collector.popupCount,
        sessionStorageKeys: collector.sessionStorageKeys,
        sessionStorageWrites: collector.sessionStorageWrites,
        textInputEventSamples: collector.textInputEventSamples,
        userInteracted: collector.userInteracted
      };
    })
    .catch(() => null);
}

async function capturePageSnapshotSummary(page: Page): Promise<PageSnapshotSummary | null> {
  return page
    .evaluate((selectors) => {
      const adVideoHints = /\b(ad|vast|ima|preroll|midroll|doubleclick|adsystem)\b/i;
      const normalize = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
      const MAX_PRECHECKED_LABELS = 5;
      const parseColor = (value: string) => {
        const normalized = value.trim().toLowerCase();
        if (normalized.startsWith("#")) {
          const hex = normalized.slice(1);
          const expanded =
            hex.length === 3
              ? hex
                  .split("")
                  .map((part) => `${part}${part}`)
                  .join("")
              : hex;
          if (expanded.length !== 6) {
            return null;
          }
          const red = Number.parseInt(expanded.slice(0, 2), 16);
          const green = Number.parseInt(expanded.slice(2, 4), 16);
          const blue = Number.parseInt(expanded.slice(4, 6), 16);
          return Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue) ? { alpha: 1, blue, green, red } : null;
        }
        const match = normalized.match(/rgba?\(([^)]+)\)/);
        if (!match) {
          return null;
        }
        const parts = match[1]?.split(",").map((part) => Number.parseFloat(part.trim())) ?? [];
        if (parts.length < 3) {
          return null;
        }
        return {
          alpha: typeof parts[3] === "number" && Number.isFinite(parts[3]) ? parts[3] : 1,
          blue: parts[2] ?? 0,
          green: parts[1] ?? 0,
          red: parts[0] ?? 0
        };
      };
      const relativeLuminance = (color: { red: number; green: number; blue: number }) => {
        const transform = (channel: number) => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * transform(color.red) + 0.7152 * transform(color.green) + 0.0722 * transform(color.blue);
      };
      const resolveBackgroundColor = (node: HTMLElement | null) => {
        let cursor: HTMLElement | null = node;
        while (cursor) {
          const parsed = parseColor(window.getComputedStyle(cursor).backgroundColor);
          if (parsed && parsed.alpha > 0) {
            return parsed;
          }
          cursor = cursor.parentElement;
        }
        return { alpha: 1, blue: 255, green: 255, red: 255 };
      };
      const contrastRatio = (node: HTMLElement | null) => {
        if (!node) {
          return null;
        }
        const textColor = parseColor(window.getComputedStyle(node).color);
        const backgroundColor = resolveBackgroundColor(node);
        if (!textColor || !backgroundColor) {
          return null;
        }
        const left = relativeLuminance(textColor);
        const right = relativeLuminance(backgroundColor);
        const ratio = (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
        return Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null;
      };
      const labelForControl = (node: Element) => {
        const htmlNode = node instanceof HTMLElement ? node : null;
        const controlId = htmlNode?.id ?? "";
        const explicitLabel =
          (controlId ? document.querySelector(`label[for="${CSS.escape(controlId)}"]`) : null) ??
          htmlNode?.closest("label") ??
          null;
        const text = normalize(
          explicitLabel?.textContent ??
            htmlNode?.getAttribute("aria-label") ??
            htmlNode?.getAttribute("name") ??
            htmlNode?.getAttribute("id") ??
            htmlNode?.textContent ??
            ""
        );
        return text.slice(0, 80);
      };
      const visibleElements = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .filter((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 20 && rect.height > 20;
        });
      const consentRoot = visibleElements[0] ?? null;
      const consentText = normalize(consentRoot?.textContent ?? "").toLowerCase();
      const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .map((node) => {
          const text = normalize(node.textContent ?? "");
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            area: rect.width * rect.height,
            contrastRatio: contrastRatio(node),
            node,
            text,
            visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
          };
        })
        .filter((button) => button.visible);
      const acceptButtons = buttons.filter((button) => /accept|allow|agree|got it/i.test(button.text));
      const rejectButtons = buttons.filter((button) => /reject|decline|deny|no thanks/i.test(button.text));
      const manageButtons = buttons.filter((button) => /manage|preferences|settings|choices/i.test(button.text));
      const closeButtons = buttons.filter((button) => /close|dismiss|x/i.test(button.text));
      const acceptArea = Math.max(...acceptButtons.map((button) => button.area), 0);
      const rejectArea = Math.max(...rejectButtons.map((button) => button.area), 0);
      const acceptButton = acceptButtons.sort((left, right) => right.area - left.area)[0] ?? null;
      const rejectButton = rejectButtons.sort((left, right) => right.area - left.area)[0] ?? null;
      const acceptContrastRatio = acceptButton?.contrastRatio ?? null;
      const rejectContrastRatio = rejectButton?.contrastRatio ?? null;
      const modalDetected = Boolean(consentRoot && (consentRoot.getAttribute("role") === "dialog" || consentRoot.closest("[role='dialog']")));
      const overlayDetected = Boolean(
        Array.from(document.querySelectorAll("div, section, aside"))
          .filter((node): node is HTMLElement => node instanceof HTMLElement)
          .some((node) => {
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.position === "fixed" && Number(style.zIndex || "0") >= 1000 && rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.4;
          })
      );
      const videoNodes = Array.from(document.querySelectorAll("video"));
      const audioNodes = Array.from(document.querySelectorAll("audio"));
      const surfaceType: "banner" | "footer" | "interstitial" | "modal" | "unknown" =
        modalDetected ? "modal" : overlayDetected ? "interstitial" : consentRoot ? "banner" : "unknown";
      const acceptProminence: "high" | "low" | "medium" | "unknown" =
        acceptArea > rejectArea * 1.5 ? "high" : acceptArea > 0 ? "medium" : "unknown";
      const rejectProminence: "high" | "low" | "medium" | "none" | "unknown" =
        rejectButtons.length === 0 ? "none" : rejectArea < acceptArea ? "low" : "medium";
      const precheckedControls = consentRoot
        ? Array.from(
            consentRoot.querySelectorAll(
              'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="switch"], [aria-checked]'
            )
          ).filter((node) => {
            if (node instanceof HTMLInputElement) {
              return node.checked;
            }
            const ariaChecked = node.getAttribute("aria-checked");
            return ariaChecked === "true";
          })
        : [];
      const precheckedCategoryLabels = precheckedControls
        .map((node) => labelForControl(node))
        .filter((value) => value.length > 0)
        .slice(0, MAX_PRECHECKED_LABELS);
      const clicksToAccept = acceptButtons.length > 0 ? 1 : null;
      const clicksToReject = rejectButtons.length > 0 ? 1 : manageButtons.length > 0 ? 2 : null;
      const cookieWallDetected =
        Boolean(consentRoot) &&
        overlayDetected &&
        (rejectButtons.length === 0 || manageButtons.length > 0) &&
        (acceptButtons.length > 0 || manageButtons.length > 0);
      const allMedia = [...videoNodes, ...audioNodes];
      const firstAutoplay = allMedia
        .map((media) => {
          const attr = media.getAttribute("data-certscore-first-play-ms");
          const parsed = attr ? Number(attr) : null;
          return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
        })
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)[0] ?? null;
      const thirdPartyEmbedCount = Array.from(document.querySelectorAll("iframe"))
        .map((frame) => frame.getAttribute("src"))
        .filter((src): src is string => Boolean(src))
        .filter((src) => {
          try {
            return new URL(src, location.href).hostname !== location.hostname;
          } catch {
            return false;
          }
        }).length;

      return {
        consent: {
          acceptPresent: acceptButtons.length > 0,
          bannerPresent: Boolean(consentRoot) && /cookie|consent|privacy|tracking|preferences/.test(consentText),
          clicksToAccept,
          clicksToReject,
          closePresent: closeButtons.length > 0,
          cmpDetected: Boolean(consentRoot),
          contentObstructed: overlayDetected,
          cookieWallDetected: consentRoot ? cookieWallDetected : null,
          firstVisibleMs: null,
          managePresent: manageButtons.length > 0,
          pageInteractionBlocked: overlayDetected,
          precheckedCategoryCount: consentRoot ? precheckedControls.length : null,
          precheckedCategoryLabels,
          rejectPresent: rejectButtons.length > 0,
          rejectRequiresMoreClicks:
            clicksToAccept !== null && clicksToReject !== null ? clicksToReject > clicksToAccept : manageButtons.length > 0 ? true : null,
          secondLayerPresent: manageButtons.length > 0,
          surfaceType
        },
        consentVisual: {
          acceptOnly: acceptButtons.length > 0 && rejectButtons.length === 0 ? true : null,
          acceptContrastRatio,
          acceptProminence,
          contrastAsymmetryDetected:
            acceptContrastRatio !== null && rejectContrastRatio !== null ? acceptContrastRatio - rejectContrastRatio >= 1.5 : null,
          ctaImbalanceDetected: acceptArea > rejectArea * 1.5 && rejectArea > 0 ? true : null,
          rejectHidden: rejectButtons.length === 0 && manageButtons.length > 0 ? true : null,
          rejectContrastRatio,
          rejectLowContrast: rejectContrastRatio !== null ? rejectContrastRatio < 4.5 : null,
          rejectProminence
        },
        media: {
          adVideoUnitDetected: Array.from(document.querySelectorAll("video, iframe")).some((node) =>
            adVideoHints.test((node.getAttribute("src") ?? node.getAttribute("class") ?? node.id ?? "").toLowerCase())
          ),
          audioPresent: audioNodes.length > 0,
          autoplayAttrAudioCount: audioNodes.filter((node) => node.autoplay).length,
          autoplayAttrVideoCount: videoNodes.filter((node) => node.autoplay).length,
          autoplayAudioObserved: audioNodes.some((node) => !node.paused && node.currentTime > 0),
          autoplayVideoObserved: videoNodes.some((node) => !node.paused && node.currentTime > 0),
          firstAutoplayMs: firstAutoplay,
          mutedAutoplayVideo: videoNodes.some((node) => node.autoplay && node.muted) ? true : null,
          thirdPartyEmbedCount,
          videoPresent: videoNodes.length > 0
        },
        navigation: {
          metaRefreshDetected: Array.from(document.querySelectorAll("meta[http-equiv]")).some((node) => /refresh/i.test(node.getAttribute("http-equiv") ?? ""))
        },
        ui: {
          dismissalPresent: closeButtons.length > 0 || rejectButtons.length > 0,
          forcedActionRequired: overlayDetected && rejectButtons.length === 0,
          fullScreenTakeover: overlayDetected,
          interstitialDetected: overlayDetected && /wait|continue|redirect|verify/.test(consentText),
          modalDetected,
          overlayDetected,
          repeatedResurfacing: null,
          scrollLocked: /hidden/.test(document.body ? window.getComputedStyle(document.body).overflowY : ""),
          stickyTakeoverDetected: Array.from(document.querySelectorAll("header, footer, aside, div"))
            .filter((node): node is HTMLElement => node instanceof HTMLElement)
            .some((node) => {
              const style = window.getComputedStyle(node);
              return style.position === "sticky" || style.position === "fixed";
            })
        }
      };
    }, CONSENT_ROOT_SELECTORS)
    .catch(() => null);
}

async function withDeadline<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  task.catch(() => undefined);
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label} deadline exceeded after ${ms} ms`)), ms);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function detectConsentUi(page: Page): Promise<ConsentUiSummary> {
  const payload = await page
    .evaluate((selectors) => {
      const normalize = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
      const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
      const visible = nodes.find((node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 20 && rect.height > 20;
      });

      const text = normalize(visible?.textContent ?? "");
      const buttons = Array.from(document.querySelectorAll("button, [role='button'], a")).map((node) => normalize(node.textContent ?? ""));
      return {
        acceptPresent: buttons.some((textValue) => /accept|allow|agree|got it/i.test(textValue)),
        detected: Boolean(visible && /cookie|consent|privacy|tracking|preferences/i.test(text)),
        managePresent: buttons.some((textValue) => /manage|preferences|settings|choices/i.test(textValue)),
        rejectPresent: buttons.some((textValue) => /reject|decline|no thanks|deny/i.test(textValue)),
        selectorHint: visible ? visible.tagName.toLowerCase() : null,
        textSnippet: text.slice(0, 240)
      };
    }, CONSENT_ROOT_SELECTORS)
    .catch(() => null);

  if (!payload) {
    return {
      acceptPresent: false,
      detected: false,
      firstDetectedTimestampMs: null,
      managePresent: false,
      rejectPresent: false,
      selectorHint: null,
      textSnippet: null
    };
  }

  return {
    ...payload,
    firstDetectedTimestampMs: null
  };
}

async function clickFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      continue;
    }
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.click({ timeout: 2_000 }).catch(() => undefined);
    return true;
  }
  return false;
}

async function maybeRunKeyloggingProbe(page: Page, harness: RuntimeHarnessContext) {
  const probeSelector = 'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="tel"], textarea, [contenteditable="true"]';
  const probeText = "certscore probe text";
  const candidates = await page.locator(probeSelector).elementHandles().catch(() => []);

  for (const handle of candidates.slice(0, 3)) {
    const metadata = await handle
      .evaluate((node, typedCharCount) => {
        if (!(node instanceof HTMLElement)) {
          return null;
        }
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const ariaHidden = node.getAttribute("aria-hidden") === "true";
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 8 &&
          rect.height > 8 &&
          !ariaHidden;
        if (!isVisible) {
          return null;
        }
        if (node instanceof HTMLInputElement) {
          const type = (node.type || "text").toLowerCase();
          if (["hidden", "password", "checkbox", "radio", "submit", "button", "file"].includes(type) || node.disabled || node.readOnly) {
            return null;
          }
          return { fieldTag: "input", fieldType: type, targetKind: "input" as const, typedCharCount };
        }
        if (node instanceof HTMLTextAreaElement) {
          if (node.disabled || node.readOnly) {
            return null;
          }
          return { fieldTag: "textarea", fieldType: null, targetKind: "textarea" as const, typedCharCount };
        }
        if (node.isContentEditable) {
          return { fieldTag: node.tagName.toLowerCase(), fieldType: null, targetKind: "contenteditable" as const, typedCharCount };
        }
        return null;
      }, probeText.length)
      .catch(() => null);

    if (!metadata) {
      continue;
    }

    try {
      await handle.scrollIntoViewIfNeeded().catch(() => undefined);
      await handle.click({ timeout: 1_500 }).catch(() => undefined);
      await page.evaluate((meta) => {
        const collector = (window as typeof window & {
          __certscoreBrowserCollector__?: {
            startInputProbe(meta: {
              fieldTag: string;
              fieldType: string | null;
              targetKind: "contenteditable" | "input" | "textarea";
              typedCharCount: number;
            }): void;
          };
        }).__certscoreBrowserCollector__;
        collector?.startInputProbe(meta);
      }, metadata);
      await page.keyboard.type(probeText, { delay: 45 });
      await page.waitForTimeout(900);
      const valueLength = await handle
        .evaluate((node) => {
          if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
            return node.value.length;
          }
          if (node instanceof HTMLElement && node.isContentEditable) {
            return node.innerText.length;
          }
          return null;
        })
        .catch(() => null);
      await page.evaluate((value) => {
        const collector = (window as typeof window & {
          __certscoreBrowserCollector__?: {
            finishInputProbe(meta?: { valueLength?: number | null }): void;
          };
        }).__certscoreBrowserCollector__;
        collector?.finishInputProbe({ valueLength: value });
      }, valueLength);
      harness.addConsoleMessage({
        level: "debug",
        text: `Keylogging probe executed on ${metadata.fieldTag}${metadata.fieldType ? `:${metadata.fieldType}` : ""}.`
      });
      break;
    } catch {}
  }
}

function cookieToRecord(cookie: Awaited<ReturnType<BrowserContext["cookies"]>>[number]): CookieRecord {
  return {
    domain: cookie.domain,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    name: cookie.name,
    path: cookie.path,
    sameSite: cookie.sameSite ?? null,
    secure: cookie.secure,
    valuePreview: cookie.value.slice(0, 120)
  };
}

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

abstract class BasePlaywrightRuntime implements UnifiedRuntime {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected navigationResponse: Response | null = null;
  protected consentUiFirstSeenMs: number | null = null;

  constructor(protected readonly harness: RuntimeHarnessContext, protected readonly options: RuntimeOptions) {}

  protected abstract createBrowserContext(): Promise<{ browser: Browser; context: BrowserContext }>;

  protected browserContextOptions() {
    return {
      ignoreHTTPSErrors: true,
      locale: "en-US",
      userAgent:
        this.options.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1600 }
    };
  }

  async init() {
    const created = await this.createBrowserContext();
    this.browser = created.browser;
    this.context = created.context;
    await installFingerprintingCollector(this.context);
    this.page = await this.context.newPage();

    this.page.on("domcontentloaded", () => {
      this.harness.markDomContentLoaded();
    });
    this.page.on("console", (message: ConsoleMessage) => {
      const type = message.type();
      this.harness.addConsoleMessage({
        level:
          type === "warning"
            ? "warning"
            : type === "error"
              ? "error"
              : type === "debug"
                ? "debug"
                : type === "info"
                  ? "info"
                  : "log",
        text: message.text()
      });
    });
    this.page.on("pageerror", (error: Error) => {
      this.harness.addPageError({
        message: error.message,
        stack: error.stack ?? null
      });
    });
    this.page.on("request", (request: Request) => {
      this.harness.addRequest({
        frameUrl: request.frame()?.url() ?? null,
        id: request.url(),
        initiatorType: request.isNavigationRequest() ? "navigation" : request.resourceType(),
        initiatorUrl: request.frame()?.url() ?? null,
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url()
      });
      const redirectedFrom = request.redirectedFrom();
      if (redirectedFrom) {
        this.harness.addRedirect({
          from: redirectedFrom.url(),
          status: null,
          to: request.url()
        });
      }
    });
    this.page.on("response", async (response: Response) => {
      const headers = await response.allHeaders().catch(() => null);
      const setCookieHeaders = await response
        .headersArray()
        .then((items) => items.filter((entry: { name: string; value: string }) => entry.name.toLowerCase() === "set-cookie").map((entry: { name: string; value: string }) => entry.value))
        .catch(() => null);

      this.harness.addResponse({
        frameUrl: response.frame()?.url() ?? null,
        headers,
        requestId: response.request().url(),
        resourceType: response.request().resourceType(),
        setCookieHeaders,
        status: response.status(),
        url: response.url()
      });

      if (this.navigationResponse === response || response.request().resourceType() === "document") {
        this.harness.markMainDocument({
          headers,
          setCookieHeaders,
          status: response.status(),
          url: response.url()
        });
      }
    });
  }

  async navigate(url: string) {
    if (!this.page) {
      throw new Error("Runtime page not initialized.");
    }

    try {
      const firstResponseCapMs = Math.min(this.options.timeoutMs, FIRST_MAIN_DOCUMENT_RESPONSE_CAP_MS);
      this.navigationResponse = await withDeadline(
        this.page.goto(url, {
          timeout: firstResponseCapMs,
          waitUntil: "commit"
        }),
        firstResponseCapMs,
        "main document response"
      );
      if (this.navigationResponse) {
        const headers = await this.navigationResponse.allHeaders().catch(() => null);
        const setCookieHeaders = await this.navigationResponse
          .headersArray()
          .then((items) => items.filter((entry: { name: string; value: string }) => entry.name.toLowerCase() === "set-cookie").map((entry: { name: string; value: string }) => entry.value))
          .catch(() => null);
        this.harness.markMainDocument({
          headers,
          setCookieHeaders,
          status: this.navigationResponse.status(),
          url: this.navigationResponse.url()
        });
      }

      try {
        const domCapMs = Math.min(this.options.timeoutMs, DOM_CONTENT_LOADED_CAP_MS);
        await withDeadline(
          this.page.waitForLoadState("domcontentloaded", {
            timeout: domCapMs
          }),
          domCapMs,
          "domcontentloaded"
        );
        this.harness.markNavigationOutcome("ok");
      } catch (error) {
        await this.page.evaluate(() => window.stop()).catch(() => undefined);
        this.harness.markNavigationOutcome("timeout");
        this.harness.addError(`DOMContentLoaded stalled: ${error instanceof Error ? error.message : String(error)}`);
        this.harness.markStopSummary({
          detail: `DOMContentLoaded did not fire within ${Math.min(this.options.timeoutMs, DOM_CONTENT_LOADED_CAP_MS)} ms.`,
          reason: "stalled_dom_content_loaded",
          timestampMs: this.harness.timeSinceStart()
        });
      }

      this.harness.markFinalUrl(this.page.url());
      this.harness.markTitle(await this.page.title().catch(() => null));
    } catch (error) {
      const timedOut = error instanceof Error && /timeout/i.test(error.message);
      if (timedOut) {
        await this.page.evaluate(() => window.stop()).catch(() => undefined);
      }
      this.harness.markNavigationOutcome(timedOut ? "timeout" : "error");
      this.harness.addError(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
      this.harness.markStopSummary({
        detail: timedOut
          ? `Main document response did not arrive within ${Math.min(this.options.timeoutMs, FIRST_MAIN_DOCUMENT_RESPONSE_CAP_MS)} ms.`
          : `Navigation failed before a usable main document response: ${error instanceof Error ? error.message : String(error)}`,
        reason: timedOut ? "stalled_main_document_response" : "navigation_error",
        timestampMs: this.harness.timeSinceStart()
      });
      this.harness.markFinalUrl(this.page.url());
    }
  }

  async observe(ms: number) {
    if (!this.page || !this.context) {
      throw new Error("Runtime not initialized.");
    }

    const checkpointHandles: NodeJS.Timeout[] = [];
    const seenCookieKeys = new Set<string>();
    const seenMatchedVendors = new Set<string>();
    const requestedHost = hostnameFromUrl(this.harness.requestedUrl);
    let lastNewCookieMs: number | null = null;
    let lastNewMatchedVendorMs: number | null = null;
    let lastAdOrAnalyticsRequestMs: number | null = null;
    let blockedLikeSinceMs: number | null = null;
    let currentCookieCount = 0;
    let requestCursor = 0;
    let sawThirdPartyRequest = false;

    const hasSuccessfulDocument = () =>
      this.harness.artifacts.responses.some((response) => response.resourceType === "document" && response.status === 200) ||
      this.harness.artifacts.mainDocument.status === 200;

    const updateRequestSignals = () => {
      const requests = this.harness.artifacts.requests;
      while (requestCursor < requests.length) {
        const request = requests[requestCursor];
        requestCursor += 1;
        if (!request) {
          continue;
        }
        const hostname = hostnameFromUrl(request.url);
        if (!hostname || !requestedHost) {
          continue;
        }
        const isThirdParty = hostname !== requestedHost && !hostname.endsWith(`.${requestedHost}`);
        if (!isThirdParty) {
          continue;
        }
        sawThirdPartyRequest = true;
        if (CHALLENGE_HOST_PATTERNS.test(hostname) && blockedLikeSinceMs === null) {
          blockedLikeSinceMs = request.timestampMs;
        }
        const vendorMatch = matchUrlToVendor(request.url);
        if (!vendorMatch) {
          continue;
        }
        if (!seenMatchedVendors.has(vendorMatch.name)) {
          seenMatchedVendors.add(vendorMatch.name);
          lastNewMatchedVendorMs = request.timestampMs;
        }
        if (vendorMatch.category === "advertising" || vendorMatch.category === "analytics") {
          lastAdOrAnalyticsRequestMs = request.timestampMs;
        }
      }
    };

    const updateCookieSignals = async () => {
      const cookies = await this.context?.cookies().catch(() => []) ?? [];
      currentCookieCount = cookies.length;
      const now = this.harness.timeSinceStart();
      for (const cookie of cookies) {
        const key = `${cookie.domain}:${cookie.name}`;
        if (seenCookieKeys.has(key)) {
          continue;
        }
        seenCookieKeys.add(key);
        lastNewCookieMs = now;
      }
      return cookies;
    };

    const pollConsentUi = async () => {
      const summary = await detectConsentUi(this.page as Page).catch(() => null);
      if (!summary?.detected) {
        return;
      }
      if (this.consentUiFirstSeenMs === null) {
        this.consentUiFirstSeenMs = this.harness.timeSinceStart();
      }
      this.harness.markConsentUi({
        ...summary,
        firstDetectedTimestampMs: this.consentUiFirstSeenMs
      });
    };

    for (const checkpoint of cookieCheckpointsWithin(ms)) {
      const handle = setTimeout(async () => {
        if (!this.context) {
          return;
        }
        const cookies = await this.context.cookies().catch(() => []);
        this.harness.addCookieSnapshot(checkpoint.label, cookies.map(cookieToRecord));
      }, checkpoint.ms);
      checkpointHandles.push(handle);
    }

    const observeStartedAt = this.harness.timeSinceStart();
    let effectiveObserveMs = ms;
    let stopLogged = false;

    if (["stalled_main_document_response", "stalled_dom_content_loaded"].includes(this.harness.artifacts.stopSummary.reason)) {
      return;
    }

    while (this.harness.timeSinceStart() - observeStartedAt < effectiveObserveMs) {
      await this.page.waitForTimeout(STOP_POLL_INTERVAL_MS);
      await pollConsentUi();
      await updateCookieSignals();
      updateRequestSignals();
      this.harness.markTitle(await this.page.title().catch(() => this.harness.artifacts.title));

      const now = this.harness.timeSinceStart();
      if (now >= this.options.timeoutMs) {
        stopLogged = true;
        this.harness.markStopSummary({
          detail: `Runtime hit internal wall-time cap at ${this.options.timeoutMs} ms.`,
          reason: "runtime_wall_time_cap",
          timestampMs: now
        });
        break;
      }
      const currentTitle = this.harness.artifacts.title ?? "";
      const blockedMainStatus = this.harness.artifacts.mainDocument.status;
      const blockedByStatus = blockedMainStatus !== null && [401, 403, 429, 503].includes(blockedMainStatus);
      const blockedByTitle = CHALLENGE_TITLE_PATTERNS.test(currentTitle);
      const currentThirdPartyDomainCount = requestedHost
        ? new Set(
            this.harness.artifacts.requests
              .map((request) => hostnameFromUrl(request.url))
              .filter((hostname): hostname is string => Boolean(hostname))
              .filter((hostname) => hostname !== requestedHost && !hostname.endsWith(`.${requestedHost}`))
          ).size
        : 0;
      if ((blockedByStatus || blockedByTitle) && blockedLikeSinceMs === null) {
        blockedLikeSinceMs = now;
      }
      const quietForMatchedVendors = lastNewMatchedVendorMs !== null && now - lastNewMatchedVendorMs >= STOP_QUIET_WINDOW_MS;
      const quietForCookies = lastNewCookieMs !== null && now - lastNewCookieMs >= STOP_QUIET_WINDOW_MS;
      const quietForAdOrAnalytics = lastAdOrAnalyticsRequestMs !== null && now - lastAdOrAnalyticsRequestMs >= STOP_QUIET_WINDOW_MS;
      const domLoadedAt = this.harness.artifacts.domContentLoadedTimestampMs;
      const noMeaningfulPostDomSignal =
        domLoadedAt !== null &&
        now - domLoadedAt >= POST_DOM_NO_SIGNAL_CAP_MS &&
        !this.harness.artifacts.title &&
        this.harness.artifacts.responses.length === 0 &&
        !sawThirdPartyRequest &&
        lastNewCookieMs === null;

      if (hasSuccessfulDocument() && sawThirdPartyRequest && quietForMatchedVendors && quietForCookies && quietForAdOrAnalytics) {
        if (!stopLogged) {
          stopLogged = true;
          this.harness.markStopSummary({
            detail: `No new matched vendor, cookie, or ad/analytics request for ${STOP_QUIET_WINDOW_MS} ms after reaching document 200 and third-party activity.`,
            reason: "adaptive_stabilization",
            timestampMs: now
          });
          this.harness.logger.log(
            `[${this.harness.runtimeMode}] adaptive stop after signal stabilization (${STOP_QUIET_WINDOW_MS} ms quiet window)`
          );
        }
        break;
      }

      if (noMeaningfulPostDomSignal) {
        stopLogged = true;
        this.harness.markStopSummary({
          detail: `No meaningful signal appeared within ${POST_DOM_NO_SIGNAL_CAP_MS} ms after DOMContentLoaded.`,
          reason: "stalled_post_dom_no_signal",
          timestampMs: now
        });
        break;
      }

      const cdpBlockedAndStable =
        this.harness.runtimeMode !== "playwright-local" &&
        blockedLikeSinceMs !== null &&
        now - blockedLikeSinceMs >= CDP_BLOCKED_MIN_DWELL_MS &&
        (blockedByStatus || blockedByTitle) &&
        currentThirdPartyDomainCount <= 2 &&
        seenMatchedVendors.size === 0 &&
        (lastNewCookieMs === null || now - lastNewCookieMs >= STOP_QUIET_WINDOW_MS) &&
        (lastAdOrAnalyticsRequestMs === null || now - lastAdOrAnalyticsRequestMs >= STOP_QUIET_WINDOW_MS);

      if (cdpBlockedAndStable) {
        if (!stopLogged) {
          stopLogged = true;
          this.harness.markStopSummary({
            detail: `Blocked/challenge-like CDP run stayed low-signal for ${CDP_BLOCKED_MIN_DWELL_MS} ms; ending early after quiet window.`,
            reason: "cdp_blocked_stabilization",
            timestampMs: now
          });
          this.harness.logger.log(
            `[${this.harness.runtimeMode}] early stop on blocked/challenge CDP run after ${CDP_BLOCKED_MIN_DWELL_MS} ms dwell`
          );
        }
        break;
      }
    }

    if (!stopLogged) {
      this.harness.markStopSummary({
        detail: `Observe window elapsed after ${ms} ms without adaptive stabilization stop.`,
        reason: "observe_window_elapsed",
        timestampMs: this.harness.timeSinceStart()
      });
    }

    if (this.harness.timeSinceStart() < this.options.timeoutMs - 1_500) {
      await maybeRunKeyloggingProbe(this.page, this.harness).catch(() => undefined);
    }

    for (const handle of checkpointHandles) {
      clearTimeout(handle);
    }
  }

  async snapshot(): Promise<RuntimeRunResult> {
    if (!this.page || !this.context) {
      throw new Error("Runtime not initialized.");
    }

    await mkdir(this.harness.outputDir, { recursive: true });
    const htmlPath = path.join(this.harness.outputDir, "page.html");
    const screenshotPath = path.join(this.harness.outputDir, "page.png");

    const html = await this.page.content().catch(() => null);
    if (html !== null) {
      await writeSupportFile(htmlPath, html);
      this.harness.noteHtmlSnapshotPath(htmlPath);
    } else {
      this.harness.noteHtmlSnapshotPath(null);
    }

    await this.page.screenshot({ fullPage: true, path: screenshotPath }).catch((error: unknown) => {
      this.harness.addError(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.harness.noteScreenshotPath(screenshotPath);

    const [title, currentUrl, bodyText, finalCookies, browserCollector, fingerprintingCollector, pageSnapshotSummary] = await Promise.all([
      this.page.title().catch(() => null),
      Promise.resolve(this.page.url()),
      this.page
        .locator("body")
        .innerText()
        .then((text: string) => text.slice(0, 10_240))
        .catch(() => null),
      this.context.cookies().catch(() => []),
      captureBrowserCollector(this.page),
      captureFingerprintingCollector(this.page),
      capturePageSnapshotSummary(this.page)
    ]);

    this.harness.markTitle(title);
    this.harness.markFinalUrl(currentUrl);
    this.harness.markBrowserCollector(browserCollector);
    this.harness.markFingerprintingCollector(fingerprintingCollector);
    this.harness.noteBodyTextExcerpt(bodyText);
    this.harness.notePageSnapshotSummary(pageSnapshotSummary);
    this.harness.addCookieSnapshot("final", finalCookies.map(cookieToRecord));
    this.harness.markPreConsentTimeline(
      buildPreConsentTimeline({
        consentUi: this.harness.artifacts.consentUi,
        requests: this.harness.artifacts.requests,
        requestedUrl: this.harness.requestedUrl
      })
    );
    this.harness.markLeakMap(buildLeakMap({ requestedUrl: this.harness.requestedUrl, requests: this.harness.artifacts.requests }));
    this.harness.markCnameCloaking(await detectCnameCloaking({ requestedUrl: this.harness.requestedUrl, requests: this.harness.artifacts.requests }));

    const rejectSummary = await this.capturePostRejectPersistence();
    this.harness.markPostRejectPersistence(rejectSummary);

    const result = finalizeResult({
      artifacts: this.harness.artifacts,
      bodyTextExcerpt: bodyText,
      finalUrl: currentUrl,
      htmlSnapshotPath: html !== null ? htmlPath : null,
      requestedUrl: this.harness.requestedUrl,
      runtimeMode: this.harness.runtimeMode,
      runtimeOptions: this.harness.runtimeOptions,
      runtimeStartedAt: this.harness.runtimeStartedAt,
      screenshotPath,
      title,
      wallTimeMs: this.harness.timeSinceStart()
    });
    if (result.classification.challengeDetected) {
      this.harness.logger.log(`[${this.harness.runtimeMode}] challenge suspected ${result.classification.stopReason}`);
    }
    this.harness.logger.log(`[${this.harness.runtimeMode}] observation window ended`);
    return { ...result, outputDir: this.harness.outputDir };
  }

  protected async capturePostRejectPersistence() {
    if (!this.page || !this.context) {
      return null;
    }

    const summary = await detectConsentUi(this.page);
    if (!summary.detected) {
      return {
        attempted: false,
        newThirdPartyRequestsAfterReject: 0,
        observedRejectTimestampMs: null,
        persistedVendors: [],
        rejectFound: false,
        rejectWorked: false,
        thirdPartyRequestsAfterReject: 0
      };
    }

    const rejectFound = summary.rejectPresent;
    if (!rejectFound) {
      return {
        attempted: false,
        newThirdPartyRequestsAfterReject: 0,
        observedRejectTimestampMs: null,
        persistedVendors: [],
        rejectFound: false,
        rejectWorked: false,
        thirdPartyRequestsAfterReject: 0
      };
    }

    const requestCutoff = this.harness.artifacts.requests.length;
    const clicked = await clickFirstVisible(this.page, REJECT_SELECTORS);
    if (!clicked) {
      return {
        attempted: true,
        newThirdPartyRequestsAfterReject: 0,
        observedRejectTimestampMs: null,
        persistedVendors: [],
        rejectFound: true,
        rejectWorked: false,
        thirdPartyRequestsAfterReject: 0
      };
    }

    const rejectTimestampMs = this.harness.timeSinceStart();
    await this.page.waitForTimeout(2_000);
    const postRejectRequests = this.harness.artifacts.requests.slice(requestCutoff);
    const persistedVendors = getPersistedVendorsAfterReject({
      postRejectRequests,
      preRejectRequests: this.harness.artifacts.requests.slice(0, requestCutoff),
      requestedUrl: this.harness.requestedUrl
    });
    const thirdPartyAfterReject = buildPreConsentTimeline({
      consentUi: this.harness.artifacts.consentUi,
      requests: postRejectRequests,
      requestedUrl: this.harness.requestedUrl
    });

    return {
      attempted: true,
      newThirdPartyRequestsAfterReject: thirdPartyAfterReject.length,
      observedRejectTimestampMs: rejectTimestampMs,
      persistedVendors,
      rejectFound: true,
      rejectWorked: true,
      thirdPartyRequestsAfterReject: thirdPartyAfterReject.length
    };
  }

  async close() {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }
}

export class PlaywrightLocalRuntime extends BasePlaywrightRuntime {
  protected async createBrowserContext() {
    const browser = await chromium.launch({
      headless: true
    });
    const context = await browser.newContext(this.browserContextOptions());
    return { browser, context };
  }
}
