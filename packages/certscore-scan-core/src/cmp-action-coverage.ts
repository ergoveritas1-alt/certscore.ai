import { createHash } from "node:crypto";
import { classifyConsentControlLabel } from "@certscore/contracts";
import {
  KNOWN_CMP_REGISTRY,
  detectKnownCmps,
  getKnownCmpActionCapability,
} from "@website-signal-risk-scanner/shared";
import type { BrowserContext, Page } from "playwright";
import { cmpActionRecipeEnabled } from "./cmp-action-recipe-policy.js";

export type CmpActionCoverageDiagnostic = {
  action: "accept" | "reject";
  detectedCmpNames: string[];
  fingerprintSha256: string;
  limitation: string;
  status:
    | "recognized_recipe_not_resolved"
    | "recognized_recipe_disabled"
    | "recognized_recipe_unavailable"
    | "unregistered_cmp_candidate"
    | "no_cmp_evidence";
};

type PageProbe = {
  controlLabels: Array<{ ariaLabel?: string; label?: string; title?: string; value?: string }>;
  domSelectors: string[];
  globals: string[];
  iframeUrls: string[];
  localStorageKeys: string[];
  scriptUrls: string[];
  sessionStorageKeys: string[];
};

function boundedSorted(values: Iterable<string>, maximum = 48) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, maximum);
}

