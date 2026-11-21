export function exactAcceptSelectorCaptureEnabled(): boolean {
  return process.env.CERTSCORE_LOCAL_ACCEPT_FIRST_LAYER_GATE === "1" ||
    process.env.CERTSCORE_LOCAL_ACCEPT_GATE_SHADOW === "1" ||
    process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_SHADOW === "1";
}

export function localExactRejectControlEnabled(): boolean {
  return process.env.CERTSCORE_LOCAL_REJECT_EXACT_CONTROL === "1";
}

export function exactRejectSelectorCaptureEnabled(): boolean {
  return localExactRejectControlEnabled() || process.env.CERTSCORE_LOCAL_REJECT_GATE_SHADOW === "1" ||
    process.env.CERTSCORE_REJECT_GATE_PRODUCTION_SHADOW === "1";
}

/** Runs as part of the existing passive browser reads. Only return a selector
 * that resolves to this one native button in the main document. */
export function exactNativeConsentButtonSelector(element: Element): string | undefined {
  const root = element.ownerDocument;
  const view = root.defaultView;
  if (!view || view !== view.top || element.localName !== "button" || element.getRootNode() !== root) return undefined;

  const resolvesOnly = (selector: string, expected: Element) => {
    if (selector.length > 512) return false;
    try {
      const matches = root.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === expected;
    } catch {
      return false;
    }
  };
  const anchors = (node: Element) => {
    const hints: string[] = [];
    const id = node.getAttribute("id");
    if (id && id.length <= 80) hints.push("#" + CSS.escape(id));
    for (const name of ["data-testid", "aria-label"]) {
      const value = node.getAttribute(name);
      if (value && value.length <= 80) hints.push(node.localName + "[" + name + '="' + CSS.escape(value) + '"]');
    }
    const classes = Array.from(node.classList).slice(0, 4);
    for (const name of classes) {
      if (name.length <= 80) hints.push(node.localName + "." + CSS.escape(name));
    }
    return hints;
  };

  const direct = anchors(element).find(hint => resolvesOnly(hint, element));
  if (direct) return direct;
  // Each segment identifies the exact position among siblings of the same
  // type. Validate the fully scoped selector against the original element.
  let path = "";
  let node: Element | null = element;
  for (let depth = 0; node && depth < 6 && node !== root.body; depth++, node = node.parentElement) {
    if (path) {
      const prefix = anchors(node).find(hint => resolvesOnly(hint, node!));
      if (prefix) {
        const scoped = prefix + " > " + path;
        if (resolvesOnly(scoped, element)) return scoped;
      }
    }
    let index = 1;
    let sibling = node.previousElementSibling;
    for (let inspected = 0; sibling && inspected < 32; inspected++, sibling = sibling.previousElementSibling) {
      if (sibling.localName === node.localName) index++;
    }
    if (sibling) return undefined;
    const segment = CSS.escape(node.localName) + ":nth-of-type(" + index + ")";
    path = path ? segment + " > " + path : segment;
    if (resolvesOnly(path, element)) return path;
  }
  return undefined;
}
