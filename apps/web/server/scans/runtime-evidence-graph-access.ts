import type { ScanDetailResponse } from "./get-scan-by-id";

/** Read-only authorization, deliberately separate from account bootstrap/repair paths. */
export async function loadAuthorizedRuntimeGraphReport(scanId: string, dependencies: {
  anonymous: (scanId: string) => Promise<ScanDetailResponse | null>;
  user: () => Promise<{ id: string; email: string } | null>;
  admin: (email: string) => boolean;
  membership: (userId: string) => Promise<{ organization_id: string } | null>;
  status: (organizationId: string, scanId: string) => Promise<{ reportReady: boolean; reportGeneration: string | null } | null>;
  report: (input: { scanId: string; organizationId?: string; generation?: string | null }) => Promise<ScanDetailResponse | null>;
}) {
  const anonymous = await dependencies.anonymous(scanId);
  if (anonymous) return anonymous.scan.id === scanId ? anonymous : null;
  const user = await dependencies.user(); if (!user) return null;
  if (dependencies.admin(user.email)) return dependencies.report({ scanId });
  const membership = await dependencies.membership(user.id);
  if (!membership?.organization_id) return null;
  const organizationId = membership.organization_id;
  // The general report cache is not an authorization boundary. Check scoped ownership first.
  const status = await dependencies.status(organizationId, scanId);
  if (!status?.reportReady) return null;
  return dependencies.report({ scanId, organizationId, generation: status.reportGeneration });
}

/** This session/public route does not authenticate Bearer credentials. Never let arbitrary
 * Authorization strings become new caller identities in the shared read-quota helper. */
export function runtimeGraphQuotaRequest(request: Request) {
  const headers = new Headers(request.headers); headers.delete("authorization");
  return new Request(request.url, { method: "GET", headers });
}
