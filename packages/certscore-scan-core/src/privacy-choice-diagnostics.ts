import { createHash } from "node:crypto";
import { privacyChoiceDiagnosticsSchema, PRIVACY_CHOICE_DIAGNOSTIC_BYTES, type PrivacyChoiceDiagnostics } from "@certscore/contracts";
import type { createPrivacyFrameContinuityProof } from "./privacy-frame-continuity";

/** Serialized into the existing two reads. No globals, actions or SDK calls.
 * The structural path is ephemeral and hashed before retention. */
export function createPrivacyChoiceDomDiagnostics(proof?: ReturnType<typeof createPrivacyFrameContinuityProof>, checkpoint: "first" | "second" = "first") {
  type Frame = { locator: string; locatorLimited: boolean; frameDocument: string | null; reason: string; depth: number };
  const unnamedControls: Array<{locator:string;locatorLimited:boolean;scope:"main"|"frame";tag:string;role:string;nameStates:number[];labelledByTruncated:boolean}> = [];
  const frames: Frame[] = [];
  const frameNodes: Element[] = [];
  // Queue only bounded references during inventory. Identity proof runs before
  // optional style/locator/name diagnostics in result(), sharing the same cap.
  const pendingFrames: Array<{element: Element; slot: number; deadline: number}> = [];
  const pendingUnnamed: Array<{element: Element; states: number[]; scope: "main"|"frame"; deadline: number}> = [];
  let frameSlots = 0;
  let frameDeadline = Infinity;
  const limits = new Set<string>();
  // Additional diagnostic work only consumes the existing read's time. This
  // 2 ms cooperative sub-cap cannot extend the existing 20 ms frame allowance.
  let workMs = 0;
  function locator(element: Element, deadline: number) {
    const parts: string[] = [];
    let node: Element | null = element;
    for (let depth = 0; node && depth < 16; depth++) {
      if (performance.now() >= deadline) { limits.add("diagnostic_time_limit"); break; }
      let sibling = node.previousElementSibling, index = 0;
      while (sibling && index < 64) { index++; sibling = sibling.previousElementSibling; }
      if (sibling) { limits.add("locator_limited"); return {locator:parts.join("/")+"/overflow",locatorLimited:true}; }
      const tag = node.tagName.toLowerCase();
      if (tag.length > 40) { limits.add("locator_limited"); return {locator:parts.join("/"),locatorLimited:true}; }
      parts.push(`${tag}:${index}`);
      const root = node.getRootNode();
      node = node.parentElement ?? (root.nodeType === 11 ? (root as ShadowRoot).host : null);
      if (!node && root.nodeType === 9 && root !== document) {
        try { node = (root as Document).defaultView?.frameElement ?? null; parts.push("frame-document"); } catch { /* Opaque frame. */ }
      }
    }
    if (node) limits.add("locator_limited");
    return {locator:parts.reverse().join("/"),locatorLimited:Boolean(node)};
  }
  function timedOut(deadline = Infinity) {
    if (workMs >= 2 || performance.now() >= deadline) { limits.add("diagnostic_time_limit"); return true; }
    return false;
  }
  function captureUnnamed(element: Element, states: number[], scope: "main"|"frame", deadline: number) {
    if (unnamedControls.length >= 8) { limits.add("unnamed_sample_truncated"); return; }
    if (timedOut(deadline)) return;
    const start = performance.now();
    try {
      const role = element.getAttribute("role");
      unnamedControls.push({...locator(element, Math.min(deadline, start + 2 - workMs)),scope,tag:element.tagName === "A" ? "a" : element.tagName === "BUTTON" ? "button" : "other",
        role:role === "button" || role === "link" ? role : role ? "other" : "none",
        nameStates:states,
        labelledByTruncated:(element.getAttribute("aria-labelledby")?.trim().split(/\s+/, 5).length ?? 0) > 4});
    } catch { limits.add("diagnostic_unavailable"); } finally { workMs += performance.now()-start; }
  }
  function captureFrame(element: Element, slot: number, deadline: number) {
    if (slot >= 4 || frames.length >= 4) { limits.add("frame_sample_truncated"); return; }
    if (timedOut(deadline)) return;
    const start = performance.now();
    try {
      let reason = "visible", depth = 0, node: Element | null = element;
      for (; node && depth < 16; depth++) {
        if (performance.now() >= deadline || workMs + performance.now()-start >= 2) { reason="time_limit"; limits.add("diagnostic_time_limit"); break; }
        const style = node.ownerDocument.defaultView?.getComputedStyle(node);
        reason = !style ? "style_unavailable" : style.display === "none" ? "display_none"
          : style.visibility === "hidden" ? "visibility_hidden" : style.visibility === "collapse" ? "visibility_collapse"
          : Number(style.opacity) === 0 ? "opacity_zero" : node.getAttribute("aria-hidden") === "true" ? "aria_hidden" : node.hasAttribute("inert") ? "inert" : "visible";
        if (reason !== "visible") break;
        node = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
      }
      if (reason === "style_unavailable") limits.add("diagnostic_unavailable");
      if (node && depth === 16) { reason="ancestor_limit"; limits.add("locator_limited"); }
      if (reason === "visible" && ![...element.getClientRects()].some(rect=>rect.width>0&&rect.height>0)) reason="no_rect";
      let frameDocument: string | null = null;
      try { const d=(element as HTMLIFrameElement).contentDocument; if(d?.defaultView) frameDocument=JSON.stringify([d.URL,d.defaultView.performance.timeOrigin]); } catch { /* Keep opaque identity unknown. */ }
      frames.push({...locator(element, Math.min(deadline, start + 2 - workMs)),frameDocument,reason,depth});
    } catch { limits.add("diagnostic_unavailable"); } finally { workMs += performance.now()-start; }
  }
  function unnamed(element: Element, names: readonly (readonly [string, string | null | undefined])[], scope: "main"|"frame", deadline = Infinity) {
    if (pendingUnnamed.length >= 8) { limits.add("unnamed_sample_truncated"); return; }
    if (timedOut(deadline)) return;
    const start = performance.now();
    pendingUnnamed.push({element, states:names.slice(0,6).map(([,value]) => value == null ? 0 : value.trim() ? 2 : 1), scope, deadline});
    workMs += performance.now()-start;
  }
  function frame(element: Element, slot: number, deadline: number) {
    frameSlots = Math.min(5, Math.max(frameSlots, slot + 1));
    frameDeadline = Math.min(frameDeadline, deadline);
    if (slot >= 4 || pendingFrames.length >= 4) { limits.add("frame_sample_truncated"); return; }
    const start = performance.now();
    pendingFrames.push({element,slot,deadline});
    // Retain the observed slot even when diagnostics expire. The identity helper
    // must report a time limit, never mistake an incomplete sample for no frames.
    frameNodes.push(element);
    workMs += performance.now()-start;
  }
  function result() {
    // Identity gets first use of the remaining shared two-millisecond allowance.
    // The original frame deadline still applies; optional detail gets no reset.
    let checkpointIdentity: ReturnType<ReturnType<typeof createPrivacyFrameContinuityProof>["finish"]> | undefined;
    if (proof) {
      if (frameSlots > 4) frameNodes.length = 5; // Overflow marker; no fifth reference/read.
      const start = performance.now();
      const deadline = Math.min(frameDeadline, start + Math.max(0, 2 - workMs));
      if (checkpoint === "first") proof.begin(document, frameNodes, deadline);
      else {
        checkpointIdentity = proof.finish(document, frameNodes, deadline);
        if (!frameSlots && !checkpointIdentity.frames.length) checkpointIdentity = undefined;
      }
      workMs += performance.now() - start;
      frameNodes.length = 0;
      if (checkpointIdentity?.limitations.includes("time_limit")) limits.add("diagnostic_time_limit");
    }
    for (const row of pendingFrames) captureFrame(row.element,row.slot,row.deadline);
    for (const row of pendingUnnamed) captureUnnamed(row.element,row.states,row.scope,row.deadline);
    pendingFrames.length = 0; pendingUnnamed.length = 0; frameNodes.length = 0;
    return {document:JSON.stringify([document.URL,performance.timeOrigin]),unnamedControls,frames,limitations:[...limits],
      ...(checkpointIdentity ? {checkpointIdentity} : {})};
  }
  return {unnamed,frame,result};
}

