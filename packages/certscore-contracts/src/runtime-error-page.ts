/** Closed, retained page templates. A phrase in an article or a successful
 * transport alone is not a page-state observation. No browser work is added. */
export function classifyRuntimeErrorPage(text: string | null | undefined):
  "not_found_404" | "maintenance_or_unavailable" | "unsupported_region" | undefined {
  if (!text) return undefined;
  const bounded = text.slice(0, 4096).replace(/\s+/g, " ").trim();
  if (text.length <= 256 && /^OOPS!!!\s+WE ARE CURRENTLY NOT AVAILABLE IN YOUR REGION\.$/i.test(bounded)) {
    return "unsupported_region";
  }
  const soft404 = /\b404\s*\|?\s*OOPS! WE['’]RE SORRY\.\s+This page doesn['’]t exist, or you can['’]t access it\.\s+Main Page\s*\|\s*Your Apps\s*\|\s*Help Center\s*\|\s*Resources\b/i.exec(bounded);
  if (soft404) {
    const prefix = bounded.slice(0, soft404.index);
    // The reviewed shell has navigation before its error heading. Quoted
    // examples and explanatory prose must not borrow that heading as page state.
    if (prefix.length <= 1024 && !/[.:!?"'‘’“”`]/u.test(prefix) &&
        !/\b(?:example|sample|guide|tutorial|troubleshooting)\b/i.test(prefix)) return "not_found_404";
  }
  if (/^(?:Skip to main content\s+)?Temporary service interruption\s+Our systems are currently overloaded\. To protect your data, we['’]ve paused this feature\.\s+Refresh(?:\s+[\ue000-\uf8ff]\s+(?:Download|Notifications|Chats|Feedback)){0,4}$/i.test(bounded)) {
    return "maintenance_or_unavailable";
  }
  return undefined;
}
