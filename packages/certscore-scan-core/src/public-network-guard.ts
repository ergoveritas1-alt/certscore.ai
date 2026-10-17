import { lookup } from "node:dns/promises";
import {
  PUBLIC_TARGET_POLICY_VERSION,
  assertPublicTargetHostname,
  classifyPublicTargetAddress,
} from "@website-signal-risk-scanner/shared";
import type { BrowserContext, Page, Request, Route } from "playwright";

export const PUBLIC_NETWORK_GUARD_ERROR_CODE = "unsafe_target_blocked" as const;

export type PublicNetworkGuardReason =
  | "invalid_url" | "unsupported_url" | "disallowed_hostname" | "non_public_literal"
  | "dns_resolution_failed" | "dns_no_answers" | "non_public_dns_answer" | "redirect_limit" | "unspecified";
const DNS_ERROR_CODES = ["EAI_AGAIN", "ENOTFOUND", "ETIMEOUT", "ESERVFAIL", "ECONNREFUSED", "ECANCELLED"] as const;
export type PublicNetworkGuardDiagnostic = Readonly<{
  version: "public_network_guard_failure.v1";
  reason: PublicNetworkGuardReason;
  resolverCode?: typeof DNS_ERROR_CODES[number] | "other";
}>;

export class PublicNetworkGuardError extends Error {
  readonly code = PUBLIC_NETWORK_GUARD_ERROR_CODE;
  readonly policyVersion = PUBLIC_TARGET_POLICY_VERSION;

  readonly diagnostic: PublicNetworkGuardDiagnostic;

  constructor(reason: PublicNetworkGuardReason = "unspecified", resolverCode?: string) {
    super("This target is not eligible for public website scanning.");
    this.name = "PublicNetworkGuardError";
    this.diagnostic = Object.freeze({ version: "public_network_guard_failure.v1", reason,
      ...(reason === "dns_resolution_failed" ? {
        resolverCode: DNS_ERROR_CODES.find(code => code === resolverCode) ?? "other",
      } : {}),
    });
  }
}

export type PublicNetworkResolver = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

export function publicNetworkGuardEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE?.trim().toLowerCase() === "true") return true;
  if (env.NODE_TEST_CONTEXT) return false;
  return env.CERTSCORE_PUBLIC_NETWORK_GUARD_DISABLED?.trim().toLowerCase() !== "true";
}

export async function assertPublicNetworkUrl(
  input: string | URL,
  options: { resolver?: PublicNetworkResolver } = {},
) {
  let target: URL;
  try {
    target = input instanceof URL ? input : new URL(input);
  } catch {
    throw new PublicNetworkGuardError("invalid_url");
  }
  if ((target.protocol !== "http:" && target.protocol !== "https:") || target.username || target.password) {
    throw new PublicNetworkGuardError("unsupported_url");
  }
  let hostname: string;
  try {
    hostname = assertPublicTargetHostname(target.hostname);
  } catch {
    throw new PublicNetworkGuardError("disallowed_hostname");
  }
  const literal = classifyPublicTargetAddress(hostname);
  if (literal.family !== null) {
    if (!literal.public) throw new PublicNetworkGuardError("non_public_literal");
    return target;
  }
  let answers: readonly { address: string; family: number }[];
  try {
    answers = await (options.resolver ?? defaultResolver)(hostname);
  } catch (error) {
    // Retain only a bounded code; resolver messages may contain target details.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    throw new PublicNetworkGuardError("dns_resolution_failed", code);
  }
  if (answers.length === 0) throw new PublicNetworkGuardError("dns_no_answers");
  if (answers.some(({ address }) => !classifyPublicTargetAddress(address).public)) {
    throw new PublicNetworkGuardError("non_public_dns_answer");
  }
  return target;
}

export async function installPublicNetworkGuardRoute(
  context: BrowserContext | Page,
  options: {
    resolver?: PublicNetworkResolver;
    env?: Record<string, string | undefined>;
    /** Internal diagnostics only; observer errors must never alter enforcement. */
    onRequestPhase?: (request: Request, phase: "validation_pending" | "validated" | "denied") => void;
  } = {},
) {
  if (!publicNetworkGuardEnabled(options.env)) return;
  const notify = (route: Route, phase: "validation_pending" | "validated" | "denied") => {
    try { options.onRequestPhase?.(route.request(), phase); } catch { /* Diagnostics are not policy. */ }
  };
  const cache = new Map<string, Promise<void>>();
  await context.route("**/*", async (route: Route) => {
    const url = route.request().url();
    notify(route, "validation_pending");
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      notify(route, "denied");
      await route.abort("blockedbyclient");
      return;
    }
    let validation = cache.get(origin);
    if (!validation) {
      validation = assertPublicNetworkUrl(url, { resolver: options.resolver }).then(() => undefined);
      cache.set(origin, validation);
    }
    let validated = false;
    try {
      await validation;
      validated = true;
      notify(route, "validated");
      await route.fallback();
    } catch {
      if (!validated) notify(route, "denied");
      cache.delete(origin);
      await route.abort("blockedbyclient");
    }
  });
}

export async function guardedPublicFetch(
  input: string | URL,
  init: RequestInit = {},
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    maxRedirects?: number;
    /** Return a redirect without opening its destination. Default remains guarded follow. */
    returnRedirectResponse?: boolean;
    resolver?: PublicNetworkResolver;
  } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let target = input instanceof URL ? input : new URL(input);
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 5, 10));
  for (let redirectCount = 0; ; redirectCount += 1) {
    if (publicNetworkGuardEnabled(options.env)) {
      await assertPublicNetworkUrl(target, { resolver: options.resolver });
    }
    const response = await fetchImpl(target, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (options.returnRedirectResponse) return response;
    const location = response.headers.get("location");
    if (!location || redirectCount >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new PublicNetworkGuardError("redirect_limit");
    }
    await response.body?.cancel().catch(() => undefined);
    target = new URL(location, target);
  }
}

async function defaultResolver(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}
