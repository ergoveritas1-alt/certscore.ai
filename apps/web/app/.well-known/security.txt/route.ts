const SECURITY_POLICY_URL = "https://certscore.ai/security";

export const SECURITY_TEXT = [
  "Contact: mailto:security@certscore.ai",
  `Contact: ${SECURITY_POLICY_URL}`,
  "Expires: 2027-08-23T23:59:59.000Z",
  "Preferred-Languages: en",
  "Canonical: https://certscore.ai/.well-known/security.txt",
  `Policy: ${SECURITY_POLICY_URL}`,
  ""
].join("\n");

export function GET() {
  return new Response(SECURITY_TEXT, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
