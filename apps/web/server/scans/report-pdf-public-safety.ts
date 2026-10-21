import { isIP } from "node:net";

export class UnsafeReportPdfContentError extends Error {
  constructor() { super("The PDF contains internal infrastructure details and cannot be exported."); }
}

function privateAddress(host: string): boolean {
  const hostname = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return true;
  if (isIP(hostname) === 4) {
    const [first, second] = hostname.split(".").map(Number);
    return first === 0 || first === 10 || first === 127 || first === 169 && second === 254 ||
      first === 172 && second! >= 16 && second! <= 31 || first === 192 && second === 168 ||
      first === 100 && second! >= 64 && second! <= 127;
  }
  if (isIP(hostname) !== 6) return false;
  const normalized = new URL(`http://[${hostname}]`).hostname.slice(1, -1);
  if (normalized === "::" || normalized === "::1" || /^f[cd]|^fe[89ab]/.test(normalized)) return true;
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(normalized);
  if (!mapped) return false;
  const high = parseInt(mapped[1]!, 16), low = parseInt(mapped[2]!, 16);
  return privateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

export function assertPublicReportPdfContent(values: string[]) {
  for (const value of values) {
    if (/\blocalhost\b|s3:\/\/|local-parity/i.test(value)) throw new UnsafeReportPdfContentError();
    for (const match of value.matchAll(/https?:\/\/[^\s<>"()]+/gi)) {
      try {
        if (privateAddress(new URL(match[0]).hostname)) throw new UnsafeReportPdfContentError();
      } catch (error) { if (error instanceof UnsafeReportPdfContentError) throw error; }
    }
    for (const match of value.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\[?[\da-f]*:[\da-f:]+\]?/gi)) {
      if (privateAddress(match[0])) throw new UnsafeReportPdfContentError();
    }
  }
}

export function publicReportPdfBaseUrl(value = "https://certscore.ai") {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    assertPublicReportPdfContent([url.origin]);
    return url.origin;
  } catch { return null; }
}
