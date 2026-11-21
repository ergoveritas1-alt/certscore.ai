import type { CDPSession } from "playwright";
import { consentAccessibilityDomBindingSchema, boundOptOutControlFromAttributes, classifyConsentControlLabel,
  type BrowserDocumentIdentity, type ConsentAccessibilityDomBinding } from "@certscore/contracts";
import type { ConsentAccessibilityTreeNode } from "./scanners/pre-consent-runtime-scanner.js";
import { exactNativeConsentButtonSelector, exactAcceptSelectorCaptureEnabled, exactRejectSelectorCaptureEnabled } from "./exact-native-consent-button-selector.js";

export const AX_DOM_BINDING_BUDGET_MS = 50;
export const AX_DOM_BINDING_MAX_NODES = 12;

const exactButtonSelectorOnNode = `function (expectedUrl) {
  const __name = (fn) => fn;
  if (this.ownerDocument?.URL !== expectedUrl) return undefined;
  return (${exactNativeConsentButtonSelector.toString()})(this);
}`;

/** Optional corroboration inside the existing AX deadline. Local consent
 * prototypes can read the exact native selector from the already bound node. */
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
  const captureExactAcceptSelector = exactAcceptSelectorCaptureEnabled();
  const captureExactRejectSelector = exactRejectSelectorCaptureEnabled();
  let timer: ReturnType<typeof setTimeout> | undefined;
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
          if ((!captureExactAcceptSelector && !captureExactRejectSelector) || parsed.data.optOutControl ||
              parsed.data.tagName !== "button" || String(node.role?.value).toLowerCase() !== "button" ||
              typeof node.name?.value !== "string") return;
          const classification = classifyConsentControlLabel({ label: node.name.value, linkRole: "button", hasConsentContext: true });
          const accept = captureExactAcceptSelector && classification.intent === "accept";
          const reject = captureExactRejectSelector && classification.intent === "reject" && !classification.variant;
          if (!accept && !reject) return;
          const { object } = await client.send("DOM.resolveNode", { backendNodeId: parsed.data.backendNodeId });
          if (!object.objectId || Date.now() >= deadline) return;
          const selector = await client.send("Runtime.callFunctionOn", {
            objectId: object.objectId, functionDeclaration: exactButtonSelectorOnNode,
            arguments: [{ value: document.url }], returnByValue: true,
          });
          const value = selector.result.value;
          if (selector.exceptionDetails || Date.now() >= deadline) return;
          const upgraded = consentAccessibilityDomBindingSchema.safeParse({
            ...parsed.data, version: "ax_backend_dom_binding.v3",
            ...(accept ? { exactAcceptSelector: value } : { exactRejectSelector: value }),
          });
          if (upgraded.success) bindings.set(node.nodeId, upgraded.data);
        } catch { return undefined; }
      })),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), AX_DOM_BINDING_BUDGET_MS); }),
    ]);
    const byNode = new Map(bindings);
    return nodes.map(node => ({...node, domBinding: byNode.get(node.nodeId)}));
  } finally { if (timer) clearTimeout(timer); }
}
