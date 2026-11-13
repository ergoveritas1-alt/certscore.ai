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
  const captureClock = input.parentScanStartedAtMs;
  const sessionId = randomUUID();
  const capture: PostAcceptFormCapture = {
    version: "post_accept_form_capture.v2", phase: "after_accept_click", sessionId,
    exactTargetSha256: createHash("sha256").update(input.exactTargetUrl).digest("hex"),
    actionDispatchedAtMs: input.actionDispatchedAtMs,
    status: "limited", reasonCodes: [], inspectedFrameCount: 0, candidateFrameCount: 0, frames: [],
  };
  let frozen = false, mainChanged = input.documentChangedBeforeStart === true;
  let result: PostAcceptFormCapture | undefined;
  let sampledFrames: Frame[] = [];
  const epochs = new Map<Frame, number>();
  let mainDocumentBinding: PostAcceptFormCapture["frames"][number]["documentBinding"];
  const retained = new Map<string, { frame: Frame; epoch: number }>();
  const inspected = new Map<Frame, number>();
  const stableForms = new Map<Frame, {epoch: number; signature: string; since: number; sampledAt: number}>();
  const inFlight = new Set<Frame>();
  // Three reusable sampling slots preserve the original concurrency and cadence.
  // Hidden helpers consume one sample, not a permanent place in the frame panel.
  const slots: Array<{ frame?: Frame; nextAt: number }> = Array.from({length: 3}, () => ({nextAt: 0}));
  const visibility = new Map<Frame, {epoch: number; shown: boolean}>();
  const selectedFrames = () => slots.flatMap(slot => slot.frame ? [slot.frame] : []);
  const completed = new Map<Frame, {epoch: number; index: number; startedAtMs: number}>();
  const frameReasons = new Map<Frame, {epoch: number; index: number; reasons: Set<PostAcceptFormCapture["reasonCodes"][number]>}>();
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
  const sampleFrame = async (frame: Frame, index: number, epoch: number, sampleStartedAtMs: number,
    sampleReasons: Set<PostAcceptFormCapture["reasonCodes"][number]>) => {
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
        if (active() && !frame.isDetached() && epoch === (epochs.get(frame) ?? 0)) visibility.set(frame, {epoch, shown});
        if (!shown) {
          if (active() && !frame.isDetached() && epoch === (epochs.get(frame) ?? 0) && page.frames()[index] === frame) {
            inspected.set(frame, epoch);
            capture.frames = capture.frames.filter(row => retained.get(row.frameRef)?.frame !== frame);
          }
          return;
        }
      }
      if (!active()) return;
      if (frame.isDetached() || epoch !== (epochs.get(frame) ?? 0) || page.frames()[index] !== frame) {
        sampleReasons.add("frame_unavailable"); return;
      }
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
          const labelledBy = (node.getAttribute('aria-labelledby') ?? '').split(/\s+/).slice(0, 4)
            .map(id => id ? document.getElementById(id) : null).filter((element): element is HTMLElement => element !== null).map(text).join(' ');
          const label = (labelledBy || node.getAttribute('aria-label') || Array.from(node.labels ?? []).map(text).join(' ') || node.getAttribute('placeholder') || node.getAttribute('name') || '').slice(0, 120);
          const notices: { text: string; association: "inside_form" | "adjacent_notice" | "described_by"; links: { label: string; url: string }[] }[] = [];
          if (!rows.some(row => row.groupKey === String(groupIndex))) {
            const blocks = Array.from(group.querySelectorAll('p, label, small, [role="note"]')).slice(0, 12).map(node => ({ node, association: 'inside_form' as 'inside_form' | 'adjacent_notice' | 'described_by' }));
            for (const id of (group.getAttribute('aria-describedby') ?? '').split(/\s+/).slice(0, 2)) { const node = document.getElementById(id); if (node) blocks.push({node, association:'described_by'}); }
            // Only direct neighbors of the form or its single exclusive wrapper.
            const exclusive = (node: Element | null): node is Element => Boolean(node &&
              !node.matches('body, main, header, footer, nav') && node.querySelectorAll('form, [role="form"]').length === 1);
            const parent = group.parentElement;
            const scopes: Element[] = [group];
            if (exclusive(parent) && !parent.querySelector('header, footer, nav') && exclusive(parent.parentElement)) scopes.push(parent);
            for (const scope of scopes) {
              if (!exclusive(scope.parentElement)) continue;
              for (const neighbor of [scope.previousElementSibling, scope.nextElementSibling]) {
                if (!neighbor || neighbor.matches('header, footer, nav, form, [role="form"]') ||
                  neighbor.querySelector('form, [role="form"], input, textarea, select, header, footer, nav')) continue;
                const notices = neighbor.matches('p, small, [role="note"], a[href]') ? [neighbor] :
                  neighbor.matches('div, span') ? Array.from(neighbor.querySelectorAll('p, small, [role="note"], a[href]')).slice(0, 8) : [];
                for (const node of notices) blocks.push({node, association:'adjacent_notice'});
              }
            }
            for (const block of blocks) {
              if (performance.now() >= stopAt) { truncated = true; break; }
              if (!visible(block.node) || block.node.matches('header, footer, nav') || block.node.closest('nav, [contenteditable="true"]') ||
                (block.association === 'described_by' && block.node.closest('footer') && !group.contains(block.node)) ||
                (block.node.closest('form, [role="form"]') && block.node.closest('form, [role="form"]') !== group)) continue;
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
          let actionHostname: string | undefined;
          try { if (group.tagName === 'FORM') actionHostname = new URL(group.getAttribute('action') || location.href, location.href).hostname || undefined; } catch {}
          rows.push({ groupKey: String(groupIndex), structure: group.tagName === 'FORM' ? 'native_form' as const : 'role_form' as const,
            title: (group.getAttribute('aria-label') ?? group.querySelector('legend, h1, h2, h3')?.textContent ?? '').trim().slice(0,120) || undefined,
            method: group.getAttribute('method') ?? (group.tagName === 'FORM' ? 'get' : undefined), actionHostname,
            elementType: node.tagName.toLowerCase() as 'input' | 'textarea' | 'select', inputType: node.type || node.tagName.toLowerCase(), label: label || undefined,
            required: node.required, disabled: node.disabled, readOnly: node.readOnly === true, domOrder: i,
            ...(kind ? {controlKind:kind, checkedState: node.checked ? 'checked' as const : 'unchecked' as const} : {}),
            ...(notices.length ? {privacyDisclosure:{version:1 as const, excerpts:notices, truncated: true}} : {}),
          });
        }
        return { pageUrl, documentToken, documentReadyState: document.readyState, rows, candidateScanTruncated: truncated || visibilityLimited, inspectedFieldCandidateCount: Math.min(candidates.length,40) };
      }, { hints, cmpSelectors: KNOWN_CMP_REGISTRY.flatMap(cmp => cmp.formExclusionSelectors ?? cmp.domSelectors ?? []) });
      if (!active()) return;
      if (!snapshot || frame.isDetached() || epoch !== (epochs.get(frame) ?? 0) || page.frames()[index] !== frame) { sampleReasons.add("frame_unavailable"); return; }
      const capturedAtMs = Date.now() - input.parentScanStartedAtMs;
      const inventory = buildCollectionSurfaceInventory(snapshot, input.parentScanStartedAtMs);
      inspected.set(frame, epoch);
      if (inventory.coverage.status !== "complete") sampleReasons.add(snapshot.documentReadyState === "loading" ? "document_loading" : "capture_limit");
      const frameRef = `accept_frame_${index}`;
      const forms = inventory.forms.map(form => ({...form,
        formRef: `${frameRef}_${form.formRef}`,
        evidenceRefs: [{refId:`${frameRef}_${form.formRef}`,artifactId:"post_accept_forms",eventType:"after_accept_form"}],
        fields: form.fields.map(field => ({...field, evidenceRefs:[{refId:`${frameRef}_${field.fieldRef}`,artifactId:"post_accept_forms",eventType:"after_accept_field"}]})),
      }));
      const frameRow = {frameRef, documentToken:snapshot.documentToken, documentUrl:snapshot.pageUrl, capturedAtMs, forms,
        ...(frame === page.mainFrame() && mainDocumentBinding &&
          sampleStartedAtMs >= input.parentScanStartedAtMs + mainDocumentBinding.boundAtMs
          ? {documentBinding:mainDocumentBinding} : {})};
      const nextFrames = [...capture.frames.filter(row => row.frameRef !== frameRef && retained.get(row.frameRef)?.frame !== frame), frameRow];
      if (Buffer.byteLength(JSON.stringify({...capture, frames:nextFrames})) > POST_ACCEPT_FORM_CAPTURE_MAX_BYTES - 200) { sampleReasons.add("capture_limit"); return; }
      capture.frames = nextFrames; retained.set(frameRef,{frame,epoch});
      const signature = JSON.stringify(forms);
      const previous = stableForms.get(frame);
      if (sampleReasons.size || !forms.some(form => form.fields.length > 0)) stableForms.delete(frame);
      else stableForms.set(frame, {epoch, signature, sampledAt: sampleStartedAtMs,
        since: previous?.epoch === epoch && previous.signature === signature ? previous.since : sampleStartedAtMs});
    } catch { if (!frozen) sampleReasons.add("frame_unavailable"); }
  };
  const updateTerminalCoverage = (frames: Frame[]) => {
    capture.window!.terminalSampleCompleted = !mainChanged && !input.signal?.aborted && !page.isClosed() && targetMatches() &&
      inFlight.size === 0 && frames.length > 0 && selectedFrames().length > 0 && selectedFrames().every(frame => {
        const index = frames.indexOf(frame);
        const sample = completed.get(frame);
        return sample && sample.epoch === (epochs.get(frame) ?? 0) && sample.index === index &&
          sample.startedAtMs >= input.parentScanStartedAtMs + capture.window!.startedAtMs &&
          sample.startedAtMs >= deadline - 300;
      });
  };
  const collect = () => {
    if (!active()) return;
    const frames = page.frames(); sampledFrames = frames; capture.candidateFrameCount = frames.length;
    const rank = (frame: Frame) => {
      const epoch = epochs.get(frame) ?? 0;
      if (capture.frames.some(row => row.forms.length && retained.get(row.frameRef)?.frame === frame && retained.get(row.frameRef)?.epoch === epoch)) return 0;
      if (inspected.get(frame) !== epoch) return 1;
      return visibility.get(frame)?.epoch === epoch && !visibility.get(frame)?.shown ? 3 : 2;
    };
    let launched = false;
    for (const [slotIndex, slot] of slots.entries()) {
      // A pending command keeps its slot even if its frame detaches. Never
      // replace or retry it while pending, or overlap it with a new command.
      if ((slot.frame && inFlight.has(slot.frame)) || inFlight.size >= 3 ||
        Date.now() < Math.min(slot.nextAt, deadline - 150)) continue;
      const frame = slotIndex === 0 ? page.mainFrame() : frames.filter(frame => frame !== page.mainFrame() &&
        !inFlight.has(frame) && !slots.some(other => other !== slot && other.frame === frame))
        .sort((a, b) => rank(a) - rank(b) || (completed.get(a)?.startedAtMs ?? 0) - (completed.get(b)?.startedAtMs ?? 0))[0];
      if (!frame) continue;
      const index = frames.indexOf(frame);
      if (index < 0) continue;
      if (slot.frame !== frame) {
        const previous = slot.frame;
        capture.frames = capture.frames.filter(row => retained.get(row.frameRef)?.frame !== previous);
        slot.frame = frame;
      }
      const epoch = epochs.get(frame) ?? 0, sampleStartedAtMs = Date.now();
      const sampleReasons = new Set<PostAcceptFormCapture["reasonCodes"][number]>();
      completed.delete(frame); frameReasons.set(frame, {epoch, index, reasons: sampleReasons});
      inFlight.add(frame); launched = true;
      void sampleFrame(frame, index, epoch, sampleStartedAtMs, sampleReasons).finally(() => {
        inFlight.delete(frame);
        if (frozen) return;
        slot.nextAt = Date.now() + 500;
        if (active() && !frame.isDetached() && epoch === (epochs.get(frame) ?? 0) && page.frames()[index] === frame)
          completed.set(frame, {epoch, index, startedAtMs: sampleStartedAtMs});
        updateTerminalCoverage(page.frames());
        if (active() && Date.now() < deadline - 150) schedule();
      });
    }
    updateTerminalCoverage(frames);
    // Timers may wake just before their due millisecond. Do not lose the final
    // scheduled sample when no slot was quite ready; do not add another round.
    if (!launched && Date.now() < deadline - 150) schedule();
  };
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    if (!active() || inFlight.size >= 3) return;
    const now = Date.now();
    const frames = page.frames();
    const due = slots.filter((slot, index) => (!slot.frame || !inFlight.has(slot.frame)) &&
      (index === 0 || frames.some(frame => frame !== page.mainFrame() && !inFlight.has(frame) &&
        !slots.some(other => other !== slot && other.frame === frame))))
      .map(slot => Math.min(slot.nextAt || now + 500, deadline - 150));
    if (!due.length) return;
    // A slow sibling cannot postpone an earlier healthy frame's next sample.
    timer = setTimeout(() => { void collect(); }, Math.max(0, Math.min(...due) - now));
    timer.unref?.();
  };
  timer = setTimeout(() => { void collect(); }, Math.min(250, Math.max(0, input.windowMs / 2)));
  timer.unref?.();
  return {
    // The image collector already obtained this loader from this exact Page.
    // Never bind prior samples retroactively. Both collectors discard captures
    // on main-document navigation; later samples use the existing DOM cadence.
    bindMainDocument(token: string) {
      if (!active() || mainDocumentBinding || !token || token.length > 128) return;
      mainDocumentBinding = {source:"cdp_loader_id",token,boundAtMs:Date.now()-input.parentScanStartedAtMs};
      if (capture.version !== "post_accept_form_capture.v4") capture.version = "post_accept_form_capture.v3";
    },
    continueThrough(confirmedAtMs: number, windowMs: number) {
      if (frozen || input.signal?.aborted) return;
      deadline = input.parentScanStartedAtMs + confirmedAtMs + windowMs;
      capture.window = { startedAtMs: confirmedAtMs, endedAtMs: deadline - input.parentScanStartedAtMs, terminalSampleCompleted: false };
      // Preserve a limited artifact under the confirmed action's clock even
      // when navigation already stopped sampling. This cannot resume capture
      // or certify any frame from the prior window/document.
      if (mainChanged) return;
      // The initial timer may have fired after its deadline without starting a
      // sample. Restart inside the existing confirmed window in that case too.
      // Per-frame pending guards prevent overlap while healthy siblings restart
      // in the confirmed window; prior reads cannot certify the new window.
      schedule();
    },
    followThrough(input: {originalWindowEndedAtMs: number; endAtMs: number; workerDeadlineAtMs: number; triggerRequestId: string}) {
      if (frozen || mainChanged || input.originalWindowEndedAtMs !== capture.window!.endedAtMs || input.endAtMs <= capture.window!.endedAtMs ||
          input.endAtMs > Math.min(capture.window!.endedAtMs + 8000, input.workerDeadlineAtMs)) return false;
      capture.followup = {reason:"retained_form_bootstrap", triggerRequestId:input.triggerRequestId,
        originalWindowEndedAtMs:capture.window!.endedAtMs, workerDeadlineAtMs:input.workerDeadlineAtMs};
      capture.version = "post_accept_form_capture.v4";
      deadline = captureClock + input.endAtMs;
      capture.window!.endedAtMs = input.endAtMs;
      capture.window!.terminalSampleCompleted = false;
      schedule();
      return true;
    },
    finishSettledFollowup(snapshotFinishedAtMs: number): boolean {
      if (!capture.followup || !active() || inFlight.size ||
        Date.now() < captureClock + capture.followup.originalWindowEndedAtMs) return false;
      const frames = page.frames();
      if (!selectedFrames().every(frame => {
        const sample = completed.get(frame);
        return sample && sample.epoch === (epochs.get(frame) ?? 0) && sample.index === frames.indexOf(frame) &&
          sample.startedAtMs >= Date.now() - 750;
      })) return false;
      const positive = capture.frames.filter(row => row.forms.some(form => form.fields.length > 0));
      if (!positive.length || !positive.every(row => {
        const binding = retained.get(row.frameRef);
        const stable = binding && stableForms.get(binding.frame);
        return stable && binding.epoch === stable.epoch && stable.epoch === (epochs.get(binding.frame) ?? 0) &&
          stable.sampledAt >= Math.max(snapshotFinishedAtMs, captureClock + capture.followup!.originalWindowEndedAtMs) &&
          stable.sampledAt - stable.since >= 500;
      })) return false;
      // End only the optional form sample. No completeness/absence is inferred.
      deadline = Date.now();
      capture.window!.endedAtMs = deadline - captureClock;
      return true;
    },
    finish(): PostAcceptFormCapture {
    if (result) return result;
    clearTimeout(timer); frozen = true; page.off("framenavigated", navigated);
    if (page.frames().some(frame => !sampledFrames.includes(frame))) reasons.add("frame_unavailable");
    if (input.signal?.aborted) { reasons.add("cancelled"); capture.frames = []; }
    if (mainChanged || page.isClosed() || !targetMatches()) { reasons.add("document_changed"); capture.frames = []; }
    const currentFrames = page.frames();
    capture.frames = capture.frames.filter(row => { const binding = retained.get(row.frameRef)!; const valid = selectedFrames().includes(binding.frame) && currentFrames.includes(binding.frame) && !binding.frame.isDetached() && binding.epoch === (epochs.get(binding.frame) ?? 0); if (!valid) reasons.add("document_changed"); return valid; });
    capture.candidateFrameCount = currentFrames.length;
    if (currentFrames.length > 3) reasons.add("capture_limit");
    selectedFrames().forEach(frame => {
      const index = currentFrames.indexOf(frame);
      const latest = frameReasons.get(frame);
      if (latest?.epoch === (epochs.get(frame) ?? 0) && latest.index === index)
        latest.reasons.forEach(reason => reasons.add(reason));
    });
    updateTerminalCoverage(currentFrames);
    capture.inspectedFrameCount = selectedFrames().filter(frame => currentFrames.includes(frame) && inspected.has(frame) && inspected.get(frame) === (epochs.get(frame) ?? 0) && !frame.isDetached()).length;
    if (!capture.window!.terminalSampleCompleted || capture.inspectedFrameCount < capture.candidateFrameCount && !reasons.size) reasons.add("window_ended");
    capture.frames.sort((a,b)=>a.frameRef.localeCompare(b.frameRef));
    capture.reasonCodes = [...reasons]; capture.status = reasons.size ? "limited" : "captured";
    const parsed = postAcceptFormCaptureSchema.safeParse(capture);
    result = parsed.success ? parsed.data : postAcceptFormCaptureSchema.parse({
      ...capture, status: "limited", reasonCodes: ["capture_invalid"], frames: [], inspectedFrameCount: 0,
    });
    return result;
  }};
}
