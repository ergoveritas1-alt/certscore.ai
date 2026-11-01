import { classifyConsentControlLabel } from "@certscore/contracts";
import type { CDPSession, Frame, Locator, Page } from "playwright";
import { consentScopePermitsInteraction } from "./cmp-action-target.js";
import type { ConsentProofReadGuard } from "./cmp-action-control-proof.js";
import type { ConsentControlReadOptions } from "./cmp-control-actionability.js";

export type CmpAccessibleActionResolution = {
  kind: "scoped_accessible_control" | "closed_shadow_accessible_control";
  scopeSelector: string;
  intent: "accept" | "reject";
};

type ClosedShadowTarget = {
  backendNodeId: number;
  label: string;
  x: number;
  y: number;
};

function closedShadowDispatchReadGuard(page: Page, deadlineAtMs: number, signal?: AbortSignal): ConsentProofReadGuard {
  let stopped = false;
  const checkpoint = () => {
    if (stopped || signal?.aborted || Date.now() >= deadlineAtMs) throw new Error("closed_shadow_target_read_aborted_or_expired");
  };
  return {scope: page.mainFrame(), checkpoint, track: pending => pending,
    async read(start) {
      checkpoint();let timer: NodeJS.Timeout | undefined, abort: (() => void) | undefined;
      try {
        const pending = start();
        const stop = new Promise<never>((_resolve,reject) => {
          abort = () => {stopped = true;reject(new Error("closed_shadow_target_read_aborted_or_expired"));};
          signal?.addEventListener("abort",abort,{once:true});
          timer = setTimeout(abort,Math.max(0,deadlineAtMs-Date.now()));
          if (signal?.aborted) abort();
        });
        const result = await Promise.race([pending,stop]);checkpoint();return result;
      } finally {if (timer) clearTimeout(timer);if (abort) signal?.removeEventListener("abort",abort);}
    }};
}

async function consentCdpSession(page: Page, guard?: ConsentProofReadGuard): Promise<CDPSession> {
  guard?.checkpoint();
  let acquired: CDPSession | undefined, cleanupStarted = false;
  const cleanup = () => {
    if (!acquired || cleanupStarted) return;cleanupStarted = true;
    const session = acquired, work = Promise.resolve().then(() => session.detach()).catch(() => undefined);
    if (guard) void guard.track(work);
  };
  const pending = page.context().newCDPSession(page);
  void pending.then(session => {acquired = session;try {guard?.checkpoint();} catch {cleanup();}}, () => undefined);
  try {return await (guard ? guard.read(() => pending) : pending);}
  catch (error) {cleanup();throw error;}
}

function eligibleIntent(label: string, intent: "accept" | "reject") {
  const classification = classifyConsentControlLabel({
    usage: "action",
    label,
    hasConsentContext: true,
  });
  if (classification.intent !== intent || classification.confidence < 0.8) return false;
  return classification.variant !== "reject_with_subscription";
}

async function accessibleLabels(locator: Locator) {
  return locator.evaluate((element) => {
    const html = element as HTMLElement;
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      "value" in html ? String((html as HTMLInputElement).value ?? "") : "",
      html.innerText,
      element.textContent,
    ].filter((value): value is string => Boolean(value?.trim()));
  }).catch(() => [] as string[]);
}

export async function resolveScopedAccessibleControl(
  scope: Page | Frame,
  resolution: CmpAccessibleActionResolution,
): Promise<Locator | undefined> {
  if (resolution.kind !== "scoped_accessible_control") return undefined;
  const containers = scope.locator(resolution.scopeSelector);
  if (await containers.count().catch(() => 0) !== 1) return undefined;
  const container = containers.first();
  if (!await consentScopePermitsInteraction(container)) return undefined;
  const controls = container.getByRole("button");
  const matches: Locator[] = [];
  const rawCount = await controls.count().catch(() => 0);
  if (rawCount > 24) return undefined;
  const count = rawCount;
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const [visible, enabled, scopePermitsInteraction, labels] = await Promise.all([
      control.isVisible().catch(() => false),
      control.isEnabled().catch(() => false),
      consentScopePermitsInteraction(control),
      accessibleLabels(control),
    ]);
    if (
      visible &&
      enabled &&
      scopePermitsInteraction &&
      labels.some((label) => eligibleIntent(label, resolution.intent))
    ) matches.push(control);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export async function closedShadowAccessibleControlAvailable(
  page: Page,
  resolution: CmpAccessibleActionResolution,
) {
  if (resolution.kind !== "closed_shadow_accessible_control") return false;
  return Boolean(await resolveClosedShadowTarget(page, resolution));
}

export async function readClosedShadowAccessibleControlLabel(
  page: Page,
  resolution: CmpAccessibleActionResolution,
  proofGuard?: ConsentProofReadGuard,
) {
  if (resolution.kind !== "closed_shadow_accessible_control") return undefined;
  return (await resolveClosedShadowTarget(page, resolution, proofGuard))?.label;
}

export async function dispatchClosedShadowAccessibleControl(
  page: Page,
  resolution: CmpAccessibleActionResolution,
  assertDispatchAllowed?: () => void,
  onDispatch?: () => void,
  options?: ConsentControlReadOptions,
  onDispatchCommitted?: () => void,
) {
  if (resolution.kind !== "closed_shadow_accessible_control") {
    throw new Error("Closed-shadow dispatch requires a closed-shadow action recipe.");
  }
  const dispatchDeadlineAtMs = Math.min(Date.now() + 2_000, options?.deadlineAtMs ?? Infinity);
  const dispatchGuard = options?.bindClosedShadowTarget ? closedShadowDispatchReadGuard(page, dispatchDeadlineAtMs, options.signal) : undefined;
  const target = await resolveClosedShadowTarget(page, resolution, dispatchGuard);
  if (!target) throw new Error("Closed-shadow CMP action target was not uniquely actionable.");
  const session = await consentCdpSession(page, dispatchGuard);
  const read = <T>(start: () => Promise<T>) => dispatchGuard ? dispatchGuard.read(start) : start();
  try {
    await read(() => session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: target.x,
      y: target.y,
    }));
    assertDispatchAllowed?.();
    onDispatch?.();
    assertDispatchAllowed?.();
    if (options?.bindClosedShadowTarget) {
        const [hit, described] = await read(() => Promise.all([
          session.send("DOM.getNodeForLocation", {x: Math.round(target.x), y: Math.round(target.y), includeUserAgentShadowDOM: true}),
          session.send("DOM.describeNode", {backendNodeId: target.backendNodeId, depth: 4, pierce: true}),
        ]));
        const pendingNodes = [described.node], currentIds = new Set<number>();
        let complete = described.node.backendNodeId === target.backendNodeId;
        while (pendingNodes.length && complete) {
          const node = pendingNodes.pop()!;
          if (currentIds.size >= 64 || (node.childNodeCount ?? 0) > (node.children?.length ?? 0)) {complete = false;break;}
          currentIds.add(node.backendNodeId);
          pendingNodes.push(...(node.children ?? []), ...(node.shadowRoots ?? []));
        }
        // A retained descendant ID alone is insufficient: the page may have
        // moved it into another button. Require fresh complete ancestry.
        if (!complete || !currentIds.has(hit.backendNodeId)) {
          throw new Error("closed_shadow_bound_target_changed");
        }
        assertDispatchAllowed?.();
        dispatchGuard!.checkpoint();
    }
    onDispatchCommitted?.();
    await read(() => session.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      x: target.x,
      y: target.y,
    }));
    await read(() => session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      x: target.x,
      y: target.y,
    }));
  } finally {
    void Promise.resolve().then(() => session.detach()).catch(() => undefined);
  }
}