function safeUrlFingerprint(urls: string[]) {
  return boundedSorted(urls.flatMap((value) => {
    try {
      const parsed = new URL(value);
      const pathHash = createHash("sha256").update(parsed.pathname).digest("hex").slice(0, 12);
      return [`${parsed.hostname.toLowerCase()}:${pathHash}`];
    } catch {
      return [];
    }
  }));
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeCmpToken(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
}

export async function diagnoseCmpActionCoverage(input: {
  action: "accept" | "reject";
  context: BrowserContext;
  page: Page;
}): Promise<CmpActionCoverageDiagnostic> {
  const selectors = boundedSorted(KNOWN_CMP_REGISTRY.flatMap((definition) =>
    definition.domSelectors ?? []
  ), 160);
  const globals = boundedSorted(KNOWN_CMP_REGISTRY.flatMap((definition) =>
    definition.globalNames ?? []
  ), 120);
  const probe = await input.page.evaluate(({ selectors, globals }): PageProbe => {
    const domSelectors = selectors.filter((selector) => {
      try {
        return Boolean(document.querySelector(selector));
      } catch {
        return false;
      }
    });
    const detectedGlobals = globals.filter((name) => {
      try {
        return name.split(".").every((part, index, parts) => {
          const parent = parts.slice(0, index).reduce<unknown>((value, key) =>
            value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
          window as unknown);
          return parent && typeof parent === "object" && part in (parent as Record<string, unknown>);
        });
      } catch {
        return false;
      }
    });
    const controlLabels = Array.from(document.querySelectorAll(
      "button, [role='button'], input[type='button'], input[type='submit'], a[href]",
    )).slice(0, 80).map((element) => ({
      label: element.textContent?.trim().slice(0, 160),
      ariaLabel: element.getAttribute("aria-label")?.slice(0, 160) || undefined,
      title: element.getAttribute("title")?.slice(0, 160) || undefined,
      value: element instanceof HTMLInputElement ? element.value.slice(0, 160) : undefined,
    }));
    const localStorageKeys: string[] = [];
    const sessionStorageKeys: string[] = [];
    try {
      for (let index = 0; index < Math.min(localStorage.length, 80); index += 1) {
        const key = localStorage.key(index);
        if (key) localStorageKeys.push(key.slice(0, 160));
      }
    } catch {
      // The caller retains availability only through the resulting fingerprint.
    }
    try {
      for (let index = 0; index < Math.min(sessionStorage.length, 80); index += 1) {
        const key = sessionStorage.key(index);
        if (key) sessionStorageKeys.push(key.slice(0, 160));
      }
    } catch {
      // The caller retains availability only through the resulting fingerprint.
    }
    return {
      controlLabels,
      domSelectors,
      globals: detectedGlobals,
      iframeUrls: Array.from(document.querySelectorAll("iframe[src]"))
        .slice(0, 48)
        .map((element) => (element as HTMLIFrameElement).src),
      localStorageKeys,
      scriptUrls: Array.from(document.scripts).slice(0, 80).map((script) => script.src).filter(Boolean),
      sessionStorageKeys,
    };
  }, { selectors, globals }).catch(async (): Promise<PageProbe> =>
    input.page.evaluate((fallbackSelectors): PageProbe => ({
      controlLabels: [],
      domSelectors: fallbackSelectors.filter((selector) => {
        try {
          return Boolean(document.querySelector(selector));
        } catch {
          return false;
        }
      }),
      globals: [],
      iframeUrls: Array.from(document.querySelectorAll("iframe[src]"))
        .slice(0, 48)
        .map((element) => (element as HTMLIFrameElement).src),
      localStorageKeys: [],
      scriptUrls: Array.from(document.scripts).slice(0, 80).map((script) => script.src).filter(Boolean),
      sessionStorageKeys: [],
    }), selectors).catch((): PageProbe => ({
      controlLabels: [],
      domSelectors: [],
      globals: [],
      iframeUrls: [],
      localStorageKeys: [],
      scriptUrls: [],
      sessionStorageKeys: [],
    }))
  );
  const cookies = await input.context.cookies().catch(() => []);
  const cookieNames = boundedSorted(cookies.map((cookie) => cookie.name));
  const urls = boundedSorted([...probe.scriptUrls, ...probe.iframeUrls], 128);
  const detections = detectKnownCmps({
    cookieNames,
    domSelectors: probe.domSelectors,
    iframeUrls: probe.iframeUrls,
    jsGlobals: probe.globals,
    storageKeys: boundedSorted([...probe.localStorageKeys, ...probe.sessionStorageKeys]),
    urls,
  });
  const intents = boundedSorted(probe.controlLabels.map((label) =>
    classifyConsentControlLabel(label).intent
  ).filter((intent) => intent !== "unknown"));
  const detectedCmpNames = boundedSorted(detections.map((detection) => detection.canonicalName), 8);
  const fingerprintSha256 = fingerprint({
    cookieNames,
    domSelectors: probe.domSelectors,
    globals: probe.globals,
    intents,
    storageKeys: boundedSorted([...probe.localStorageKeys, ...probe.sessionStorageKeys]),
    urlFingerprints: safeUrlFingerprint(urls),
  });
  const fingerprintToken = fingerprintSha256.slice(0, 16);

  if (detectedCmpNames.length > 0) {
    const capabilities = detectedCmpNames.map((canonicalName) => ({
      capability: getKnownCmpActionCapability(canonicalName, input.action)!,
      enabled: cmpActionRecipeEnabled({ canonicalName, action: input.action }),
    }));
    const enabledRecipe = capabilities.find(({ capability, enabled }) =>
      capability.recipeAvailable && enabled
    );
    if (enabledRecipe) {
      const cmp = safeCmpToken(enabledRecipe.capability.canonicalName);
      return {
        action: input.action,
        detectedCmpNames,
        fingerprintSha256,
        status: "recognized_recipe_not_resolved",
        limitation: `cmp_action_coverage:${input.action}:recognized_recipe_not_resolved:${cmp}:${fingerprintToken}`,
      };
    }
    const disabledRecipe = capabilities.find(({ capability, enabled }) =>
      capability.recipeAvailable && !enabled
    );
    if (disabledRecipe) {
      const cmp = safeCmpToken(disabledRecipe.capability.canonicalName);
      return {
        action: input.action,
        detectedCmpNames,
        fingerprintSha256,
        status: "recognized_recipe_disabled",
        limitation: `cmp_action_coverage:${input.action}:recognized_recipe_disabled:${cmp}:${fingerprintToken}`,
      };
    }
    const unsupported = capabilities[0]!.capability;
    const cmp = safeCmpToken(unsupported.canonicalName);
    return {
      action: input.action,
      detectedCmpNames,
      fingerprintSha256,
      status: "recognized_recipe_unavailable",
      limitation: `cmp_action_coverage:${input.action}:recognized_recipe_unavailable:${cmp}:${unsupported.unsupportedReason ?? "unknown"}:${fingerprintToken}`,
    };
  }

  if (intents.includes(input.action) || (intents.includes("options") && intents.length >= 2)) {
    return {
      action: input.action,
      detectedCmpNames,
      fingerprintSha256,
      status: "unregistered_cmp_candidate",
      limitation: `cmp_action_coverage:${input.action}:unregistered_cmp_candidate:${fingerprintToken}`,
    };
  }
  return {
    action: input.action,
    detectedCmpNames,
    fingerprintSha256,
    status: "no_cmp_evidence",
    limitation: `cmp_action_coverage:${input.action}:no_cmp_evidence:${fingerprintToken}`,
  };
}
