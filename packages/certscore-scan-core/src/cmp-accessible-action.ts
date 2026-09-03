import { classifyConsentControlLabel } from "@certscore/contracts";
import type { Frame, Locator, Page } from "playwright";

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

function eligibleIntent(label: string, intent: "accept" | "reject") {
  const classification = classifyConsentControlLabel({
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
  if (!await container.isVisible().catch(() => false)) return undefined;
  const controls = container.getByRole("button");
  const matches: Locator[] = [];
  const count = Math.min(await controls.count().catch(() => 0), 24);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const [visible, enabled, labels] = await Promise.all([
      control.isVisible().catch(() => false),
      control.isEnabled().catch(() => false),
      accessibleLabels(control),
    ]);
    if (
      visible &&
      enabled &&
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
) {
  if (resolution.kind !== "closed_shadow_accessible_control") return undefined;
  return (await resolveClosedShadowTarget(page, resolution))?.label;
}

export async function dispatchClosedShadowAccessibleControl(
  page: Page,
  resolution: CmpAccessibleActionResolution,
) {
  if (resolution.kind !== "closed_shadow_accessible_control") {
    throw new Error("Closed-shadow dispatch requires a closed-shadow action recipe.");
  }
  const target = await resolveClosedShadowTarget(page, resolution);
  if (!target) throw new Error("Closed-shadow CMP action target was not uniquely actionable.");
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: target.x,
      y: target.y,
    });
    await session.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      x: target.x,
      y: target.y,
    });
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      x: target.x,
      y: target.y,
    });
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function resolveClosedShadowTarget(
  page: Page,
  resolution: CmpAccessibleActionResolution,
): Promise<ClosedShadowTarget | undefined> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("DOM.enable");
    await session.send("Accessibility.enable");
    const document = await session.send("DOM.getDocument", { depth: -1, pierce: true });
    const queried = await session.send("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: resolution.scopeSelector,
    });
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

    const axTree = await session.send("Accessibility.getFullAXTree");
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
      const box = await session.send("DOM.getBoxModel", { backendNodeId }).catch(() => undefined);
      const quad = box?.model?.border ?? box?.model?.content;
      if (!Array.isArray(quad) || quad.length !== 8) continue;
      const x = (quad[0]! + quad[2]! + quad[4]! + quad[6]!) / 4;
      const y = (quad[1]! + quad[3]! + quad[5]! + quad[7]!) / 4;
      const viewport = page.viewportSize();
      if (!viewport || x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
      const hit = await session.send("DOM.getNodeForLocation", {
        x: Math.round(x),
        y: Math.round(y),
        includeUserAgentShadowDOM: true,
      }).catch(() => undefined);
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
    await session.detach().catch(() => undefined);
  }
}
