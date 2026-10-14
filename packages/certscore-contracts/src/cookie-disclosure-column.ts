export type CookieDisclosureColumn =
  | "cookieName"
  | "provider"
  | "duration"
  | "purpose";

const COOKIE_DISCLOSURE_HEADER_PATTERNS: Record<CookieDisclosureColumn, RegExp> = {
  cookieName: /^(?:cookie name|name of cookie|cookie|nom du cookie|nombre de la cookie|nombre de cookie|nome del cookie|cookienaam|cookie naam|nazwa pliku cookie)$/i,
  provider: /^(?:provider|vendor|service provider|fournisseur|proveedor|fornitore|aanbieder|dostawca)$/i,
  duration: /^(?:expiry|expiration|expires|duration|lifetime|retention|caducidad|duree|expiration du cookie|scadenza|durata|vervaldatum|looptijd|wygasniecie)$/i,
  purpose: /^(?:purpose|description|function|use|usage|finalite|fonction|finalidad|funcion|scopo|funzione|doel|functie|cel|przeznaczenie)$/i,
};

export function normalizeCookieDisclosureHeader(value: string) {
  return value.replace(/\s+/g, " ").trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_|:–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cookieDisclosureColumn(value: string): CookieDisclosureColumn | null {
  const normalized = normalizeCookieDisclosureHeader(value);
  for (const [column, pattern] of Object.entries(COOKIE_DISCLOSURE_HEADER_PATTERNS) as Array<
    [CookieDisclosureColumn, RegExp]
  >) {
    if (pattern.test(normalized)) {
      return column;
    }
  }
  return null;
}

