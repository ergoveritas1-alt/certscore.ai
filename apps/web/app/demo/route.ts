import { NextResponse } from "next/server";
import { CALENDLY_DEMO_URL } from "../../lib/marketing/demo-url";

export function GET() {
  return NextResponse.redirect(CALENDLY_DEMO_URL, 307);
}
