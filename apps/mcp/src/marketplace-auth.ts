import { marketplaceKeyProof } from "@certscore/mcp-auth";

export async function validateMarketplaceCredential(input: { token: string | null; baseUrl: string; secret: string }, fetcher: typeof fetch = fetch): Promise<"valid" | "invalid" | "unavailable"> {
  if (!input.token || !/^cs_mp_light_[A-Za-z0-9_-]{43}$/.test(input.token)) return "invalid";
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
    await response.body?.cancel();
    return response.status === 204 ? "valid" : response.status === 401 ? "invalid" : "unavailable";
  } catch { return "unavailable"; }
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
