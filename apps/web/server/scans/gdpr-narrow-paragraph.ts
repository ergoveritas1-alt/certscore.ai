/** Conservative verifier for an original retained HTML serialization, never an
 * HTML renderer. Incomplete/unsupported markup and concealed prose fail closed.
 * Empty decorative hidden nodes may remain, but cannot supply finding text. */
export function retainedParagraphHtmlMatchesText(html: string | undefined, text: string) {
  if (!html || html.length > 16_000 || !text || text.length > 1200) return false;
  const decode = (value: string): string | null => {
    let unsupported = false;
    const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]+);/gi, (_whole, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (entity.startsWith("#")) {
        const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code);
      } else if (named[entity.toLowerCase()] !== undefined) return named[entity.toLowerCase()]!;
      unsupported = true; return "";
    });
    return unsupported ? null : decoded;
  };
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const stack: Array<{ tag: string; concealed: boolean }> = [];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const pieces: string[] = [];
  let cursor = 0, roots = 0, elements = 0;
  while (cursor < html.length) {
    if (html[cursor] !== "<") {
      const end = html.indexOf("<", cursor);
      const decoded = decode(html.slice(cursor, end < 0 ? html.length : end));
      if (decoded === null || (decoded.trim() && (!stack.length || stack.at(-1)!.concealed))) return false;
      pieces.push(decoded); cursor = end < 0 ? html.length : end; continue;
    }
    if (html.startsWith("<!--", cursor)) {
      const end = html.indexOf("-->", cursor + 4);
      if (end < 0) return false;
      cursor = end + 3; continue;
    }
    let quote = "", end = cursor + 1;
    for (; end < html.length; end++) {
      const char = html[end]!;
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      else if (char === "<") return false;
    }
    if (quote || end >= html.length) return false;
    const token = /^<(\/?)([a-z][a-z\d:-]*)([\s\S]*?)>$/.exec(html.slice(cursor, end + 1));
    if (!token) return false;
    const tag = token[2]!.toLowerCase(), attributes = token[3]!;
    if (token[1]) {
      if (attributes.trim() || stack.pop()?.tag !== tag) return false;
    } else {
      if (++elements > 128 || stack.length >= 24 || /^(?:script|style|template|noscript|iframe|object|svg|math|textarea)$/.test(tag)) return false;
      if (!stack.length && ++roots > 1) return false;
      const attrs = new Map<string, string>();
      const attribute = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
      let consumed = 0, match: RegExpExecArray | null;
      while ((match = attribute.exec(attributes))) {
        const name = match[1]!.toLowerCase(), value = decode(match[2] ?? match[3] ?? match[4] ?? "");
        if (value === null || attrs.has(name)) return false;
        attrs.set(name, value); consumed = attribute.lastIndex;
      }
      if (attributes.slice(consumed).trim()) return false;
      const style = attrs.get("style") ?? "", classes = attrs.get("class") ?? "";
      const concealed = Boolean(stack.at(-1)?.concealed || attrs.has("hidden") || attrs.has("inert") ||
        attrs.get("aria-hidden")?.toLowerCase() === "true" ||
        /(?:^|\s)(?:hidden|hide|sr-only|visually-hidden|d-none|invisible|is-hidden)(?:\s|$)/i.test(classes) ||
        // Only empty styled decorations are accepted by this recovery path;
        // retained inline CSS is not proof that descendant prose was visible.
        Boolean(style.trim()));
      if (!voidTags.has(tag)) stack.push({ tag, concealed });
    }
    cursor = end + 1;
  }
  return roots === 1 && stack.length === 0 && normalize(pieces.join("")) === normalize(text);
}
