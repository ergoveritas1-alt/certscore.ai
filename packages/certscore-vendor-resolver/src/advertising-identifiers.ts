/** Reviewed identity formats only. Values are inspected in memory and never
 * returned. Endpoint/source qualification remains the caller's responsibility. */
export function isAdvertisingIdentityValue(field: string, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (["hem", "ud[em]", "ud[ph]"].includes(field)) {
    return /^[a-f0-9]{64}$/i.test(value) && !/^0+$/.test(value) &&
      // SHA-256 of an empty string is not a customer identity.
      value.toLowerCase() !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }
  return value.length >= 3 && value.length <= 2048 &&
    !/^(?:0+|null|undefined|false|true|unknown|none|not.?set|redacted|\[redacted\]|\$.*)$/i.test(value) &&
    !/^0+(?:[-.]+0+)*$/.test(value) && /[a-z1-9]/i.test(value);
}
