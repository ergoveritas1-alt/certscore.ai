import { marketplaceKeyProof } from "@certscore/mcp-auth";

export type MarketplaceAttribution = { agreementId: string; licenseArn: string };
export type MarketplaceCredentialDecision = { status: "valid"; attribution: MarketplaceAttribution } | { status: "invalid" | "unavailable" };

function validAttribution(value: unknown): value is MarketplaceAttribution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.agreementId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(record.agreementId)
    && typeof record.licenseArn === "string" && /^arn:aws(?:-[a-z]+)?:license-manager:[A-Za-z0-9-]*:[0-9]{12}:license:[A-Za-z0-9/._-]+$/.test(record.licenseArn)
    && record.licenseArn.length <= 512;
}

export async function validateMarketplaceCredential(input: { token: string | null; baseUrl: string; secret: string }, fetcher: typeof fetch = fetch): Promise<MarketplaceCredentialDecision> {
  if (!input.token || !/^cs_mp_light_[A-Za-z0-9_-]{43}$/.test(input.token)) return { status: "invalid" };
  const timestamp = String(Date.now());
  try {
    const response = await fetcher(new URL("/api/internal/marketplace-light-auth", input.baseUrl), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        authorization: `Bearer ${input.token}`,
        "x-certscore-timestamp": timestamp,
        "x-certscore-proof": marketplaceKeyProof(input.secret, timestamp, input.token),
      },
    });
    if (response.status === 401) { await response.body?.cancel(); return { status: "invalid" }; }
    if (response.status !== 200) { await response.body?.cancel(); return { status: "unavailable" }; }
    const attribution: unknown = await response.json();
    return validAttribution(attribution) ? { status: "valid", attribution } : { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}

const admissions = new Map<string, { reset: number; count: number }>();
let totalAdmission = { reset: 0, count: 0 };
export function admitMarketplaceAuth(caller: string, now = Date.now()) {
  if (totalAdmission.reset <= now) totalAdmission = { reset: now + 60_000, count: 0 };
  if (++totalAdmission.count > 600) return false;
  for (const [key, value] of admissions) if (value.reset <= now) admissions.delete(key);
  if (!admissions.has(caller) && admissions.size >= 2000) return false;
  const entry = admissions.get(caller) ?? { reset: now + 60_000, count: 0 };
  admissions.set(caller, entry);
  return ++entry.count <= 120;
}
