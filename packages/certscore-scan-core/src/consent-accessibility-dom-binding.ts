import type { CDPSession } from "playwright";
import { consentAccessibilityDomBindingSchema, type BrowserDocumentIdentity, type ConsentAccessibilityDomBinding } from "@certscore/contracts";
import type { ConsentAccessibilityTreeNode } from "./scanners/pre-consent-runtime-scanner.js";

export const AX_DOM_BINDING_BUDGET_MS = 50;
export const AX_DOM_BINDING_MAX_NODES = 12;

/** Optional corroboration, inside the existing AX capture deadline. Missing or
 * slow native reads leave the original AX record unchanged. No text/value read,
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
  try {
    await Promise.race([
      Promise.all(candidates.map(async node => {
        try {
          const result = await client.send("DOM.describeNode", {backendNodeId: node.backendDOMNodeId!, depth: 0, pierce: false});
          if (Date.now() > deadline || result.node.backendNodeId !== node.backendDOMNodeId || result.node.nodeType !== 1) return undefined;
          const parsed = consentAccessibilityDomBindingSchema.safeParse({version: "ax_backend_dom_binding.v1",
            axNodeId: node.nodeId, backendNodeId: result.node.backendNodeId, nodeType: result.node.nodeType,
            tagName: result.node.localName, documentUrl: document.url, documentIdentity: identity});
          if (parsed.success) bindings.set(node.nodeId, parsed.data);
        } catch { return undefined; }
      })),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), AX_DOM_BINDING_BUDGET_MS); }),
    ]);
    const byNode = new Map(bindings);
    return nodes.map(node => ({...node, domBinding: byNode.get(node.nodeId)}));
  } finally { if (timer) clearTimeout(timer); }
}
