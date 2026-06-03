export type DomainDnsStatus =
  | {
      exists: true;
      reason: null;
    }
  | {
      exists: false;
      reason: string;
    };

export type DnsResolver = (hostname: string) => Promise<unknown[]>;
export type DnsLookupResolver = (hostname: string) => Promise<unknown>;

const NO_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT"]);

function getDnsErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

async function hasDnsRecords(hostname: string, resolver: DnsResolver) {
  try {
    const records = await resolver(hostname);
    return Array.isArray(records) && records.length > 0;
  } catch (error) {
    const code = getDnsErrorCode(error);

    if (code && NO_RECORD_CODES.has(code)) {
      return false;
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
    const [hasIpv4, hasIpv6] = await Promise.all([
      hasDnsRecords(normalizedHostname, resolvers.resolve4),
      hasDnsRecords(normalizedHostname, resolvers.resolve6)
    ]);

    if (hasIpv4 || hasIpv6 || (resolvers.lookup ? await hasLookupRecord(normalizedHostname, resolvers.lookup) : false)) {
      return {
        exists: true,
        reason: null
      };
    }

    return {
      exists: false,
      reason: "We could not find DNS records for that domain. Check the spelling and try again."
    };
  } catch (error) {
    console.error("[domain-dns] DNS validation failed", {
      error: error instanceof Error ? error.message : String(error),
      hostname: normalizedHostname
    });

    return {
      exists: false,
      reason: "We could not verify that domain right now. Try again in a minute."
    };
  }
}

async function hasLookupRecord(hostname: string, resolver: DnsLookupResolver) {
  try {
    const record = await resolver(hostname);
    return Array.isArray(record) ? record.length > 0 : Boolean(record);
  } catch (error) {
    const code = getDnsErrorCode(error);

    if (code && NO_RECORD_CODES.has(code)) {
      return false;
    }

    throw error;
  }
}
