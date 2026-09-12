const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
let codesByName: Map<string, string> | undefined;
function countryCode(value: string) {
  const normalized = value.trim();
  if (/^[a-z]{2}$/i.test(normalized)) {
    const code = normalized.toUpperCase();
    return code !== "ZZ" && regionNames.of(code) ? code : undefined;
  }
  if (!codesByName) {
    codesByName = new Map();
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b), name = regionNames.of(code);
      if (name && code !== "ZZ") codesByName.set(name.toLowerCase(), code);
    }
  }
  return codesByName.get(normalized.toLowerCase());
}
export function CountryLabel({ value }: { value?: string | null }) {
  const code = value ? countryCode(value) : undefined;
  const flag = code ? [...code].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("") : null;
  return <span className="inline-flex items-center gap-1">{flag ? <span aria-hidden="true">{flag}</span> : null}<span title={code ? regionNames.of(code) : undefined}>{value || "Unknown"}</span></span>;
}
