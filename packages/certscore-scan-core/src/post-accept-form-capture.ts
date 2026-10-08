import { createHash, randomUUID } from "node:crypto";
import type { Frame, Page } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { PRIVACY_EVIDENCE_LOCALE_REGISTRY, POST_ACCEPT_FORM_CAPTURE_MAX_BYTES, postAcceptFormCaptureSchema, type PostAcceptFormCapture } from "@certscore/contracts";
import { buildCollectionSurfaceInventory, type CollectionSurfaceCaptureRow } from "./collection-surface-inventory";

/** Bounded structured samples overlap the existing Accept window. They never
 * click forms, await screenshots or extend the action result deadline. */
export function startPostAcceptFormCapture(input: {
  page: Page; exactTargetUrl: string; parentScanStartedAtMs: number;
  actionDispatchedAtMs: number; windowMs: number; signal?: AbortSignal; documentChangedBeforeStart?: boolean;
}) {
  const { page } = input;
  const sessionId = randomUUID();
  const capture: PostAcceptFormCapture = {
    version: "post_accept_form_capture.v2", phase: "after_accept_click", sessionId,
    exactTargetSha256: createHash("sha256").update(input.exactTargetUrl).digest("hex"),
    actionDispatchedAtMs: input.actionDispatchedAtMs,
    status: "limited", reasonCodes: [], inspectedFrameCount: 0, candidateFrameCount: 0, frames: [],
  };
  let frozen = false, done = false, mainChanged = input.documentChangedBeforeStart === true;
  let result: PostAcceptFormCapture | undefined;
  let sampledFrames: Frame[] = [];
  const epochs = new Map<Frame, number>();
  const retained = new Map<string, { frame: Frame; epoch: number }>();
  const navigated = (frame: Frame) => {
    epochs.set(frame, (epochs.get(frame) ?? 0) + 1);
    if (frame === page.mainFrame()) mainChanged = true;
  };
  page.on("framenavigated", navigated);
  const reasons = new Set<PostAcceptFormCapture["reasonCodes"][number]>();
  const targetMatches = () => { try { const url = new URL(page.url()); url.hash = ""; return url.href === input.exactTargetUrl; } catch { return false; } };
  let deadline = input.parentScanStartedAtMs + input.actionDispatchedAtMs + input.windowMs;
  capture.window = { startedAtMs: input.actionDispatchedAtMs, endedAtMs: deadline - input.parentScanStartedAtMs,
    terminalSampleCompleted: false };
  const active = () => Date.now() < deadline && !frozen && !input.signal?.aborted && !page.isClosed() && !mainChanged && targetMatches();
  const hints = [...new Set(PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap(entry => [...entry.privacyPolicyLabels, ...entry.contextHints]).map(s => s.toLowerCase()))];
  const collect = async () => {
    if (!active()) return;
    done = false;
    const sampleStartedAtMs = Date.now();
    capture.inspectedFrameCount = 0;
    reasons.clear();
    const frames = page.frames(); sampledFrames = frames; capture.candidateFrameCount = frames.length;
    if (frames.length > 3) reasons.add("capture_limit");
    // Evaluations overlap the existing action observation and each other.
    await Promise.all(frames.slice(0, 3).map(async (frame, index) => {
      const epoch = epochs.get(frame) ?? 0;
      try {
        if (frame.parentFrame()) {
          const element = await frame.frameElement();
          const shown = await element.evaluate(node => {
            if (!(node instanceof Element)) return false;
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            let ancestor: Element | null = node;
            for (let depth = 0; ancestor && depth < 32; depth++, ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (ancestor.matches('[hidden], [inert], [aria-hidden="true"]') || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
            }
            return !ancestor;
          });
          await element.dispose();
          if (!shown) { if (active()) capture.inspectedFrameCount++; return; }
        }
        if (!active()) return;
        const snapshot = await frame.evaluate(({ hints, cmpSelectors }) => {
          // tsx/esbuild name preservation otherwise references a helper outside the serialized callback.
          const globalWithNameHelper = globalThis as typeof globalThis & { __name?: <T>(target: T) => T };
          globalWithNameHelper.__name ??= function(target) { return target; };
          const stopAt = performance.now() + 10;
          const documentToken = crypto.randomUUID();
          const safeUrl = (raw: string) => { if (!raw.trim()) return undefined; try { const url = new URL(raw, location.href); url.search = ""; url.hash = ""; url.username = ""; url.password = ""; return /^https?:$/.test(url.protocol) && url.href.length <= 500 ? url.href : undefined; } catch { return undefined; } };
          const pageUrl = safeUrl(location.href);
          if (!pageUrl) return null;
          let visibilityLimited = false;
          const visible = (node: Element) => {
            if (node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            let ancestor: Element | null = node;
            for (let depth = 0; ancestor && depth < 64; depth++, ancestor = ancestor.parentElement) {
              if (performance.now() >= stopAt) { visibilityLimited = true; return false; }
              const style = getComputedStyle(ancestor);
              if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
            }
            if (ancestor) visibilityLimited = true;
            return !ancestor;
          };
          const text = (node: Element) => {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            const parts: string[] = []; let count = 0;
            while (walker.nextNode() && count++ < 40 && performance.now() < stopAt) {
              const parent = walker.currentNode.parentElement;
              if (parent && !parent.closest('textarea, select, script, style, [contenteditable]') && visible(parent)) parts.push((walker.currentNode.textContent ?? '').slice(0, 600));
            }
            return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email redacted]');
          };
          const groups = new Map<Element, number>();
          const candidates = document.querySelectorAll('input, textarea, select');
          let truncated = candidates.length > 40;
          const rows: CollectionSurfaceCaptureRow[] = [];
          for (let i = 0; i < Math.min(candidates.length, 40); i++) {
            if (performance.now() >= stopAt) { truncated = true; break; }
            const node = candidates[i] as HTMLInputElement;
            if (['hidden', 'submit', 'button', 'reset', 'image'].includes(node.type) || !visible(node) || cmpSelectors.some(selector => node.closest(selector))) continue;
            const group = node.form ?? node.closest('form, [role="form"]');
            if (!group) { truncated = true; continue; }
            if (!groups.has(group)) groups.set(group, groups.size);
            const groupIndex = groups.get(group)!;
            if (groupIndex >= 2 || rows.filter(row => row.groupKey === String(groupIndex)).length >= 12) { truncated = true; continue; }
            const label = (node.getAttribute('aria-label') || Array.from(node.labels ?? []).map(text).join(' ') || node.getAttribute('placeholder') || node.getAttribute('name') || '').slice(0, 120);
            const notices: { text: string; association: "inside_form" | "adjacent_notice" | "described_by"; links: { label: string; url: string }[] }[] = [];
            if (!rows.some(row => row.groupKey === String(groupIndex))) {
              const blocks = Array.from(group.querySelectorAll('p, label, small, [role="note"]')).slice(0, 12).map(node => ({ node, association: 'inside_form' as 'inside_form' | 'adjacent_notice' | 'described_by' }));
              for (const id of (group.getAttribute('aria-describedby') ?? '').split(/\s+/).slice(0, 2)) { const node = document.getElementById(id); if (node) blocks.push({node, association:'described_by'}); }
              const parent = group.parentElement;
              if (parent && !parent.matches('body, main, footer, nav') && parent.querySelectorAll('form, [role="form"]').length === 1) {
                for (const node of [group.previousElementSibling, group.nextElementSibling]) if (node?.matches('p, small, [role="note"]')) blocks.push({node, association:'adjacent_notice'});
              }
              for (const block of blocks) {
                if (performance.now() >= stopAt) { truncated = true; break; }
                if (!visible(block.node) || block.node.closest('footer, nav') || (block.node.closest('form, [role="form"]') && block.node.closest('form, [role="form"]') !== group)) continue;
                const value = text(block.node);
                if (!hints.some(hint => value.toLowerCase().includes(hint))) continue;
                const links = Array.from(block.node.querySelectorAll('a[href]')).slice(0, 2).flatMap(a => {
                  const label = (a.textContent ?? '').trim().slice(0, 100), url = safeUrl(a.getAttribute('href') ?? '');
                  return url && label && hints.some(hint => label.toLowerCase().includes(hint)) ? [{label,url}] : [];
                });
                notices.push({text:value, association:block.association, links}); break;
              }
            }
            const kind = ['checkbox', 'radio'].includes(node.type) ? node.type as 'checkbox' | 'radio' : undefined;
            rows.push({ groupKey: String(groupIndex), structure: group.tagName === 'FORM' ? 'native_form' as const : 'role_form' as const,
              title: (group.getAttribute('aria-label') ?? group.querySelector('legend, h1, h2, h3')?.textContent ?? '').trim().slice(0,120) || undefined,
              method: group.getAttribute('method') ?? (group.tagName === 'FORM' ? 'get' : undefined), elementType: node.tagName.toLowerCase() as 'input' | 'textarea' | 'select', inputType: node.type || node.tagName.toLowerCase(), label: label || undefined,
              required: node.required, disabled: node.disabled, readOnly: node.readOnly === true, domOrder: i,
              ...(kind ? {controlKind:kind, checkedState: node.checked ? 'checked' as const : 'unchecked' as const} : {}),
              ...(notices.length ? {privacyDisclosure:{version:1 as const, excerpts:notices, truncated: true}} : {}),
            });
          }
          return { pageUrl, documentToken, documentReadyState: document.readyState, rows, candidateScanTruncated: truncated || visibilityLimited, inspectedFieldCandidateCount: Math.min(candidates.length,40) };
        }, { hints, cmpSelectors: KNOWN_CMP_REGISTRY.flatMap(cmp => cmp.formExclusionSelectors ?? cmp.domSelectors ?? []) });
        if (!active()) return;
        if (!snapshot || frame.isDetached() || epoch !== (epochs.get(frame) ?? 0)) { reasons.add("frame_unavailable"); return; }
        const capturedAtMs = Date.now() - input.parentScanStartedAtMs;
        const inventory = buildCollectionSurfaceInventory(snapshot, input.parentScanStartedAtMs);
        capture.inspectedFrameCount++;
        if (inventory.coverage.status !== "complete") reasons.add(snapshot.documentReadyState === "loading" ? "document_loading" : "capture_limit");
        const frameRef = `accept_frame_${index}`;
        const forms = inventory.forms.map(form => ({...form,
          formRef: `${frameRef}_${form.formRef}`,
          evidenceRefs: [{refId:`${frameRef}_${form.formRef}`,artifactId:"post_accept_forms",eventType:"after_accept_form"}],
          fields: form.fields.map(field => ({...field, evidenceRefs:[{refId:`${frameRef}_${field.fieldRef}`,artifactId:"post_accept_forms",eventType:"after_accept_field"}]})),
        }));
        const frameRow = {frameRef, documentToken:snapshot.documentToken, documentUrl:snapshot.pageUrl, capturedAtMs, forms};
        const nextFrames = [...capture.frames.filter(row => row.frameRef !== frameRef), frameRow];
        if (Buffer.byteLength(JSON.stringify({...capture, frames:nextFrames})) > POST_ACCEPT_FORM_CAPTURE_MAX_BYTES - 200) { reasons.add("capture_limit"); return; }
        capture.frames = nextFrames; retained.set(frameRef,{frame,epoch});
      } catch { if (!frozen) reasons.add("frame_unavailable"); }
    }));
    if (!frozen) {
      done = true;
      if (active() && sampleStartedAtMs >= deadline - 300) capture.window!.terminalSampleCompleted = true;
      if (active() && Date.now() < deadline - 150) schedule();
    }
  };
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { void collect(); }, Math.max(0, Math.min(500, deadline - 150 - Date.now())));
    timer.unref?.();
  };
  timer = setTimeout(() => { void collect(); }, Math.min(250, Math.max(0, input.windowMs / 2)));
  timer.unref?.();
  return {
    continueThrough(confirmedAtMs: number, windowMs: number) {
      if (frozen || mainChanged || input.signal?.aborted) return;
      deadline = input.parentScanStartedAtMs + confirmedAtMs + windowMs;
      capture.window = { startedAtMs: confirmedAtMs, endedAtMs: deadline - input.parentScanStartedAtMs, terminalSampleCompleted: false };
      if (done) schedule();
    },
    finish(): PostAcceptFormCapture {
    if (result) return result;
    clearTimeout(timer); frozen = true; page.off("framenavigated", navigated);
    if (!done || !capture.window!.terminalSampleCompleted || capture.inspectedFrameCount < capture.candidateFrameCount && !reasons.size) reasons.add("window_ended");
    if (page.frames().some(frame => !sampledFrames.includes(frame))) reasons.add("frame_unavailable");
    if (input.signal?.aborted) { reasons.add("cancelled"); capture.frames = []; }
    if (mainChanged || page.isClosed() || !targetMatches()) { reasons.add("document_changed"); capture.frames = []; }
    capture.frames = capture.frames.filter(row => { const binding = retained.get(row.frameRef)!; const valid = !binding.frame.isDetached() && binding.epoch === (epochs.get(binding.frame) ?? 0); if (!valid) reasons.add("document_changed"); return valid; });
    capture.frames.sort((a,b)=>a.frameRef.localeCompare(b.frameRef));
    capture.reasonCodes = [...reasons]; capture.status = reasons.size ? "limited" : "captured";
    const parsed = postAcceptFormCaptureSchema.safeParse(capture);
    result = parsed.success ? parsed.data : postAcceptFormCaptureSchema.parse({
      ...capture, status: "limited", reasonCodes: ["capture_invalid"], frames: [], inspectedFrameCount: 0,
    });
    return result;
  }};
}
