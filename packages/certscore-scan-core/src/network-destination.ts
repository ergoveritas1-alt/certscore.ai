import { resolve } from "node:path";
import type { NetworkDestination } from "@certscore/contracts";
import maxmind from "maxmind";
type CountryResponse = { country_code?: string };
type AsnResponse = { asn?: string | number; org?: string };
import type { Response } from "playwright";
import { normalizePublicIpAddress } from "./public-ip-address.js";

type LookupReader<T> = { get(ip: string): T | null; metadata: { buildEpoch: Date } };
type Readers = { country: () => Promise<LookupReader<CountryResponse> | null>; network: () => Promise<LookupReader<AsnResponse> | null>; now?: () => number };
const MAX_DATABASE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function localReader<T extends CountryResponse | AsnResponse>(paths: string[], databaseType: string) {
  let opened: Promise<LookupReader<T> | null> | undefined;
  return () => opened ??= (async () => {
    for (const path of paths.filter(Boolean)) {
      try {
        const reader = await maxmind.open(path, { watchForUpdates: false, cache: { max: 512 } });
        // MMDB reader typings describe MaxMind records; IPLocate has its own schema.
        // Field types are validated below before entering the retained contract.
        if (reader.metadata.databaseType.startsWith(`iplocate ${databaseType}-`)) return {
          metadata: reader.metadata, get: (ip: string) => reader.get(ip) as unknown as T | null,
        };
      } catch { /* Missing database is explicit, never a remote fallback. */ }
    }
    return null;
  })();
}

/** Bounded cache and process-reused readers; no DNS, HTTP, or browser work. */
export function createDestinationEnricher(readers: Readers) {
  const cache = new Map<string, { expiresAt: number; pending: Promise<Partial<NetworkDestination>> }>();
  return async (destination: NetworkDestination | undefined): Promise<NetworkDestination | undefined> => {
    if (!destination) return undefined;
    const ip = normalizePublicIpAddress(destination.ip);
    if (!ip) return undefined;
    const now = (readers.now ?? Date.now)();
    let entry = cache.get(ip);
    if (entry && now >= entry.expiresAt) { cache.delete(ip); entry = undefined; }
    if (entry) {
      // Keep frequently reused endpoints when a warm process sees many sites.
      cache.delete(ip); cache.set(ip, entry);
    } else {
      const created: { expiresAt: number; pending: Promise<Partial<NetworkDestination>> } = {
        expiresAt: (Math.floor(now / 86400000) + 1) * 86400000,
        pending: (async () => {
        const [country, network] = await Promise.all([readers.country(), readers.network()]);
        const lookup = <T,>(reader: LookupReader<T> | null) => {
          if (!reader) return { status: "database_unavailable" as const };
          const epoch = reader.metadata.buildEpoch.getTime();
          if (!Number.isFinite(epoch) || epoch > now || now - epoch > MAX_DATABASE_AGE_MS) return { status: "database_stale" as const };
          // Expire at the actual freshness boundary, even within the same UTC day.
          created.expiresAt = Math.min(created.expiresAt, epoch + MAX_DATABASE_AGE_MS + 1);
          const builtAt = new Date(epoch).toISOString();
          try { return { status: "not_found" as const, value: reader.get(ip), builtAt }; }
          catch { return { status: "database_unavailable" as const, builtAt }; }
        };
        const location = lookup(country), operator = lookup(network);
        // Registered country describes registration, not necessarily the server location.
        const rawCountry = location.value?.country_code;
        const countryCode = typeof rawCountry === "string" && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : undefined;
        const rawAsn = operator.value?.asn;
        const parsedAsn = typeof rawAsn === "number" ? rawAsn : typeof rawAsn === "string" && /^\d+$/.test(rawAsn) ? Number(rawAsn) : NaN;
        const asn = Number.isSafeInteger(parsedAsn) && parsedAsn > 0 && parsedAsn <= 4294967295 ? parsedAsn : undefined;
        const provider = typeof operator.value?.org === "string" ? operator.value.org.slice(0, 160) || undefined : undefined;
        return { country: countryCode, countryCode, asn, provider,
          enrichment: { country: countryCode ? "resolved" : location.status, network: asn || provider ? "resolved" : operator.status,
            countryDatabaseBuiltAt: location.builtAt, networkDatabaseBuiltAt: operator.builtAt } };
        })(),
      };
      entry = created;
      cache.set(ip, entry);
      if (cache.size > 2048) cache.delete(cache.keys().next().value!);
    }
    const enriched = await entry.pending;
    const resolved = enriched.countryCode || enriched.asn || enriched.provider;
    return { ...destination, ...enriched, ip,
      source: resolved ? destination.source.startsWith("proxy_connect") ? "proxy_connect_iplocate" : destination.source.startsWith("response_server_addr") ? "response_server_addr_iplocate" : "cdp_remote_ip_iplocate" : destination.source };
  };
}

function databasePaths(name: string) {
  return ["/opt/iplocate", "/var/task/iplocate", resolve(process.cwd(), "config/iplocate"), resolve(process.cwd(), "../../config/iplocate")].map(directory => resolve(directory, name));
}
const destinationReaders: Readers = {
  country: localReader<CountryResponse>(process.env.CERTSCORE_IPLOCATE_COUNTRY_DB_PATH ? [process.env.CERTSCORE_IPLOCATE_COUNTRY_DB_PATH] : databasePaths("ip-to-country.mmdb"), "ip-to-country"),
  network: localReader<AsnResponse>(process.env.CERTSCORE_IPLOCATE_ASN_DB_PATH ? [process.env.CERTSCORE_IPLOCATE_ASN_DB_PATH] : databasePaths("ip-to-asn.mmdb"), "ip-to-asn"),
};
/** Open the existing local readers during capture, without a synthetic address or remote lookup. */
export async function prepareDestinationEnrichment() {
  await Promise.all([destinationReaders.country(), destinationReaders.network()]);
}
export const enrichNetworkDestination = createDestinationEnricher(destinationReaders);

/** The browser response owns the address and redirect identity; URL queues are intentionally absent. */
export async function captureResponseDestination(response: Pick<Response, "serverAddr" | "fromServiceWorker">) {
  const fromServiceWorker = response.fromServiceWorker();
  if (fromServiceWorker) return { status: "service_worker" as const, fromServiceWorker };
  try {
    const address = await response.serverAddr();
    const ip = normalizePublicIpAddress(address?.ipAddress);
    if (!ip) return { status: "ip_not_exposed" as const, fromServiceWorker, connectionId: address?.certscoreConnectionId };
    const destination: NetworkDestination = { ip, source: "response_server_addr", locationLabel: "server location (may be CDN edge)" };
    return { status: "server_observed" as const, fromServiceWorker, destination };
  } catch { return { status: "unavailable" as const, fromServiceWorker }; }
}
