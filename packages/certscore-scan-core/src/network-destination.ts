import type { NetworkDestination } from "@certscore/contracts";
import maxmind, { type AsnResponse, type CityResponse, type Reader } from "maxmind";

let cityReaderPromise: Promise<Reader<CityResponse> | null> | null = null;
let asnReaderPromise: Promise<Reader<AsnResponse> | null> | null = null;

function cityReader() {
  const path = process.env.CERTSCORE_GEOLITE2_CITY_DB_PATH ?? "/opt/geolite2/GeoLite2-City.mmdb";
  cityReaderPromise ??= path?.trim()
    ? maxmind.open<CityResponse>(path, { watchForUpdates: false }).catch(() => null)
    : Promise.resolve(null);
  return cityReaderPromise;
}

function asnReader() {
  const path = process.env.CERTSCORE_GEOLITE2_ASN_DB_PATH ?? "/opt/geolite2/GeoLite2-ASN.mmdb";
  asnReaderPromise ??= path?.trim()
    ? maxmind.open<AsnResponse>(path, { watchForUpdates: false }).catch(() => null)
    : Promise.resolve(null);
  return asnReaderPromise;
}

export async function enrichNetworkDestination(
  destination: NetworkDestination | undefined,
): Promise<NetworkDestination | undefined> {
  if (!destination) return undefined;
  const [city, asn] = await Promise.all([
    cityReader().then((reader) => reader?.get(destination.ip) ?? null),
    asnReader().then((reader) => reader?.get(destination.ip) ?? null),
  ]);
  const countryCode = city?.country?.iso_code ?? city?.registered_country?.iso_code;
  const cityName = city?.city?.names?.en;
  const asnNumber = asn?.autonomous_system_number;
  const provider = asn?.autonomous_system_organization;
  if (!countryCode && !cityName && !asnNumber && !provider) return destination;
  return {
    ...destination,
    asn: asnNumber,
    city: cityName,
    country: countryCode,
    countryCode,
    provider,
    source: "cdp_remote_ip_geolite2",
  };
}