async function resolveClosedShadowTarget(
  page: Page,
  resolution: CmpAccessibleActionResolution,
  proofGuard?: ConsentProofReadGuard,
): Promise<ClosedShadowTarget | undefined> {
  const session = await consentCdpSession(page, proofGuard);
  const read = <T>(start: () => Promise<T>): Promise<T> => proofGuard ? proofGuard.read(start) : start();
  try {
    await read(() => session.send("DOM.enable"));
    await read(() => session.send("Accessibility.enable"));
    const document = await read(() => session.send("DOM.getDocument", { depth: -1, pierce: true }));
    const queried = await read(() => session.send("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: resolution.scopeSelector,
    }));
    if (!queried.nodeId) return undefined;

    const descendantBackendIds = new Set<number>();
    const backendParents = new Map<number, number | undefined>();
    const visit = (node: any, parentBackendId?: number) => {
      const backendNodeId = Number(node.backendNodeId || 0);
      if (backendNodeId) {
        descendantBackendIds.add(backendNodeId);
        backendParents.set(backendNodeId, parentBackendId);
      }
      for (const shadow of node.shadowRoots ?? []) visit(shadow, backendNodeId || parentBackendId);
      for (const child of node.children ?? []) visit(child, backendNodeId || parentBackendId);
    };
    const find = (node: any): any => {
      if (node.nodeId === queried.nodeId) return node;
      for (const shadow of node.shadowRoots ?? []) {
        const found = find(shadow);
        if (found) return found;
      }
      for (const child of node.children ?? []) {
        const found = find(child);
        if (found) return found;
      }
      return undefined;
    };
    const host = find(document.root);
    if (!host) return undefined;
    visit(host);

    const axTree = await read(() => session.send("Accessibility.getFullAXTree"));
    const candidates = [] as ClosedShadowTarget[];
    for (const node of axTree.nodes ?? []) {
      const backendNodeId = Number(node.backendDOMNodeId || 0);
      const label = String(node.name?.value ?? "").trim();
      if (
        node.role?.value !== "button" ||
        !backendNodeId ||
        !descendantBackendIds.has(backendNodeId) ||
        !eligibleIntent(label, resolution.intent) ||
        node.ignored === true ||
        node.properties?.some((property: any) =>
          property.name === "disabled" && property.value?.value === true
        )
      ) continue;
      const box = await read(() => session.send("DOM.getBoxModel", { backendNodeId }).catch(() => undefined));
      const quad = box?.model?.border ?? box?.model?.content;
      if (!Array.isArray(quad) || quad.length !== 8) continue;
      const x = (quad[0]! + quad[2]! + quad[4]! + quad[6]!) / 4;
      const y = (quad[1]! + quad[3]! + quad[5]! + quad[7]!) / 4;
      const viewport = page.viewportSize();
      if (!viewport || x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
      const hit = await read(() => session.send("DOM.getNodeForLocation", {
        x: Math.round(x),
        y: Math.round(y),
        includeUserAgentShadowDOM: true,
      }).catch(() => undefined));
      let hitBackendId = Number(hit?.backendNodeId || 0);
      let belongsToButton = hitBackendId === backendNodeId;
      while (!belongsToButton && hitBackendId) {
        hitBackendId = backendParents.get(hitBackendId) ?? 0;
        belongsToButton = hitBackendId === backendNodeId;
      }
      if (belongsToButton) candidates.push({ backendNodeId, label, x, y });
    }
    return candidates.length === 1 ? candidates[0] : undefined;
  } finally {
    const cleanup = Promise.resolve().then(() => session.detach()).catch(() => undefined);
    if (proofGuard) void proofGuard.track(cleanup);
  }
}
