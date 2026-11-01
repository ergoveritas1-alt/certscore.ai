/** Byte verification and text validity are separate prerequisites. Decoding
 * must not replace malformed source bytes with invented Unicode characters. */
export function decodeBoundedPolicyText(body: Uint8Array): string {
  const invalid = () => new Error("Policy text artifact is not valid bounded UTF-8 text.");
  if (!body.byteLength || body.byteLength > 1_000_000 || body.includes(0)) throw invalid();
  try {
    return new TextDecoder("utf-8", {fatal:true}).decode(body).replace(/\s+/g, " ").trim();
  } catch {
    throw invalid();
  }
}
