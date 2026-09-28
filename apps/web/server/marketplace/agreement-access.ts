import { agreementAllowsAccess } from "./contracts";

type Binding = { license_arn: string; agreement_id: string | null; buyer_account_id: string };
type Agreement = Parameters<typeof agreementAllowsAccess>[0];
const FRESH_MS = 5 * 60_000;
const MAX_ENTRIES = 1_000;

// A delivered revocation is checked in PostgreSQL on every request. This bounded
// cache is an additional safety net for missed agreement-cancellation events.
// It stores no API keys and never serves an expired snapshot after an AWS error.
export function createMarketplaceAccessVerifier(deps: {
  binding: (token: string) => Promise<Binding | null>;
  agreement: (id: string) => Promise<Agreement>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { until: number; promise: Promise<Agreement> }>();
  return async (token: string) => {
    const binding = await deps.binding(token);
    if (!binding?.agreement_id) return null;
    const id = binding.agreement_id;
    let entry = cache.get(id);
    if (!entry || entry.until <= now()) {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      entry = { until: now() + FRESH_MS, promise: deps.agreement(id) };
      cache.set(id, entry);
      const current = entry;
      void entry.promise.catch(() => { if (cache.get(id) === current) cache.delete(id); });
    }
    const agreement = await entry.promise;
    if (!agreementAllowsAccess(agreement, binding.buyer_account_id, now())) return null;
    // Rotation, expiry or deprovisioning may occur while the AWS call is pending.
    const current = await deps.binding(token);
    return current?.license_arn === binding.license_arn && current.agreement_id === id && current.buyer_account_id === binding.buyer_account_id
      ? { agreementId: id, licenseArn: binding.license_arn }
      : null;
  };
}
