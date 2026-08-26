import { getTrustedRequestSourceIp } from "@website-signal-risk-scanner/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  const ip = getTrustedRequestSourceIp(request.headers);
  if (!ip) {
    return new Response(JSON.stringify({
      error: "trusted_source_ip_unavailable",
      type: "certscore_egress_reflector_error",
    }), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
      status: 503,
    });
  }

  return new Response(JSON.stringify({
    artifactVersion: "certscore.egress-reflection.v1",
    ip,
  }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
