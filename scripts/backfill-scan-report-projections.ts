async function main() {
  const baseUrl = (process.env.SCAN_PROJECTION_BACKFILL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const limit = Math.min(Math.max(Number.parseInt(process.env.SCAN_PROJECTION_BACKFILL_LIMIT ?? "1000", 10) || 1000, 1), 500);
  const response = await fetch(`${baseUrl}/api/internal/scan-report-projection-backfill`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.SCAN_PROJECTION_BACKFILL_SECRET
        ? { "x-scan-projection-backfill-secret": process.env.SCAN_PROJECTION_BACKFILL_SECRET }
        : {})
    },
    body: JSON.stringify({ limit })
  });
  const payload = await response.json().catch(() => ({}));
  console.log(JSON.stringify(payload));
  if (!response.ok || payload.status === "partial") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
