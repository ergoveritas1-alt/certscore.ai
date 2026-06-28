import type { Page } from "playwright";

export type ConsentGeometryAccessStatus =
  | "loaded"
  | "access_no_go"
  | "navigation_error"
  | "timeout"
  | "rate_limited_or_security_challenge"
  | "unknown";

export interface ConsentGeometryAccessDiagnostic {
  status: ConsentGeometryAccessStatus;
  reasonCodes: string[];
  httpStatus?: number;
  title?: string;
  textExcerpt?: string;
}

export interface ConsentGeometryEgressDiagnostic {
  label: string;
  proxyConfigured: boolean;
  proxyServerEnvKey?: string;
  requiredProxy: boolean;
}

export interface ConsentGeometryPageAccessInput {
  errorMessage?: string;
  httpStatus?: number;
  title?: string;
  bodyText?: string;
}

const ACCESS_NO_GO_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "access_denied_text", pattern: /\baccess denied\b/i },
  { code: "forbidden_text", pattern: /\b(?:403|forbidden)\b/i },
  { code: "bot_security_check", pattern: /\b(?:additional security check|security verification|security check|security checkpoint|browser verification|verify you are not a bot|checking your browser|human verification|captcha|hcaptcha|i am human|robot or human|press\s*&\s*hold|press and hold|confirm that you'?re human|failed to verify your browser|unable to give you access)\b/i },
  { code: "cloudflare_challenge", pattern: /\b(?:cloudflare|ray id|cf-browser-verification)\b/i },
  { code: "imperva_challenge", pattern: /\b(?:imperva|incapsula)\b/i },
  { code: "temporarily_restricted", pattern: /\btemporarily restricted\b/i },
  { code: "rate_limited", pattern: /\b(?:too many requests|rate limit|request blocked)\b/i },
  { code: "generic_error_page", pattern: /\b(?:something went wrong|service unavailable|temporarily unavailable)\b/i },
];

const RATE_LIMIT_OR_SECURITY_PATTERNS = new Set([
  "bot_security_check",
  "cloudflare_challenge",
  "imperva_challenge",
  "rate_limited",
]);

const HTTP_ACCESS_NO_GO_STATUSES = new Set([401, 403, 407, 409, 451]);
const HTTP_TIMEOUT_STATUSES = new Set([408, 504]);
const HTTP_RATE_LIMIT_OR_SECURITY_STATUSES = new Set([429, 503]);

export function classifyConsentGeometryAccess(input: ConsentGeometryPageAccessInput): ConsentGeometryAccessDiagnostic {
  const text = compactText([
    input.title ?? "",
    input.bodyText ?? "",
    input.errorMessage ?? "",
  ].join(" "));
  const reasonCodes: string[] = [];
  if (typeof input.httpStatus === "number" && (
    HTTP_ACCESS_NO_GO_STATUSES.has(input.httpStatus) ||
    HTTP_TIMEOUT_STATUSES.has(input.httpStatus) ||
    HTTP_RATE_LIMIT_OR_SECURITY_STATUSES.has(input.httpStatus) ||
    input.httpStatus >= 500
  )) {
    reasonCodes.push(`http_status_${input.httpStatus}`);
  }
  for (const entry of ACCESS_NO_GO_PATTERNS) {
    if (entry.pattern.test(text)) {
      reasonCodes.push(entry.code);
    }
  }
  const status = classifyAccessStatus({
    errorMessage: input.errorMessage,
    httpStatus: input.httpStatus,
    reasonCodes,
    text,
  });

  return {
    status,
    reasonCodes: Array.from(new Set(reasonCodes)).slice(0, 8),
    ...(typeof input.httpStatus === "number" ? { httpStatus: input.httpStatus } : {}),
    ...(input.title ? { title: input.title.slice(0, 160) } : {}),
    ...(text ? { textExcerpt: text.slice(0, 500) } : {}),
  };
}

export async function collectConsentGeometryPageAccess(
  page: Page,
  httpStatus: number | undefined,
  options: { supplementalBodyText?: string } = {},
): Promise<ConsentGeometryAccessDiagnostic> {
  const frameTexts = await Promise.all(page.frames().slice(0, 12).map((frame) =>
    frame.evaluate(() => {
      function collectOpenShadowText(root: ParentNode, depth = 0): string[] {
        if (depth > 3) {
          return [];
        }
        const texts: string[] = [];
        for (const element of Array.from(root.querySelectorAll("*")).slice(0, 700)) {
          const htmlElement = element as HTMLElement & { shadowRoot?: ShadowRoot | null };
          const ariaLabel = htmlElement.getAttribute?.("aria-label");
          if (ariaLabel) {
            texts.push(ariaLabel);
          }
          if (htmlElement.shadowRoot) {
            const shadowText = (htmlElement.shadowRoot.textContent ?? "").replace(/\s+/g, " ").trim();
            if (shadowText) {
              texts.push(shadowText.slice(0, 2_000));
            }
            texts.push(...collectOpenShadowText(htmlElement.shadowRoot, depth + 1));
          }
        }
        return texts;
      }

      return {
        title: document.title,
        bodyText: [
          document.body?.innerText ?? "",
          ...collectOpenShadowText(document),
        ].join(" ").slice(0, 4_000),
      };
    }).catch(() => ({ title: "", bodyText: "" }))
  ));
  const text = {
    title: frameTexts.map((entry) => entry.title).filter(Boolean).join(" | "),
    bodyText: [
      ...frameTexts.map((entry) => entry.bodyText).filter(Boolean),
      options.supplementalBodyText ?? "",
    ].join(" ").slice(0, 6_000),
  };
  return classifyConsentGeometryAccess({
    httpStatus,
    title: text.title,
    bodyText: text.bodyText,
  });
}

export function buildConsentGeometryEgressDiagnostic(input: {
  env?: NodeJS.ProcessEnv;
  label?: string;
  requireProxy?: boolean;
} = {}): ConsentGeometryEgressDiagnostic {
  const env = input.env ?? process.env;
  const proxy = firstProxyEnv(env);
  const label = input.label?.trim() ||
    env.SCAN_EGRESS_LABEL?.trim() ||
    env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL?.trim() ||
    (proxy ? "proxy_configured" : "direct_no_proxy");
  return {
    label,
    proxyConfigured: Boolean(proxy),
    ...(proxy ? { proxyServerEnvKey: proxy.key } : {}),
    requiredProxy: input.requireProxy === true,
  };
}

export function firstProxyEnv(env: NodeJS.ProcessEnv = process.env): { key: string; value: string } | undefined {
  for (const key of [
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER",
    "SCAN_PROXY_SERVER",
    "CERTSCORE_CHROMIUM_PROXY_SERVER",
  ]) {
    const value = env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return undefined;
}

export function missingRequiredProxyDiagnostic(input: {
  label?: string;
  env?: NodeJS.ProcessEnv;
} = {}): ConsentGeometryAccessDiagnostic {
  const egress = buildConsentGeometryEgressDiagnostic({
    env: input.env,
    label: input.label,
    requireProxy: true,
  });
  return {
    status: "access_no_go",
    reasonCodes: ["required_proxy_missing", `egress_label:${egress.label}`],
    textExcerpt: "AWS Ireland egress proxy is required for this diagnostic run, but no Playwright proxy env var is configured.",
  };
}

function classifyAccessStatus(input: {
  errorMessage?: string;
  httpStatus?: number;
  reasonCodes: string[];
  text: string;
}): ConsentGeometryAccessStatus {
  const errorText = compactText(input.errorMessage ?? "");
  if (/\b(?:timeout|timed out|net::ERR_TIMED_OUT)\b/i.test(errorText)) {
    return "timeout";
  }
  if (errorText) {
    return "navigation_error";
  }
  if (
    typeof input.httpStatus === "number" &&
    HTTP_TIMEOUT_STATUSES.has(input.httpStatus)
  ) {
    return "timeout";
  }
  if (
    typeof input.httpStatus === "number" &&
    HTTP_RATE_LIMIT_OR_SECURITY_STATUSES.has(input.httpStatus)
  ) {
    return "rate_limited_or_security_challenge";
  }
  if (input.reasonCodes.some((code) => RATE_LIMIT_OR_SECURITY_PATTERNS.has(code))) {
    return "rate_limited_or_security_challenge";
  }
  if (input.reasonCodes.length > 0) {
    return "access_no_go";
  }
  if (!input.text && input.httpStatus === undefined) {
    return "unknown";
  }
  return "loaded";
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
