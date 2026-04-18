import { NextResponse } from "next/server";
import { getDatabaseHealth } from "../../../../server/health/get-database-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDatabaseHealth();

  return NextResponse.json(health, {
    headers: {
      "Cache-Control": "no-store"
    },
    status: health.ok ? 200 : 500
  });
}