type Raw = ReturnType<ReturnType<typeof createPrivacyChoiceDomDiagnostics>["result"]>;
const hash = (value:string) => createHash("sha256").update(value).digest("hex");
export function buildPrivacyChoiceDiagnostics(first:Raw|undefined, second:Raw|undefined, inspectionSourceHash:string): PrivacyChoiceDiagnostics | undefined {
  if (!first) return undefined;
  const limitations = new Set([...first.limitations,...(second?.limitations??[])]);
  if (!second) limitations.add("second_checkpoint_unavailable");
  else if (first.document !== second.document) limitations.add("document_changed");
  const frameRead = (r:Raw["frames"][number]) => ({locatorHash:hash(JSON.stringify([first.document,r.locator])),locatorLimited:r.locatorLimited,
    frameDocumentHash:r.frameDocument ? hash(r.frameDocument) : null,reason:r.reason,depth:r.depth});
  const frames = first.frames.map(row=>{
    const matches = second?.frames.filter(r => r.locator === row.locator && !r.locatorLimited && !row.locatorLimited) ?? [];
    const match = first.document === second?.document && matches.length === 1 && first.frames.filter(r => r.locator === row.locator).length === 1 ? matches[0] : undefined;
    if(!match) limitations.add("frame_set_changed");
    if (match && row.frameDocument !== match.frameDocument) limitations.add("frame_document_changed");
    if (match && (row.reason !== match.reason || row.depth !== match.depth)) limitations.add("frame_state_changed");
    return {first:frameRead(row),second:match?frameRead(match):null};
  });
  if(second?.frames.some(row=>!first.frames.some(r=>r.locator===row.locator))) limitations.add("frame_set_changed");
  const result = {version:"privacy_choice_diagnostics.v1",inspectionSourceHash,firstDocumentHash:hash(first.document),secondDocumentHash:second?hash(second.document):null,
    identityBasis:"document_and_structural_locator_only",status:limitations.size?"limited":"captured",limitations:[...limitations],
    unnamedControls:first.unnamedControls.map(({locator,...row})=>({...row,locatorHash:hash(JSON.stringify([first.document,locator]))})),frames,
    ...(second?.checkpointIdentity ? {checkpointIdentity:second.checkpointIdentity} : {})};
  while (Buffer.byteLength(JSON.stringify(result)) > PRIVACY_CHOICE_DIAGNOSTIC_BYTES) {
    limitations.add("byte_limit");result.status="limited";result.limitations=[...limitations];
    if (result.unnamedControls.length) result.unnamedControls.pop();
    else if(result.frames.length) { result.frames.pop(); delete result.checkpointIdentity; }
    else if(result.checkpointIdentity) delete result.checkpointIdentity;
    else return undefined;
  }
  const parsed=privacyChoiceDiagnosticsSchema.safeParse(result);
  return parsed.success ? parsed.data : undefined;
}
