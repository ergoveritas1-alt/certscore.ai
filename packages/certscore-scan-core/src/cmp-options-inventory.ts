/** Single existing browser inventory read. States are diagnostic, not feature
 * absence. Canonical label classification and action authorization stay outside
 * this callback; no scroll, click, retry or API opening is performed here. */
export function readCmpOptionsInventory(nodes: Element[], input: { registeredSelector?: string }) {
  const deadline = performance.now() + 50;
  return { overflow: nodes.length > 100, fields: nodes.slice(0, 100).map(element => {
    const label = (element.textContent ?? "").trim().slice(0, 240);
    const ariaLabel = element.getAttribute("aria-label"), value = (element as HTMLInputElement).value;
    let access: "actionable" | "hidden" | "disabled" | "outside_viewport" | "covered" | "unavailable" = "unavailable";
    if (performance.now() < deadline) {
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) access = "hidden";
      else {
        let ancestor: Element | null = element;
        for (let depth = 0; ancestor && depth < 64; depth++) {
          if (performance.now() >= deadline) break;
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility !== "visible" || style.opacity === "0" || ancestor.matches('[hidden], [aria-hidden="true" i]')) { access = "hidden"; break; }
          if (ancestor.matches('[inert]') || ancestor === element && (element.matches(':disabled, [aria-disabled="true" i]') || style.pointerEvents === "none")) { access = "disabled"; break; }
          const root = ancestor.getRootNode();
          ancestor = ancestor.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        }
        if (!ancestor && performance.now() < deadline) {
          const x = box.left + box.width / 2, y = box.top + box.height / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) access = "outside_viewport";
          else {
            let hit = document.elementFromPoint(x,y);
            for (let depth=0; hit?.shadowRoot && depth<12; depth++) { const inner=hit.shadowRoot.elementFromPoint(x,y); if(!inner || inner===hit)break;hit=inner; }
            access = hit === element || Boolean(hit && element.contains(hit)) ? "actionable" : "covered";
          }
        }
      }
    }
    return { label, ariaLabel, value, access, registered: Boolean(input.registeredSelector && element.matches(input.registeredSelector)) };
  }) };
}
