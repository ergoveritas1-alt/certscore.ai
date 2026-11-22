import { COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR, COOKIE_SCRIPT_REJECT_ROLE_SELECTOR, COOKIE_SCRIPT_ACCEPT_IDS, COOKIE_SCRIPT_REJECT_IDS } from "./cookiescript-reject-selector.js";
import type { CDPSession } from "playwright";
import { consentAccessibilityDomBindingSchema, boundOptOutControlFromAttributes, type BrowserDocumentIdentity, type ConsentAccessibilityDomBinding } from "@certscore/contracts";
import type { ConsentAccessibilityTreeNode } from "./scanners/pre-consent-runtime-scanner.js";
import type { ConsentControlCandidateEvidence, ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

export const AX_DOM_BINDING_BUDGET_MS = 50;
export const AX_DOM_BINDING_MAX_NODES = 12;

/** Optional corroboration, inside the existing AX capture deadline. Missing or
 * slow native reads leave the original AX record unchanged. No extra text/value read,
 * DOM execution, guessed tag, or cross-document backend-node reuse. */
export async function bindAccessibilityNodesToDom(client: CDPSession, nodes: ConsentAccessibilityTreeNode[], document: {
  url: string; identity?: BrowserDocumentIdentity;
}): Promise<ConsentAccessibilityTreeNode[]> {
  if (document.identity?.source !== "cdp_loader_id" || !document.identity.token) return nodes;
  const identity = {source: "cdp_loader_id" as const, token: document.identity.token};
  const counts = new Map<number, number>();
  for (const node of nodes) if (node.backendDOMNodeId) counts.set(node.backendDOMNodeId, (counts.get(node.backendDOMNodeId) ?? 0) + 1);
  const candidates = nodes.filter(node => node.visibilityEvidence === "box_model_verified" &&
    node.backendDOMNodeId && counts.get(node.backendDOMNodeId) === 1 &&
    ["button", "link"].includes(String(node.role?.value).toLowerCase())).slice(0, AX_DOM_BINDING_MAX_NODES);
  const deadline = Date.now() + AX_DOM_BINDING_BUDGET_MS;
  const bindings = new Map<string, ConsentAccessibilityDomBinding>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rootRead: Promise<number> | undefined;
  async function verifiedButton(node: {localName: string; attributes?: string[]; backendNodeId: number}) {
    if (!node.attributes) return;
    const index = node.attributes.findIndex((name, i) => i % 2 === 0 && name === "id");
    const id = index >= 0 ? node.attributes[index + 1] : undefined;
    const cookieScript = node.localName === "div" && (id === "cookiescript_accept" || id === "cookiescript_reject");
    if (!cookieScript) return;
    const selector = id === "cookiescript_accept" ? COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR : COOKIE_SCRIPT_REJECT_ROLE_SELECTOR;
    rootRead ??= client.send("DOM.getDocument", {depth: 0, pierce: false}).then(response => response.root.nodeId);
    const root = await rootRead;
    if (Date.now() >= deadline) return;
    const [matched, ids] = await Promise.all([
      client.send("DOM.querySelectorAll", {nodeId: root, selector}),
      client.send("DOM.querySelectorAll", {nodeId: root,
        selector: id === "cookiescript_accept" ? COOKIE_SCRIPT_ACCEPT_IDS : COOKIE_SCRIPT_REJECT_IDS}),
    ]);
    const {nodeIds} = matched;
    if (nodeIds.length !== 1 || ids.nodeIds.length !== 2 || Date.now() >= deadline) return;
    const match = await client.send("DOM.describeNode", {nodeId: nodeIds[0]!, depth: 0});
    if (Date.now() > deadline || match.node.backendNodeId !== node.backendNodeId) return;
    return {version:"ax_backend_dom_binding.v4" as const,
      verifiedButtonSelector:id === "cookiescript_accept" ? "#cookiescript_accept" as const : "#cookiescript_reject" as const};

  }
  try {
    await Promise.race([
      Promise.all(candidates.map(async node => {
        try {
          const result = await client.send("DOM.describeNode", {backendNodeId: node.backendDOMNodeId!, depth: 0, pierce: false});
          if (Date.now() > deadline || result.node.backendNodeId !== node.backendDOMNodeId || result.node.nodeType !== 1) return undefined;
          const optOutControl=boundOptOutControlFromAttributes(result.node.localName,result.node.attributes,node.name?.value);
          const parsed = consentAccessibilityDomBindingSchema.safeParse({version: optOutControl ? "ax_backend_dom_binding.v2" : "ax_backend_dom_binding.v1",
            ...(optOutControl ? {optOutControl} : {}),
            axNodeId: node.nodeId, backendNodeId: result.node.backendNodeId, nodeType: result.node.nodeType,
            tagName: result.node.localName, documentUrl: document.url, documentIdentity: identity});
          if (!parsed.success) return;
          bindings.set(node.nodeId, parsed.data);
          if (optOutControl) return;
          const verified = await verifiedButton(result.node);
          if (verified) bindings.set(node.nodeId, {...parsed.data, ...verified});
        } catch { return undefined; }
      })),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), AX_DOM_BINDING_BUDGET_MS); }),
    ]);
    const byNode = new Map(bindings);
    return nodes.map(node => ({...node, domBinding: byNode.get(node.nodeId)}));
  } finally { if (timer) clearTimeout(timer); }
}


/** The passive CSS lookup and the AX record must have named the same CDP element. */
export function passiveButtonSelectorMatches(control: {
  selectorHint?: string; domBinding?: ConsentAccessibilityDomBinding; tagName?: string;
}, selector: string, action: "accept" | "reject", documentUrl: string, loader: string): boolean {
  const binding = control.domBinding;
  if (!binding) return control.selectorHint === selector;
  const expected = binding.version === "ax_backend_dom_binding.v4" && control.tagName === "div" && binding.tagName === "div"
    ? (action === "accept" ? "#cookiescript_accept" : "#cookiescript_reject")
    : undefined;
  return selector === expected &&
    control.selectorHint === `ax:${binding.axNodeId}` && binding.documentUrl === documentUrl &&
    binding.documentIdentity.token === loader && binding.documentIdentity.source === "cdp_loader_id" &&
    binding.verifiedButtonSelector === selector;
}

/** The passive inventory can retain the uppercase caption of a native
 * Cookie Information button. The worker must still recheck its exact ARIA label. */
export function cookieInformationRenderedLabel(
  candidate: ConsentControlCandidateEvidence,
  cmp: ConsentControlGeometryArtifact["cmp"],
): string | undefined {
  const { label, ariaLabel } = candidate;
  if (candidate.tagName !== "button" || candidate.containerSelectorHint !== "#coi-banner-wrapper" ||
      !label || !ariaLabel || !/^[A-Za-z ]+$/.test(ariaLabel) || label === ariaLabel ||
      label !== ariaLabel.toUpperCase() ||
      !cmp?.detections?.some(detection => detection.canonicalName === "Cookie Information" &&
        detection.matchedSignals.some(signal => signal.source === "dom" && signal.value === "#coiOverlay") &&
        detection.matchedSignals.some(signal => signal.source === "global" && signal.value === "CookieInformation"))) return undefined;
  return label;
}
