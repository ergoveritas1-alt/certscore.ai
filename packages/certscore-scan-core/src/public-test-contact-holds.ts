export type PublicTestContactHold = {
  addedAt: string;
  domain: string;
  reason: string;
};

/**
 * Repository-controlled holds for CertScore-initiated live testing only.
 *
 * These holds must not be applied to ordinary customer-requested production scans.
 * Remove a hold only after an explicit operational decision to resume test contact.
 */
export const PUBLIC_TEST_CONTACT_HOLDS: readonly PublicTestContactHold[] = [
  {
    addedAt: "2026-07-18",
    domain: "sits.com",
    reason: "Pause CertScore calibration and diagnostic rescans after focused consent-control testing.",
  },
] as const;

export function publicTestContactHoldForUrl(url: string): PublicTestContactHold | undefined {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return undefined;
  }
  return PUBLIC_TEST_CONTACT_HOLDS.find(
    (hold) => hostname === hold.domain || hostname.endsWith(`.${hold.domain}`),
  );
}

export function assertPublicTestContactAllowed(url: string, context: string): void {
  const hold = publicTestContactHoldForUrl(url);
  if (!hold) return;
  throw new Error(
    `Live test contact is paused for ${hold.domain} (${context}). ${hold.reason}`,
  );
}
