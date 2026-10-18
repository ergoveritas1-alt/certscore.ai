import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type CDPSession } from "playwright";
import { bindAccessibilityNodesToDom, AX_DOM_BINDING_MAX_NODES } from "./consent-accessibility-dom-binding.js";
import { consentControlsFromAccessibilityTree, filterAccessibilityTreeToFirstLayer, type ConsentAccessibilityTreeNode } from "./scanners/pre-consent-runtime-scanner.js";
import {buildConsentUiObservationFromEvidence,mergeConsentUiObservations} from "./scanners/pre-consent-runtime-scanner.js";
import {consentUiObservationSchema} from "@certscore/contracts";

const document = {url: "https://fixture.certscore.ai/", identity: {source: "cdp_loader_id" as const, token: "loader-1"}};
const node = (id = 1): ConsentAccessibilityTreeNode => ({nodeId: String(id), backendDOMNodeId: id,
  visibilityEvidence: "box_model_verified", role: {value: "button"}, name: {value: "Accept all"}});

test("same-loader URL transitions cannot merge native controls into a different observed URL",()=>{
 const control={label:'Accept all',actionType:'accept_all' as const,tagName:'button',selectorHint:'ax:1',visible:true,
  visibilityEvidence:'box_model_verified' as const,consentContextEvidence:'local_surface' as const,classifierReasonCodes:[],
  domBinding:{version:'ax_backend_dom_binding.v1' as const,axNodeId:'1',backendNodeId:1,nodeType:1 as const,tagName:'button',documentUrl:document.url,documentIdentity:document.identity}};
 const input={controls:[control],documentUrl:document.url,documentIdentity:document.identity,text:'We use cookies',scanStartedAtMs:Date.now()};
 const valid=buildConsentUiObservationFromEvidence(input);assert.equal(consentUiObservationSchema.safeParse(valid).success,true);
 const changed=buildConsentUiObservationFromEvidence({...input,documentUrl:document.url+'#updated'});
 assert.equal(changed.controls.length,0);assert.equal(changed.inventoryOutcome,'document_mismatch');
 assert.equal(changed.captureStatus,'incomplete');assert.equal(consentUiObservationSchema.safeParse(changed).success,true);
 const merged=mergeConsentUiObservations({...valid,observedAtMs:10},{...changed,observedAtMs:20},'fixture');
 assert.equal(merged.controls.length,0);assert.equal(merged.inventoryOutcome,'document_mismatch');
 assert.equal(consentUiObservationSchema.safeParse(merged).success,true);
 const same=mergeConsentUiObservations(valid,{...valid,observedAtMs:30},'fixture');assert.equal(same.controls.length,1);
});

test("native AX binding requires exact backend identity and bounded element metadata", async () => {
  for (const mode of ["valid", "wrong-node", "text-node", "invalid-tag", "failed"]) {
    let calls = 0;
    const client = {send: async (method: string) => {
      calls++; assert.equal(method, "DOM.describeNode");
      if (mode === "failed") throw Error("unavailable");
      return {node: {backendNodeId: mode === "wrong-node" ? 2 : 1, nodeType: mode === "text-node" ? 3 : 1,
        localName: mode === "invalid-tag" ? "not a tag" : "button", attributes: ["value", "never-retain"]}};
    }} as unknown as CDPSession;
    const result = await bindAccessibilityNodesToDom(client, [node()], document);
    assert.equal(calls, 1);
    assert.equal(Boolean(result[0]!.domBinding), mode === "valid");
    assert.ok(!JSON.stringify(result).includes("never-retain"));
  }
});

test("native binding is optional, capped, and ignores late, duplicate or unverified nodes", async () => {
  let calls = 0;
  const client = {send: async (_method: string, input: {backendNodeId: number}) => {
    calls++; return {node: {backendNodeId: input.backendNodeId, nodeType: 1, localName: "button"}};
  }} as unknown as CDPSession;
  const nodes = Array.from({length: 40}, (_, i) => node(i + 1));
  const result = await bindAccessibilityNodesToDom(client, nodes, document);
  assert.equal(calls, AX_DOM_BINDING_MAX_NODES);
  assert.equal(result.filter(n => n.domBinding).length, AX_DOM_BINDING_MAX_NODES);
  calls = 0;
  await bindAccessibilityNodesToDom(client, [node(), node(), {...node(2), visibilityEvidence: "unverified"}], document);
  await bindAccessibilityNodesToDom(client, nodes, {url: document.url});
  assert.equal(calls, 0);
  const slow = {send: async () => { await new Promise(resolve => setTimeout(resolve, 80)); return {node: {backendNodeId: 1, nodeType: 1, localName: "button"}}; }} as unknown as CDPSession;
  const limited = await bindAccessibilityNodesToDom(slow, [node()], document);
  assert.equal(limited[0]!.domBinding, undefined);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(limited[0]!.domBinding, undefined, "late completion must not mutate retained evidence");
  const mixed = {send: async (_method: string, input: {backendNodeId: number}) => {
    if (input.backendNodeId === 2) await new Promise(resolve => setTimeout(resolve, 80));
    return {node: {backendNodeId: input.backendNodeId, nodeType: 1, localName: "button"}};
  }} as unknown as CDPSession;
  const partial = await bindAccessibilityNodesToDom(mixed, [node(), node(2)], document);
  assert.ok(partial[0]!.domBinding, "one slow node must not erase another verified native read");
  assert.equal(partial[1]!.domBinding, undefined);
});

test("real AX controls retain their actual native tags and source identities", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route(document.url, route => route.fulfill({contentType: "text/html", body:
      '<section role="dialog" aria-label="We use cookies. Choose your preferences"><button>Accept all</button><button>Reject optional cookies</button></section>'}));
    await page.goto(document.url);
    const client = await page.context().newCDPSession(page);
    const tree = await client.send("Accessibility.getFullAXTree");
    const visible = await filterAccessibilityTreeToFirstLayer(client, tree.nodes, page.viewportSize());
    const bound = await bindAccessibilityNodesToDom(client, visible, document);
    const controls = consentControlsFromAccessibilityTree(bound, document.url).controls;
    assert.equal(controls.length, 2);
    assert.ok(controls.every(c => c.tagName === "button" && c.selectorHint === `ax:${c.domBinding!.axNodeId}`));
    await client.detach();
  } finally { await browser.close(); }
});
