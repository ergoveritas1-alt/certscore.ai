import {classifyPrivacySurface} from "@certscore/contracts";

/** Prefer explicit policy labels over broad privacy portals when the bounded
 * hit-test has room for only one document scroll. Classification stays canonical. */
export function privacyPolicyLinkCandidates<T extends {index:number;url:string;label:string}>(links:T[]):T[] {
  return links.map(link=>({link,classification:classifyPrivacySurface({linkText:link.label,url:link.url})}))
    .filter(({link,classification:c})=>link.url.length<=2000 && /^https?:/.test(link.url) &&
      (c.surfaceType === "privacy_policy" || c.variant === "combined_privacy_cookie_surface"))
    .sort((a,b)=>b.classification.confidence-a.classification.confidence)
    .slice(0,16).map(({link})=>link);
}

/** Self-contained browser callback, reused inside the existing link reads.
 * Optional single document scroll is bounded by the same read slice and restored.
 * No click, fetch, retry or navigation. A miss is not evidence
 * that a banner caused it. Geometry/style/hit work shares a bounded read slice. */
export function readPrivacyLinkAccess(nodes: Element[], input: {
  candidates?: Array<{index: number; url: string; label: string}>;
  allowOneDocumentScroll?: boolean;
}) {
  const deadline = performance.now() + 50;
  const candidates = input.candidates ?? nodes.slice(0, 300).map((node, index) => ({
    index, url: (node as HTMLAnchorElement).href,
    label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 160),
  }));
  let scrollUsed = false;
  return candidates.flatMap(candidate => {
    const a = nodes[candidate.index] as HTMLAnchorElement | undefined;
    // A changed identity cannot inherit the earlier link's diagnostic.
    if (!a?.isConnected || a.href !== candidate.url ||
      (a.getAttribute("aria-label") ?? a.textContent ?? "").trim().slice(0, 160) !== candidate.label) return [];
    let outcome: "reachable" | "outside_viewport" | "not_rendered" | "hidden" | "transparent" | "inactive" | "pointer_disabled" | "hit_target_missed" | "inspection_incomplete" = "inspection_incomplete";
    let scroll: { version: "privacy_link_scroll.v1"; initialOutcome: "outside_viewport"; beforeY: number; inspectedY: number; restored: boolean } | undefined;
    const beforeX = scrollX, beforeY = scrollY;
    try {
    if (performance.now() < deadline) {
      let boxes = a.getClientRects();
      // One offscreen candidate, never a hidden/inert link or a nested scroller.
      // A fresh geometry/hit test below must establish reachability; scrolling
      // alone proves nothing. Restore the viewport before returning to CMP work.
      if (input.allowOneDocumentScroll && !scrollUsed && boxes.length > 0 && boxes.length <= 3 &&
          (boxes[0]!.bottom <= 0 || boxes[0]!.top >= innerHeight) &&
          getComputedStyle(a).visibility === "visible" && !a.closest('[hidden],[inert],[aria-hidden="true" i]') &&
          performance.now() < deadline) {
        scrollUsed = true;
        window.scrollBy({ top: boxes[0]!.top + boxes[0]!.height / 2 - innerHeight / 2, behavior: "instant" });
        scroll = { version: "privacy_link_scroll.v1", initialOutcome: "outside_viewport", beforeY, inspectedY: scrollY, restored: false };
        boxes = a.getClientRects();
      }
      const visibleBoxes: Array<{left:number;right:number;top:number;bottom:number}> = [];
      for (let index = 0; index < Math.min(3, boxes.length); index++) {
        const box = boxes[index]!;
        const left = Math.max(0,box.left),right = Math.min(innerWidth,box.right),top = Math.max(0,box.top),bottom = Math.min(innerHeight,box.bottom);
        if (right > left && bottom > top) visibleBoxes.push({left,right,top,bottom});
      }
      outcome = boxes.length === 0 ? "not_rendered" : !visibleBoxes.length ? boxes.length > 3 ? "inspection_incomplete" : "outside_viewport" : "hit_target_missed";
      if (visibleBoxes.length) {
        let current: Element | null = a;
        for (let depth = 0; current && depth < 64; depth++) {
          if (performance.now() >= deadline) { outcome = "inspection_incomplete"; break; }
          const style = getComputedStyle(current);
          if (current.matches('[hidden], [aria-hidden="true" i]') || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") { outcome = "hidden"; break; }
          if (current.matches('[inert]')) { outcome = "inactive"; break; }
          if (style.opacity === "0") { outcome = "transparent"; break; }
          // Only the link's computed value: descendants can override an ancestor.
          if (current === a && style.pointerEvents === "none") { outcome = "pointer_disabled"; break; }
          const root = current.getRootNode();
          current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        }
        if (current && outcome === "hit_target_missed") outcome = "inspection_incomplete";
        if (outcome === "hit_target_missed") for (const box of visibleBoxes) {
          for (const [x,y] of [[.5,.5],[.25,.25],[.75,.75]]) {
            if (performance.now() >= deadline) { outcome = "inspection_incomplete"; break; }
            const px=box.left+(box.right-box.left)*x!,py=box.top+(box.bottom-box.top)*y!;
            let hit=document.elementFromPoint(px,py);
            for (let depth=0;hit?.shadowRoot && depth<8;depth++) {
              const inner=hit.shadowRoot.elementFromPoint(px,py);if(!inner || inner===hit)break;hit=inner;
            }
            if (hit && (a===hit || a.contains(hit))) {outcome="reachable";break;}
          }
          if(outcome!=="hit_target_missed")break;
        }
      }
    }
    } finally {
      if (scroll) {
        window.scrollTo({ left: beforeX, top: beforeY, behavior: "instant" });
        scroll.restored = scrollX === beforeX && scrollY === beforeY;
        if (!scroll.restored) outcome = "inspection_incomplete";
      }
    }
    if (!a.isConnected || a.href !== candidate.url ||
      (a.getAttribute("aria-label") ?? a.textContent ?? "").trim().slice(0, 160) !== candidate.label) return [];
    return [{...candidate,hitTargetBeforeAction:outcome==="reachable",access:{version:scroll ? "privacy_link_access.v2" as const : "privacy_link_access.v1" as const,outcome,...(scroll ? {scroll} : {})}}];
  });
}
