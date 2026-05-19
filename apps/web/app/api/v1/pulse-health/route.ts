const health = {
  ok: true,
  service: "certscore-pulse",
  version: "v1"
} as const;

export function GET() {
  return new Response(JSON.stringify(health), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
