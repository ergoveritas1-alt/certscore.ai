import { lookup } from "node:dns/promises";
import net from "node:net";

export type ScanUrlPreflightStatus =
  | "invalid_url"
  | "domain_not_found"
  | "unreachable"
  | "redirected_to_different_domain"
  | "blocked_or_challenged"
  | "timeout"
  | "ok";

export type ScanUrlPreflightResult = {
  status: ScanUrlPreflightStatus;
  input: string;
  normalizedUrl: string | null;
  submittedUrl: string | null;
  finalUrl: string | null;
  hostname: string | null;
  finalHostname: string | null;
  message: string;
  suggestion: string | null;
  requiresConfirmation: boolean;
};

type ResolveAddress = {
  address: string;
  family: 4 | 6;
};

type PreflightOptions = {
  fetchImpl?: typeof fetch;
  maxRedirects?: number;
  requestTimeoutMs?: number;
  resolveHostname?: (hostname: string) => Promise<ResolveAddress[]>;
};

const DEFAULT_TIMEOUT_MS = 4500;
const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 4096;
const CHALLENGE_HEADERS = ["cf-mitigated", "x-distil-cs", "x-datadome", "x-akamai-request-id"];
const COMMON_TLD_TYPOS: Record<string, string> = {
  ".cmo": ".com",
  ".coom": ".com",
  ".con": ".com",
  ".comm": ".com",
  ".ocm": ".com",
  ".ogr": ".org",
  ".nte": ".net"
};

function emptyResult(input: string, status: ScanUrlPreflightStatus, message: string, suggestion: string | null = null): ScanUrlPreflightResult {
  return {
    finalHostname: null,
    finalUrl: null,
    hostname: null,
    input,
    message,
    normalizedUrl: null,
    requiresConfirmation: false,
    status,
    submittedUrl: null,
    suggestion
  };
}

export function getUrlIntakeSuggestion(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (/^htps:\/\//i.test(trimmed)) {
    return `https://${trimmed.slice("htps://".length)}`;
  }

  if (/^htp:\/\//i.test(trimmed)) {
    return `http://${trimmed.slice("htp://".length)}`;
  }

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return trimmed.split("@")[1] ?? null;
  }

  if (trimmed.includes(",") && !trimmed.includes("/")) {
    return trimmed.replace(",", ".");
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("ww.") && !lower.startsWith("www.")) {
    return `www.${trimmed.slice(3)}`;
  }

  for (const [typo, correction] of Object.entries(COMMON_TLD_TYPOS)) {
    if (lower.endsWith(typo)) {
      return `${trimmed.slice(0, -typo.length)}${correction}`;
    }
  }

  return null;
}

function correctProtocolTypos(input: string) {
  return input.replace(/^htps:\/\//i, "https://").replace(/^htp:\/\//i, "http://");
}

function hasIntentionalPath(input: string) {
  const trimmed = correctProtocolTypos(input.trim());
  const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  return withoutProtocol.includes("/") || withoutProtocol.includes("?") || withoutProtocol.includes("#");
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/\.$/, "").toLowerCase();
}

function isMalformedHostname(hostname: string) {
  if (hostname.length > 253 || !hostname.includes(".") || hostname.includes("_")) {
    return true;
  }

  return hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function normalizeSubmittedUrl(input: string): URL | null {
  const trimmed = correctProtocolTypos(input.trim());

  if (!trimmed || /\s/.test(trimmed) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (url.username || url.password || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return null;
  }

  url.hostname = normalizeHostname(url.hostname);

  if (net.isIP(url.hostname) || isMalformedHostname(url.hostname) || isBlockedHostname(url.hostname)) {
    return null;
  }

  if (!hasIntentionalPath(input)) {
    url.pathname = "/";
    url.search = "";
    url.hash = "";
  } else {
    url.hash = "";
  }

  return url;
}

function isBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".test") ||
    lower === "metadata.google.internal"
  );
}

function isPrivateIp(address: string) {
  if (address === "0.0.0.0" || address === "255.255.255.255") {
    return true;
  }

  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 224 || a === 240)
    );
  }

  if (family === 6) {
    const lower = address.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower.startsWith("ff") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.") ||
      lower === "169.254.169.254"
    );
  }

  return true;
}

async function defaultResolveHostname(hostname: string): Promise<ResolveAddress[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => ({
    address: result.address,
    family: result.family === 6 ? 6 : 4
  }));
}

async function resolvePublicHostname(hostname: string, resolveHostname: (hostname: string) => Promise<ResolveAddress[]>) {
  if (isBlockedHostname(hostname) || net.isIP(hostname)) {
    return false;
  }

  const addresses = await resolveHostname(hostname);
  return addresses.length > 0 && addresses.every((address) => !isPrivateIp(address.address));
}

function getRegistrableDomain(hostname: string | null) {
  if (!hostname) {
    return null;
  }

  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) {
    return null;
  }

  const twoPartPublicSuffixes = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "com.br", "co.jp"]);
  const suffix = labels.slice(-2).join(".");

  if (twoPartPublicSuffixes.has(suffix) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

function isLikelyChallenge(response: Response, bodySample: string) {
  const server = response.headers.get("server")?.toLowerCase() ?? "";
  const body = bodySample.toLowerCase();

  return (
    response.status === 403 ||
    response.status === 429 ||
    CHALLENGE_HEADERS.some((header) => response.headers.has(header)) ||
    server.includes("cloudflare") && body.includes("challenge") ||
    /captcha|cf-chl|checking your browser|enable javascript|access denied|temporarily blocked/i.test(bodySample)
  );
}

function sameRegistrableDomain(a: string | null, b: string | null) {
  const left = getRegistrableDomain(a);
  const right = getRegistrableDomain(b);
  return Boolean(left && right && left === right);
}

async function readSmallBody(response: Response) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (size < MAX_RESPONSE_BYTES) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      chunks.push(result.value);
      size += result.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return new TextDecoder().decode(Buffer.concat(chunks, Math.min(size, MAX_RESPONSE_BYTES)));
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        Range: `bytes=0-${MAX_RESPONSE_BYTES - 1}`,
        "User-Agent": "CertScore-URL-Preflight/1.0"
      },
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function redirectedUrl(currentUrl: URL, response: Response) {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status > 399) {
    return null;
  }

  try {
    return new URL(location, currentUrl);
  } catch {
    return null;
  }
}

