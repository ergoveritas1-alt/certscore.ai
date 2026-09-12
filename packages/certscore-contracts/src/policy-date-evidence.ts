/** Retain only date-bearing update statements, never nearby prose or headings. */
export function extractPolicyUpdateDateText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const month = "(?:Jan(?:uary|uar)?|Feb(?:ruary|ruar)?|Mar(?:ch|zo)?|Apr(?:il|ile)?|May|Mai|Jun(?:e|i)?|Jul(?:y|i)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Okt(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Dez(?:ember)?)";
  const date = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}|${month}\\s+(?:\\d{1,2},?\\s+)?\\d{4}|\\d{1,2}\\s+${month}\\s+\\d{4})`;
  return new RegExp(`\\b(?:last\\s+updated|effective\\s+date|updated)(?:\\s+on)?\\s*:?\\s*${date}\\b`, "i").exec(text)?.[0];
}
