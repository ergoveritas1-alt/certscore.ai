function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);
  const health = {
    ok: true,
    service: "certscore-pulse",
    version: "v1",
    betaVersion: "0.5.3",
    generatedAt: new Date().toISOString()
  };

  return new Response(JSON.stringify(health), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore.ai-Pulse": "v1",
      "X-CertScore.ai-Route": "pulse-health",
      "X-CertScore.ai-Request-Id": id,
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "pulse-health",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
