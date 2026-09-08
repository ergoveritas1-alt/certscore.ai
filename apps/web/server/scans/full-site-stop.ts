type StopDependencies = {
  appUrl: string;
  currentUser: () => Promise<{ id: string } | null>;
  organization: () => Promise<{ id: string } | null>;
  cancel: (input: { scanId: string; organizationId: string; userId: string }) => Promise<{ status: string } | null>;
};

/** Session-only mutation: browser origin plus a non-simple header prevent cross-site form submissions. */
export async function handleFullSiteStop(request: Request, scanId: string, deps: StopDependencies) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scanId))
    return new Response(null, { status: 400 });
  let expectedOrigin: string;
  try { expectedOrigin = new URL(deps.appUrl).origin; }
  catch { return new Response(null, { status: 503 }); }
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("x-certscore-full-site-action") !== "stop")
    return new Response(null, { status: 403 });
  const user = await deps.currentUser();
  if (!user) return new Response(null, { status: 401 });
  const organization = await deps.organization();
  if (!organization) return new Response(null, { status: 404 });
  const result = await deps.cancel({ scanId, organizationId: organization.id, userId: user.id });
  return Response.json(result, { status: result ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
}
