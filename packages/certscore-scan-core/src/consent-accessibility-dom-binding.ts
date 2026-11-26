import { exactAcceptSelectorCaptureEnabled, exactRejectSelectorCaptureEnabled, exactNativeConsentButtonSelector, TOOM_ACCEPT_SELECTOR } from "./exact-native-consent-button-selector.js";
import { COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR, COOKIE_SCRIPT_REJECT_ROLE_SELECTOR, COOKIE_SCRIPT_ACCEPT_IDS, COOKIE_SCRIPT_REJECT_IDS } from "./cookiescript-reject-selector.js";
import type { CDPSession } from "playwright";
import { consentAccessibilityDomBindingSchema, boundOptOutControlFromAttributes, classifyConsentControlLabel, type BrowserDocumentIdentity, type ConsentAccessibilityDomBinding } from "@certscore/contracts";
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
  const exactNativeCapture = exactAcceptSelectorCaptureEnabled() || exactRejectSelectorCaptureEnabled();
  const candidates = nodes.filter(node => node.visibilityEvidence === "box_model_verified" &&
    node.backendDOMNodeId && counts.get(node.backendDOMNodeId) === 1 &&
    ["button", "link"].includes(String(node.role?.value).toLowerCase()));
  const decisionIntents = new Map(candidates.flatMap(node => {
    if (!exactNativeCapture || String(node.role?.value).toLowerCase() !== "button") return [];
    const result = classifyConsentControlLabel({label: String(node.name?.value ?? ""), hasConsentContext: true});
    return result.intent === "accept" || result.intent === "reject" ? [[node.nodeId, result.intent] as const] : [];
  }));
  // Keep the two native queries for decision controls. Otherwise a visible
  // settings/close button can use a slot before the actual Accept or Reject.
  candidates.sort((left, right) => Number(decisionIntents.has(right.nodeId)) - Number(decisionIntents.has(left.nodeId)));
  const deadline = Date.now() + AX_DOM_BINDING_BUDGET_MS;
  const bindings = new Map<string, ConsentAccessibilityDomBinding>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rootRead: Promise<number> | undefined;
  const nativeLookups = new Set<"accept" | "reject">();
  async function verifiedButton(node: {localName: string; attributes?: string[]; backendNodeId: number},
    intent?: "accept" | "reject") {
    if (!node.attributes) return;
    const index = node.attributes.findIndex((name, i) => i % 2 === 0 && name === "id");
    const id = index >= 0 ? node.attributes[index + 1] : undefined;
    const cookieScript = node.localName === "div" && (id === "cookiescript_accept" || id === "cookiescript_reject");
    const native = intent && node.localName === "button" && typeof id === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id);
    const toom = intent === "accept" && document.url === "https://toom.de/" && node.localName === "button" &&
      node.attributes.some((name, i, attributes) => i % 2 === 0 && name === "data-testid" &&
        attributes[i + 1] === "uc-accept-all-button");
    if (toom && !nativeLookups.has("accept") && Date.now() < deadline) {
      nativeLookups.add("accept");
      const {object} = await client.send("DOM.resolveNode", {backendNodeId: node.backendNodeId});
      if (!object.objectId) return;
      try {
        if (Date.now() >= deadline) return;
        const checked = await client.send("Runtime.callFunctionOn", {objectId: object.objectId, returnByValue: true,
          functionDeclaration: `function() { const __name = fn => fn; return (${exactNativeConsentButtonSelector.toString()})(this); }`});
        if (Date.now() <= deadline && !checked.exceptionDetails && checked.result.value === TOOM_ACCEPT_SELECTOR) {
          return {version:"ax_backend_dom_binding.v6" as const, verifiedButtonSelector: TOOM_ACCEPT_SELECTOR};
        }
        return;
      } finally { void client.send("Runtime.releaseObject", {objectId: object.objectId}).catch(() => undefined); }
    }
    if (!cookieScript && (!native || nativeLookups.has(intent))) return;
    if (native) nativeLookups.add(intent);
    const selector = cookieScript
      ? id === "cookiescript_accept" ? COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR : COOKIE_SCRIPT_REJECT_ROLE_SELECTOR
      : `#${id}`;
    rootRead ??= client.send("DOM.getDocument", {depth: 0, pierce: false}).then(response => response.root.nodeId);
    const root = await rootRead;
    if (Date.now() >= deadline) return;
    const [matched, ids] = await Promise.all([
      client.send("DOM.querySelectorAll", {nodeId: root, selector}),
      cookieScript ? client.send("DOM.querySelectorAll", {nodeId: root,
        selector: id === "cookiescript_accept" ? COOKIE_SCRIPT_ACCEPT_IDS : COOKIE_SCRIPT_REJECT_IDS}) : undefined,
    ]);
    const {nodeIds} = matched;
    if (nodeIds.length !== 1 || (cookieScript && ids?.nodeIds.length !== 2) || Date.now() >= deadline) return;
    const match = await client.send("DOM.describeNode", {nodeId: nodeIds[0]!, depth: 0});
    if (Date.now() > deadline || match.node.backendNodeId !== node.backendNodeId) return;
    return cookieScript ? { version:"ax_backend_dom_binding.v4" as const, verifiedButtonSelector: `#${id}` } :
      { version:"ax_backend_dom_binding.v5" as const, verifiedButtonSelector: selector };
  }
  try {
    await Promise.race([
      Promise.all(candidates.slice(0, AX_DOM_BINDING_MAX_NODES).map(async node => {
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
          const verified = await verifiedButton(result.node, decisionIntents.get(node.nodeId));
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
  const expected = (binding.version === "ax_backend_dom_binding.v5" ||
    binding.version === "ax_backend_dom_binding.v6" && action === "accept" && documentUrl === "https://toom.de/" && selector === TOOM_ACCEPT_SELECTOR) && control.tagName === "button" && binding.tagName === "button"
    ? binding.verifiedButtonSelector
    : binding.version === "ax_backend_dom_binding.v4" && control.tagName === "div" && binding.tagName === "div"
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

/** The retained Resideo TrustArc buttons use uppercase rendering over the
 * source caption. Accept only those two caption pairs on the verified banner. */
export function resideoTrustArcSourceLabel(
  candidate: ConsentControlCandidateEvidence,
  geometry: ConsentControlGeometryArtifact,
  action: "accept" | "reject",
): string | undefined {
  const sourceLabel = action === "accept" ? "Agree" : "Decline All";
  const selector = action === "accept" ? "#truste-consent-button" : "#truste-consent-required";
  const group = "#truste-consent-buttons div.consent-buttons-2";
  if (geometry.pageUrl !== "https://www.resideo.com/us/en/resideo-home/" ||
      candidate.frameContext.frameUrl !== geometry.pageUrl || candidate.frameContext.frameKind !== "main_frame" ||
      candidate.tagName !== "button" || candidate.selectorHint !== selector ||
      candidate.label !== sourceLabel.toUpperCase() || candidate.ariaLabel || candidate.title || candidate.value ||
      candidate.containerSelectorHint !== group ||
      !Array.isArray(geometry.containers) || !geometry.containers.some(container => container?.containerId === candidate.containerId &&
        container.selectorHint === group && container.layer === "first_layer" && container.intersectsViewport) ||
      !geometry.cmp?.detections?.some(detection => detection.canonicalName === "TrustArc" &&
        detection.matchedSignals.some(signal => signal.source === "dom" && signal.value === "#truste-consent-track") &&
        detection.matchedSignals.some(signal => signal.source === "host" && signal.value === "consent.trustarc.com"))) return undefined;
  return sourceLabel;
}