async function probeReachableUrl(
  startUrl: URL,
  options: Required<Pick<PreflightOptions, "fetchImpl" | "maxRedirects" | "requestTimeoutMs" | "resolveHostname">>
) {
  let currentUrl = new URL(startUrl);

  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      return { kind: "invalid" as const, url: currentUrl };
    }

    if (!(await resolvePublicHostname(currentUrl.hostname, options.resolveHostname))) {
      return { kind: "blocked_host" as const, url: currentUrl };
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(options.fetchImpl, currentUrl, options.requestTimeoutMs);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { kind: "timeout" as const, url: currentUrl };
      }
      return { kind: "failed" as const, url: currentUrl };
    }

    const nextUrl = redirectedUrl(currentUrl, response);
    if (nextUrl) {
      currentUrl = nextUrl;
      continue;
    }

    const bodySample = await readSmallBody(response);

    if (isLikelyChallenge(response, bodySample)) {
      return { kind: "blocked_or_challenged" as const, response, url: currentUrl };
    }

    if (response.status >= 200 && response.status < 500) {
      return { kind: "ok" as const, response, url: currentUrl };
    }

    return { kind: "failed" as const, response, url: currentUrl };
  }

  return { kind: "failed" as const, url: currentUrl };
}

function makeHostFallbacks(hostname: string) {
  return hostname.startsWith("www.") ? [hostname.slice(4)] : [`www.${hostname}`];
}

export async function validateScanUrl(input: string, options: PreflightOptions = {}): Promise<ScanUrlPreflightResult> {
  const suggestion = getUrlIntakeSuggestion(input);
  const submitted = normalizeSubmittedUrl(input);

  if (!submitted) {
    return emptyResult(input, "invalid_url", "Enter a valid public website URL, such as https://example.com.", suggestion);
  }

  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;

  try {
    if (!(await resolvePublicHostname(submitted.hostname, resolveHostname))) {
      return {
        ...emptyResult(input, "domain_not_found", "That domain could not be resolved in public DNS.", suggestion),
        hostname: submitted.hostname,
        normalizedUrl: submitted.toString(),
        submittedUrl: submitted.toString()
      };
    }
  } catch {
    return {
      ...emptyResult(input, "domain_not_found", "That domain could not be resolved in public DNS.", suggestion),
      hostname: submitted.hostname,
      normalizedUrl: submitted.toString(),
      submittedUrl: submitted.toString()
    };
  }

  const fetchOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    maxRedirects: options.maxRedirects ?? MAX_REDIRECTS,
    requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    resolveHostname
  };
  const candidates: URL[] = [];
  const httpsUrl = new URL(submitted);
  httpsUrl.protocol = "https:";
  candidates.push(httpsUrl);
  const httpUrl = new URL(submitted);
  httpUrl.protocol = "http:";
  candidates.push(httpUrl);

  for (const fallbackHost of makeHostFallbacks(submitted.hostname)) {
    for (const protocol of ["https:", "http:"] as const) {
      const fallbackUrl = new URL(submitted);
      fallbackUrl.protocol = protocol;
      fallbackUrl.hostname = fallbackHost;
      candidates.push(fallbackUrl);
    }
  }

  let sawTimeout = false;
  let sawChallenge: URL | null = null;

  for (const candidate of candidates) {
    const probe = await probeReachableUrl(candidate, fetchOptions);

    if (probe.kind === "timeout") {
      sawTimeout = true;
      continue;
    }

    if (probe.kind === "blocked_or_challenged") {
      sawChallenge = probe.url;
      break;
    }

    if (probe.kind !== "ok") {
      continue;
    }

    const finalUrl = probe.url.toString();
    const finalHostname = probe.url.hostname;
    const crossRegistrableDomain = !sameRegistrableDomain(submitted.hostname, finalHostname);

    return {
      finalHostname,
      finalUrl,
      hostname: submitted.hostname,
      input,
      message: crossRegistrableDomain
        ? "This address redirects to a different website. Confirm before scanning the final URL."
        : "This website is reachable.",
      normalizedUrl: submitted.toString(),
      requiresConfirmation: crossRegistrableDomain,
      status: crossRegistrableDomain ? "redirected_to_different_domain" : "ok",
      submittedUrl: submitted.toString(),
      suggestion
    };
  }

  if (sawChallenge) {
    return {
      finalHostname: sawChallenge.hostname,
      finalUrl: sawChallenge.toString(),
      hostname: submitted.hostname,
      input,
      message: "The site appears to block or challenge automated requests before scanning.",
      normalizedUrl: submitted.toString(),
      requiresConfirmation: false,
      status: "blocked_or_challenged",
      submittedUrl: submitted.toString(),
      suggestion
    };
  }

  return {
    finalHostname: null,
    finalUrl: null,
    hostname: submitted.hostname,
    input,
    message: sawTimeout
      ? "The site did not respond before the validation timeout."
      : "The site could not be reached over HTTPS or HTTP.",
    normalizedUrl: submitted.toString(),
    requiresConfirmation: false,
    status: sawTimeout ? "timeout" : "unreachable",
    submittedUrl: submitted.toString(),
    suggestion
  };
}
