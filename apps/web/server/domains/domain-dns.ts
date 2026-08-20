import "server-only";

import { lookup, resolve4, resolve6 } from "node:dns/promises";
import { checkDomainDnsWithResolvers, type DomainDnsStatus } from "./domain-dns-core";

export class DomainDnsPreflightError extends Error {
  readonly code: "dns_unavailable" | "domain_not_found";
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(status: Extract<DomainDnsStatus, { exists: false }>) {
    super(status.reason);
    this.name = "DomainDnsPreflightError";
    this.code = status.retryable ? "dns_unavailable" : "domain_not_found";
    this.retryable = status.retryable;
    this.retryAfterSeconds = status.retryable ? 60 : null;
  }
}

export async function checkDomainDns(hostname: string): Promise<DomainDnsStatus> {
  return checkDomainDnsWithResolvers(hostname, {
    lookup: (value) => lookup(value, { all: true }),
    resolve4,
    resolve6
  });
}

export async function requireDomainDns(hostname: string): Promise<void> {
  const status = await checkDomainDns(hostname);
  if (!status.exists) {
    throw new DomainDnsPreflightError(status);
  }
}

export function isDomainDnsPreflightError(error: unknown): error is DomainDnsPreflightError {
  return error instanceof DomainDnsPreflightError;
}
