import { redirect } from "next/navigation";
import { safeAuthReturnPath } from "../../lib/auth-return-path";
import type { AuthenticatedAppUser } from "../auth-flows/types";

type ReadUser = () => Promise<AuthenticatedAppUser | null>;
const readUser: ReadUser = async () => (await import("../auth")).getFreshCurrentUser();

export function reportReturnPath(path: string, search: Record<string, string | string[] | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  return safeAuthReturnPath(`${path}${query.size ? `?${query}` : ""}`);
}

export async function requireReportUser(returnPath: string, getUser: ReadUser = readUser) {
  const user = await getUser();
  if (!user) redirect(`/login?${new URLSearchParams({ next: safeAuthReturnPath(returnPath) })}`);
  return user;
}

export async function requireReportViewer(scanId: string, returnPath: string) {
  const user = await readUser();
  if (user) return { signedIn: true as const };
  const { hasAnonymousScanClaim } = await import("./anonymous-scan-claims");
  if (await hasAnonymousScanClaim(scanId)) {
    const { getAnonymousScanStatusProjection } = await import("./scan-status-projection");
    const scan = await getAnonymousScanStatusProjection(scanId);
    if (scan) return { signedIn: false as const, scan };
  }
  redirect(`/login?${new URLSearchParams({ next: safeAuthReturnPath(returnPath) })}`);
}

/** Browser report endpoints require the same validated session as the report page.
 * API keys and cookie presence alone do not grant browser-report access. */
export async function reportApiAccessError(getUser: ReadUser = readUser): Promise<Response | null> {
  if (await getUser()) return null;
  return Response.json({ error: "Sign in or create an account to access this report." }, {
    status: 401, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
