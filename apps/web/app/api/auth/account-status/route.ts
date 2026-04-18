import { NextRequest, NextResponse } from "next/server";
import { hasBetterAuthPasswordAccount } from "../../../../server/better-auth/user";
import { findAppUserByEmail, normalizeEmail } from "../../../../server/auth-flows/user";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);
  const [appUser, hasPassword] = await Promise.all([findAppUserByEmail(normalizedEmail), hasBetterAuthPasswordAccount(normalizedEmail)]);

  return NextResponse.json({
    authProvider: appUser?.auth_provider ?? null,
    hasPassword
  });
}
