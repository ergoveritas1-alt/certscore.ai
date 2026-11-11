import "server-only";

import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { cookies } from "next/headers";

export async function writeAuthCookies(responseHeaders: Headers) {
  const cookieStore = await cookies();
  for (const header of responseHeaders.getSetCookie()) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      cookieStore.set(name, attributes.value, toCookieOptions(attributes));
    }
  }
}
