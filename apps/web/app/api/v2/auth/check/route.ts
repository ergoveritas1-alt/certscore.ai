import { apiV2JsonResponse, buildApiV2Error } from "../../../../../lib/api-v2/scan-resource";
import { parseBearerToken, validateCertScoreBearerToken } from "../../../../../server/integrations/api-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function GET(request: Request) {
  const id = requestId(request);
  const bearer = parseBearerToken(request);

  if (!bearer.token) {
    return apiV2JsonResponse({
      body: buildApiV2Error({
        code: "unauthorized",
        message: "Use Authorization: Bearer <token> to check CertScore.ai integration credentials."
      }),
      requestId: id,
      route: "api-v2-auth-check",
      status: 401
    });
  }

  try {
    const auth = await validateCertScoreBearerToken(bearer.token, []);
    if (!auth.ok) {
      return apiV2JsonResponse({
        body: buildApiV2Error({
          code: auth.reason === "missing_scope" ? "forbidden" : "unauthorized",
          message:
            auth.reason === "missing_scope"
              ? "This credential does not include the required scope."
              : "This credential is invalid, expired, or revoked."
        }),
        requestId: id,
        route: "api-v2-auth-check",
        status: auth.reason === "missing_scope" ? 403 : 401
      });
    }

    return apiV2JsonResponse({
      body: {
        type: "certscore_auth_check",
        authenticated: true,
        scopes: auth.key.scopes,
        expiresAt: auth.key.expiresAt,
        disclaimer: "Credential validity only; this endpoint does not create scans or expose report data."
      },
      requestId: id,
      route: "api-v2-auth-check",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-auth-check] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "Credential validation is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-auth-check",
      status: 500
    });
  }
}
