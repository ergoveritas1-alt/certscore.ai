import type { Page } from "playwright";
import type { DomSnapshotArtifact } from "@certscore/contracts";

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
  blockingFrameChallenge?: {
    frameUrl: string;
    textExcerpt: string;
    viewportCoverage: number;
    hitTestSamples: 5;
    hitTestMatches: number;
  };
}

export interface ConsentGeometryEgressDiagnostic {
  label: string;
  proxyConfigured: boolean;
  proxyServerEnvKey?: string;
  requiredProxy: boolean;
}

export interface ConsentGeometryPageAccessInput {
  pageUrl?: string;
  errorMessage?: string;
  httpStatus?: number;
  title?: string;
  bodyText?: string;
}

const ACCESS_NO_GO_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "access_denied_text", pattern: /\baccess denied\b/i },
  { code: "temporarily_restricted", pattern: /\baccess is temporarily restricted\b/i },
  { code: "forbidden_text", pattern: /\b(?:403|forbidden)\b/i },
  { code: "bot_security_check", pattern: /\b(?:additional security check|security verification|security check|security checkpoint|browser verification|verify you are not a bot|checking your browser|human verification|captcha|hcaptcha|i am human|robot or human|press\s*&\s*hold|press and hold|confirm that you'?re human|failed to verify your browser|unable to give you access|detected unusual activity)\b/i },
  // A bare Cloudflare mention is common on healthy sites hosted by Cloudflare
  // Pages and is not challenge evidence. Keep this limited to challenge/error
  // markers; generic bot-security copy is classified by the rule above.
  { code: "cloudflare_challenge", pattern: /\b(?:ray id|cf-browser-verification)\b/i },
  { code: "cloudflare_origin_error", pattern: /\b(?:ssl handshake failed|invalid ssl certificate|origin is unreachable|web server is down|connection timed out|cloudflare 52[0-6])\b/i },
  { code: "imperva_challenge", pattern: /\b(?:imperva|incapsula)\b/i },
  { code: "kasada_challenge", pattern: /\b(?:kasada|x-kpsdk|protected by kasada)\b/i },
  { code: "temporary_interstitial", pattern: /\bzaraz wracamy\b/i },
  { code: "rate_limited", pattern: /\b(?:too many requests|rate limit|request blocked)\b/i },
  { code: "generic_error_page", pattern: /\b(?:something went wrong|service unavailable|temporarily unavailable)\b/i },
];

const RATE_LIMIT_OR_SECURITY_PATTERNS = new Set([
  "bot_security_check",
  "cloudflare_challenge",
  "imperva_challenge",
  "kasada_challenge",
  "rate_limited",
]);

const HTTP_ACCESS_NO_GO_STATUSES = new Set([401, 403, 407, 409, 451]);
const HTTP_BROKEN_ORIGIN_STATUSES = new Set([520, 521, 522, 523, 524, 525, 526, 530]);
const HTTP_TIMEOUT_STATUSES = new Set([408, 504]);
const HTTP_RATE_LIMIT_OR_SECURITY_STATUSES = new Set([429, 503]);

export function classifyConsentGeometryAccess(input: ConsentGeometryPageAccessInput): ConsentGeometryAccessDiagnostic {
  const text = compactText([
    input.title ?? "",
    input.bodyText ?? "",
    input.errorMessage ?? "",
  ].join(" "));
  const reasonCodes: string[] = [];
  if (input.pageUrl?.startsWith("chrome-error:") || input.pageUrl?.startsWith("about:neterror")) {
    reasonCodes.push("browser_error_document");
  }
  if (typeof input.httpStatus === "number" && (
    HTTP_ACCESS_NO_GO_STATUSES.has(input.httpStatus) ||
    HTTP_TIMEOUT_STATUSES.has(input.httpStatus) ||
    HTTP_RATE_LIMIT_OR_SECURITY_STATUSES.has(input.httpStatus) ||
    input.httpStatus >= 400
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
  options: { frameTextTimeoutMs?: number; supplementalBodyText?: string } = {},
): Promise<ConsentGeometryAccessDiagnostic> {
  const frameTextTimeoutMs = Math.max(50, options.frameTextTimeoutMs ?? 750);
  const frames = page.frames().slice(0, 12);
  const frameTexts = await Promise.all(frames.map((frame) =>
    withTimeout(frame.evaluate<{ title: string; documentUrl: string; bodyText: string; blockingFrames: Array<{ frameUrl: string; viewportCoverage: number; hitTestMatches: number }> }>(String.raw`(() => {
      function collectOpenShadowText(root, depth = 0) {
        if (depth > 3) {
          return [];
        }
        const texts = [];
        for (const element of Array.from(root.querySelectorAll("*")).slice(0, 700)) {
          const htmlElement = element;
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
        documentUrl: location.href,
        bodyText: [
          document.body?.innerText ?? "",
          ...collectOpenShadowText(document),
        ].join(" ").slice(0, 4_000),
        // Reuse this existing document read. Frame titles alone (for example
        // an embedded CAPTCHA widget) do not establish a blocked page.
        blockingFrames: window !== window.top ? [] : Array.from(document.querySelectorAll("iframe")).slice(0, 12).flatMap(element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const width = innerWidth, height = innerHeight;
          if (width <= 0 || height <= 0 || style.display === "none" ||
            style.visibility !== "visible" || Number(style.opacity) < 0.95 || style.pointerEvents === "none") return [];
          const coverage = Math.max(0, Math.min(width, rect.right) - Math.max(0, rect.left)) *
            Math.max(0, Math.min(height, rect.bottom) - Math.max(0, rect.top)) / (width * height);
          if (coverage < 0.8) return [];
          let ancestor = element;
          let effectiveOpacity = 1;
          for (let depth = 0; ancestor && depth < 20; depth++, ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor);
            effectiveOpacity *= Number(ancestorStyle.opacity);
            if (ancestorStyle.display === "none" || ancestorStyle.visibility !== "visible" || effectiveOpacity < 0.95) return [];
          }
          if (ancestor) return [];
          const points = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
          const matches = points.filter(([x, y]) => document.elementFromPoint(width * x, height * y) === element).length;
          return matches >= 4 ? [{ frameUrl: element.src, viewportCoverage: coverage, hitTestMatches: matches }] : [];
        }),
      };
    })()`), frameTextTimeoutMs, { title: "", documentUrl: "", bodyText: "", blockingFrames: [] })
      .catch(() => ({ title: "", documentUrl: "", bodyText: "", blockingFrames: [] }))
  ));
  const text = {
    title: frameTexts[0]?.title ?? "",
    bodyText: [
      frameTexts[0]?.bodyText ?? "",
      options.supplementalBodyText ?? "",
    ].join(" ").slice(0, 6_000),
  };
  const diagnostic = classifyConsentGeometryAccess({
    pageUrl: page.url?.(),
    httpStatus,
    title: text.title,
    bodyText: text.bodyText,
  });
  if (!frameTexts[0]?.documentUrl) {
    const independent = classifyConsentGeometryAccess({ pageUrl: page.url?.(), httpStatus });
    return { ...independent, status: independent.status === "loaded" ? "unknown" : independent.status,
      reasonCodes: [...independent.reasonCodes, "main_document_access_read_unavailable"] };
  }
  const mainFrames = frameTexts[0] && "blockingFrames" in frameTexts[0] ? frameTexts[0].blockingFrames : [];
  for (const frame of mainFrames) {
    const matches = frames.slice(1).filter(candidate => candidate.parentFrame() === page.mainFrame() && candidate.url() === frame.frameUrl);
    const match = matches[0];
    if (matches.length !== 1 || !match) continue;
    const captured = frameTexts[frames.indexOf(match)];
    const excerpt = blockingChallengeExcerpt(captured?.bodyText ?? "");
    if (!captured || captured.documentUrl !== match.url() ||
      !page.frames().includes(match) || !isExplicitBlockingChallengeText(excerpt)) continue;
    const retainedFrameUrl = new URL(match.url());
    retainedFrameUrl.search = "";
    retainedFrameUrl.hash = "";
    retainedFrameUrl.username = "";
    retainedFrameUrl.password = "";
    if (retainedFrameUrl.href.length > 2_000) continue;
    // Exact live URL matching above precedes redaction for retained diagnostics.
    diagnostic.blockingFrameChallenge = { ...frame, frameUrl: retainedFrameUrl.href, textExcerpt: excerpt, hitTestSamples: 5 };
    diagnostic.status = "rate_limited_or_security_challenge";
    diagnostic.reasonCodes = [...new Set([...diagnostic.reasonCodes, "bot_security_check", "viewport_blocking_frame_challenge"])].slice(0, 8);
    break;
  }
  return diagnostic;
}

export function isExplicitBlockingChallengeText(text: string): boolean {
  return blockingChallengeExcerpt(text).length > 0;
}

export function isRetainedBlockingFrameChallengeBound(snapshot: DomSnapshotArtifact, artifact: unknown): boolean {
  const record = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const geometry = record(artifact);
  const identity = record(geometry?.documentIdentity);
  const proof = record(record(geometry?.access)?.blockingFrameChallenge);
  return Boolean(snapshot.blockingFrameChallenge && snapshot.documentIdentity?.token &&
    geometry?.pageUrl === snapshot.url && identity?.source === snapshot.documentIdentity.source &&
    identity?.token === snapshot.documentIdentity.token &&
    proof?.frameUrl === snapshot.blockingFrameChallenge.frameUrl &&
    proof?.textExcerpt === snapshot.textExcerpt &&
    proof?.viewportCoverage === snapshot.blockingFrameChallenge.viewportCoverage &&
    proof?.hitTestSamples === snapshot.blockingFrameChallenge.hitTestSamples &&
    proof?.hitTestMatches === snapshot.blockingFrameChallenge.hitTestMatches);
}

function blockingChallengeExcerpt(text: string): string {
  const bounded = compactText(text).slice(0, 4_000);
  const match = /\bpress\s*(?:&|and)\s*hold\b.{0,120}?\b(?:human|not (?:a )?bot|verification)\b/i.exec(bounded) ??
    /\b(?:verify|confirm)\b.{0,50}\b(?:you are|you'?re)\s+(?:a )?human\b/i.exec(bounded) ??
    /^(?:checking your browser|performing security verification)\b/i.exec(bounded);
  // Retain only the matched instruction, never unrelated preceding frame text.
  return (match?.[0] ?? "")
    .replace(/https?:\/\/\S+|\b[^\s@]+@[^\s@]+\.[^\s@]+|\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
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
  if (input.reasonCodes.includes("browser_error_document")) return "navigation_error";
  // A rendered HTTP-200 page can finish with a bounded evidence-module error.
  // That is a coverage limitation, not proof that the origin was inaccessible.
  // Runtime coverage retains the limitation separately.
  if (
    typeof input.httpStatus === "number" &&
    input.httpStatus >= 200 && input.httpStatus < 400 &&
    /(?:module budget|bounded partial evidence|evidence capture|consent inspection|supplemental full-page screenshot).*?(?:timed out|timeout|exhausted|partial)/i.test(errorText)
  ) {
    return "loaded";
  }
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
    HTTP_BROKEN_ORIGIN_STATUSES.has(input.httpStatus)
  ) {
    return "access_no_go";
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
