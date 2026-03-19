import { NextResponse } from "next/server";
import { getSupabaseHealth } from "../../../../server/health/get-supabase-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getSupabaseHealth();

  return NextResponse.json(health, {
    headers: {
      "Cache-Control": "no-store"
    },
    status: health.ok ? 200 : 500
  });
}
