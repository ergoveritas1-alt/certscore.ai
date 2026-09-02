import {
  PUBLIC_TARGET_POLICY_VERSION,
  classifyPublicTargetAddress
} from "@website-signal-risk-scanner/shared";

export type DomainDnsStatus =
  | {
      exists: true;
      addressFamilyCounts: { ipv4: number; ipv6: number };
      policyVersion: typeof PUBLIC_TARGET_POLICY_VERSION;
      reason: null;
      reasonCode: null;
      retryable: false;
    }
  | {
      exists: false;
      addressFamilyCounts: { ipv4: number; ipv6: number };
      policyVersion: typeof PUBLIC_TARGET_POLICY_VERSION;
      reason: string;
      reasonCode: "dns_unavailable" | "domain_not_found" | "non_public_target";
      retryable: boolean;
    };

export type DnsResolver = (hostname: string) => Promise<unknown[]>;
export type DnsLookupResolver = (hostname: string) => Promise<unknown>;

const NO_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND"]);
const TRANSIENT_DNS_CODES = new Set(["EAI_AGAIN", "ECONNREFUSED", "ESERVFAIL", "ETIMEOUT"]);

function getDnsErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

type DnsResolution = {
  addresses: string[];
  status: "found" | "not_found" | "unavailable";
};

function addressesFromRecords(records: unknown): string[] {
  const values = Array.isArray(records) ? records : records ? [records] : [];
  return values.flatMap((record) => {
    if (typeof record === "string") return [record];
    if (record && typeof record === "object" && "address" in record && typeof record.address === "string") {
      return [record.address];
    }
    return [];
  });
}

async function resolveDnsRecords(hostname: string, resolver: DnsResolver): Promise<DnsResolution> {
  try {
    const addresses = addressesFromRecords(await resolver(hostname));
    return { addresses, status: addresses.length > 0 ? "found" : "not_found" };
  } catch (error) {
    const code = getDnsErrorCode(error);

    if (code && NO_RECORD_CODES.has(code)) {
      return { addresses: [], status: "not_found" };
    }

    if (code && TRANSIENT_DNS_CODES.has(code)) {
      return { addresses: [], status: "unavailable" };
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
    const [ipv4, ipv6, lookup] = await Promise.all([
      resolveDnsRecords(normalizedHostname, resolvers.resolve4),
      resolveDnsRecords(normalizedHostname, resolvers.resolve6),
      resolvers.lookup
        ? resolveLookupRecord(normalizedHostname, resolvers.lookup)
        : Promise.resolve({ addresses: [], status: "not_found" } satisfies DnsResolution)
    ]);
    const addresses = [...new Set([...ipv4.addresses, ...ipv6.addresses, ...lookup.addresses])];
    const classifications = addresses.map(classifyPublicTargetAddress);
    const addressFamilyCounts = {
      ipv4: classifications.filter((entry) => entry.family === 4).length,
      ipv6: classifications.filter((entry) => entry.family === 6).length
    };
    if (classifications.some((entry) => !entry.public)) {
      return {
        exists: false,
        addressFamilyCounts,
        policyVersion: PUBLIC_TARGET_POLICY_VERSION,
        reason: "This target is not eligible for public website scanning. Enter a publicly reachable HTTP or HTTPS website.",
        reasonCode: "non_public_target",
        retryable: false
      };
    }
    if ([ipv4, ipv6, lookup].some((resolution) => resolution.status === "unavailable")) {
      const lookupClassifications = lookup.addresses.map(classifyPublicTargetAddress);
      const platformLookupIsCompleteDualStack =
        lookup.status === "found" &&
        lookupClassifications.some((entry) => entry.family === 4) &&
        lookupClassifications.some((entry) => entry.family === 6);
      if (platformLookupIsCompleteDualStack) {
        return {
          exists: true,
          addressFamilyCounts,
          policyVersion: PUBLIC_TARGET_POLICY_VERSION,
          reason: null,
          reasonCode: null,
          retryable: false
        };
      }
      console.warn("[scan-target] DNS resolver coverage incomplete", {
        event: "scan_target_dns_resolver_coverage_incomplete",
        resolutionStatuses: {
          ipv4: ipv4.status,
          ipv6: ipv6.status,
          lookup: lookup.status
        }
      });
      return {
        exists: false,
        addressFamilyCounts,
        policyVersion: PUBLIC_TARGET_POLICY_VERSION,
        reason: "We could not verify that domain right now. Try again in a minute.",
        reasonCode: "dns_unavailable",
        retryable: true
      };
    }
    if (addresses.length > 0) {
      return {
        exists: true,
        addressFamilyCounts,
        policyVersion: PUBLIC_TARGET_POLICY_VERSION,
        reason: null,
        reasonCode: null,
        retryable: false
      };
    }

    return {
      exists: false,
      addressFamilyCounts,
      policyVersion: PUBLIC_TARGET_POLICY_VERSION,
      reason: "We could not find DNS records for that domain. Check the spelling and try again.",
      reasonCode: "domain_not_found",
      retryable: false
    };
  } catch (error) {
    console.error("[domain-dns] DNS validation failed", {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      exists: false,
      addressFamilyCounts: { ipv4: 0, ipv6: 0 },
      policyVersion: PUBLIC_TARGET_POLICY_VERSION,
      reason: "We could not verify that domain right now. Try again in a minute.",
      reasonCode: "dns_unavailable",
      retryable: true
    };
  }
}

async function resolveLookupRecord(hostname: string, resolver: DnsLookupResolver): Promise<DnsResolution> {
  try {
    const addresses = addressesFromRecords(await resolver(hostname));
    return { addresses, status: addresses.length > 0 ? "found" : "not_found" };
  } catch (error) {
    const code = getDnsErrorCode(error);

    if (code && NO_RECORD_CODES.has(code)) {
      return { addresses: [], status: "not_found" };
    }

    if (code && TRANSIENT_DNS_CODES.has(code)) {
      return { addresses: [], status: "unavailable" };
    }

    throw error;
  }
}
