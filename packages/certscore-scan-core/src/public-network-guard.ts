import { lookup } from "node:dns/promises";
import {
  PUBLIC_TARGET_POLICY_VERSION,
  assertPublicTargetHostname,
  classifyPublicTargetAddress,
} from "@website-signal-risk-scanner/shared";
import type { BrowserContext, Page, Route } from "playwright";

export const PUBLIC_NETWORK_GUARD_ERROR_CODE = "unsafe_target_blocked" as const;

export class PublicNetworkGuardError extends Error {
  readonly code = PUBLIC_NETWORK_GUARD_ERROR_CODE;
  readonly policyVersion = PUBLIC_TARGET_POLICY_VERSION;

  constructor() {
    super("This target is not eligible for public website scanning.");
    this.name = "PublicNetworkGuardError";
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
    throw new PublicNetworkGuardError();
  }
  if ((target.protocol !== "http:" && target.protocol !== "https:") || target.username || target.password) {
    throw new PublicNetworkGuardError();
  }
  let hostname: string;
  try {
    hostname = assertPublicTargetHostname(target.hostname);
  } catch {
    throw new PublicNetworkGuardError();
  }
  const literal = classifyPublicTargetAddress(hostname);
  if (literal.family !== null) {
    if (!literal.public) throw new PublicNetworkGuardError();
    return target;
  }
  let answers: readonly { address: string; family: number }[];
  try {
    answers = await (options.resolver ?? defaultResolver)(hostname);
  } catch {
    throw new PublicNetworkGuardError();
  }
  if (answers.length === 0 || answers.some(({ address }) => !classifyPublicTargetAddress(address).public)) {
    throw new PublicNetworkGuardError();
  }
  return target;
}

export async function installPublicNetworkGuardRoute(
  context: BrowserContext | Page,
  options: { resolver?: PublicNetworkResolver; env?: Record<string, string | undefined> } = {},
) {
  if (!publicNetworkGuardEnabled(options.env)) return;
  const cache = new Map<string, Promise<void>>();
  await context.route("**/*", async (route: Route) => {
    const url = route.request().url();
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      await route.abort("blockedbyclient");
      return;
    }
    let validation = cache.get(origin);
    if (!validation) {
      validation = assertPublicNetworkUrl(url, { resolver: options.resolver }).then(() => undefined);
      cache.set(origin, validation);
    }
    try {
      await validation;
      await route.fallback();
    } catch {
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
    const location = response.headers.get("location");
    if (!location || redirectCount >= maxRedirects) {
      throw new PublicNetworkGuardError();
    }
    await response.body?.cancel().catch(() => undefined);
    target = new URL(location, target);
  }
}

async function defaultResolver(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}
