const sessionCookieNames = new Set([
  "session_token",
  "__Secure-session_token",
  "certscore.session_token",
  "__Secure-certscore.session_token",
  "certscore_session"
]);

export function isRecognizedSessionCookieName(cookieName: string) {
  return sessionCookieNames.has(cookieName);
}
