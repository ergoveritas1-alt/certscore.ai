import { NextRequest, NextResponse } from "next/server";
import { findAppUserByEmail, findPasswordAuthUserByEmail, normalizeEmail } from "../../../../server/password-auth/user";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);
  const [appUser, passwordUser] = await Promise.all([
    findAppUserByEmail(normalizedEmail),
    findPasswordAuthUserByEmail(normalizedEmail)
  ]);

  return NextResponse.json({
    authProvider: appUser?.auth_provider ?? null,
    hasPassword: Boolean(passwordUser)
  });
}
