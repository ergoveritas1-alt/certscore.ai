export type DomainDnsStatus =
  | {
      exists: true;
      reason: null;
      retryable: false;
    }
  | {
      exists: false;
      reason: string;
      retryable: boolean;
    };

export type DnsResolver = (hostname: string) => Promise<unknown[]>;
export type DnsLookupResolver = (hostname: string) => Promise<unknown>;

const NO_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND"]);
const TRANSIENT_DNS_CODES = new Set(["EAI_AGAIN", "ECONNREFUSED", "ESERVFAIL", "ETIMEOUT"]);

function getDnsErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

type DnsResolution = "found" | "not_found" | "unavailable";

async function resolveDnsRecords(hostname: string, resolver: DnsResolver): Promise<DnsResolution> {
  try {
    const records = await resolver(hostname);
    return Array.isArray(records) && records.length > 0 ? "found" : "not_found";
  } catch (error) {
    const code = getDnsErrorCode(error);

    if (code && NO_RECORD_CODES.has(code)) {
      return "not_found";
    }

    if (code && TRANSIENT_DNS_CODES.has(code)) {
      return "unavailable";
    }

    throw error;
  }
}

export async function checkDomainDnsWithResolvers(
  hostname: string,
  resolvers: { lookup?: DnsLookupResolver; resolve4: DnsResolver; resolve6: DnsResolver }
): Promise<DomainDnsStatus> {
  const normalizedHostname = hostname.trim().toLowerCase();

  try {
    const [ipv4, ipv6] = await Promise.all([
      resolveDnsRecords(normalizedHostname, resolvers.resolve4),
      resolveDnsRecords(normalizedHostname, resolvers.resolve6)
    ]);

    if (ipv4 === "found" || ipv6 === "found") {
      return {
        exists: true,
        reason: null,
        retryable: false
      };
    }

    const lookup = resolvers.lookup ? await resolveLookupRecord(normalizedHostname, resolvers.lookup) : "not_found";
    if (lookup === "found") {
      return {
        exists: true,
        reason: null,
        retryable: false
      };
    }

    if (ipv4 === "unavailable" || ipv6 === "unavailable" || lookup === "unavailable") {
      return {
        exists: false,
        reason: "We could not verify that domain right now. Try again in a minute.",
        retryable: true
      };
    }

    return {
      exists: false,
      reason: "We could not find DNS records for that domain. Check the spelling and try again.",
      retryable: false
    };
  } catch (error) {
    console.error("[domain-dns] DNS validation failed", {
      error: error instanceof Error ? error.message : String(error),
      hostname: normalizedHostname
    });

    return {
      exists: false,
      reason: "We could not verify that domain right now. Try again in a minute.",
      retryable: true
    };
  }
}

async function resolveLookupRecord(hostname: string, resolver: DnsLookupResolver): Promise<DnsResolution> {
  try {
    const record = await resolver(hostname);
    return (Array.isArray(record) ? record.length > 0 : Boolean(record)) ? "found" : "not_found";
  } catch (error) {
    const code = getDnsErrorCode(error);

    if (code && NO_RECORD_CODES.has(code)) {
      return "not_found";
    }

    if (code && TRANSIENT_DNS_CODES.has(code)) {
      return "unavailable";
    }

    throw error;
  }
}
