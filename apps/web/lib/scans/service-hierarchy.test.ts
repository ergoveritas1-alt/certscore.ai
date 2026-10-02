import test from "node:test";
import assert from "node:assert/strict";
import { buildServiceHierarchy, countHierarchyServices } from "./service-hierarchy";
type Service = Parameters<typeof buildServiceHierarchy>[0][number];
const resource = (key: string, eventCount = 1, pageIds = ["p"]) => ({key, eventCount, pageIds, purposes: [], inventoryEvidence: "Review"}) as unknown as Service["resources"][number];
const service = (key: string, resources = [resource(key)], origins: Service["origins"] = []) => ({key,name:key,context:{identity:{product:key}},resources,origins,pageIds:["p"]}) as Service;
const link = (key: string, resourceKey: string, occurrenceId = resourceKey) => ({key,name:key,resourceKey,occurrenceId,eventCount:1,pageId:"p",inferred:false,nodeId:"n",edgeIds:["e"]});
test("root integration owns linked services recursively and summarizes distinct branch resources", () => {
 const tree = buildServiceHierarchy([service("youtube"), service("fonts", [resource("f")], [link("youtube","f")]), service("cdn", [resource("c")], [link("fonts","c")])]);
 assert.deepEqual(tree.map(x=>x.service.key),["youtube"]);
 assert.equal(tree[0]!.children[0]!.service.key,"fonts");
 assert.equal(tree[0]!.children[0]!.children[0]!.service.key,"cdn");
 assert.equal(tree[0]!.service.resources.length,3);
 assert.equal(tree[0]!.ownResources.length,1);
});
test("unattributed resources stay separate while fully linked resources move under parent", () => {
 const tree = buildServiceHierarchy([service("youtube"),service("fonts",[resource("linked"),resource("independent")],[link("youtube","linked")])]);
 assert.equal(tree.length,2);
 assert.deepEqual(tree.find(x=>x.service.key==="fonts")!.ownResources.map(x=>x.key),["independent"]);
 assert.deepEqual(tree.find(x=>x.service.key==="youtube")!.children[0]!.ownResources.map(x=>x.key),["linked"]);
});
test("partial, ambiguous, missing-parent and duplicate links cannot hide resource occurrences", () => {
 for (const origins of [[link("youtube","f")],[link("youtube","f"),link("maps","f")],[link("absent","f")],[link("youtube","f"),link("youtube","f")]]) {
  const tree=buildServiceHierarchy([service("youtube"),service("maps"),service("fonts",[resource("f",2)],origins)]);
  assert.ok(tree.some(x=>x.service.key==="fonts"));
  assert.ok(!tree.find(x=>x.service.key==="fonts")?.children.length);
 }
});
test("cycles retain a visible root and each resource exactly once", () => {
 const tree=buildServiceHierarchy([service("a",[resource("a")],[link("b","a")]),service("b",[resource("b")],[link("a","b")])]);
 assert.equal(tree.length,1);
 assert.equal(tree[0]!.service.resources.length,2);
 assert.equal(tree[0]!.children.length,1);
});

test("identified supporting services stay visible while unknown identities stay grouped", () => {
 const fonts = {...service("fonts"),name:"Example CDN"};
 const bst = {...service("bst", [resource("bst")], [link("absent", "bst")]), name:"BST DSGVO Cookie notice plugin, non-TCF"};
 const unknown = {...service("unknown"), context: {identity:null}} as Service;
 const tree = buildServiceHierarchy([service("youtube"),fonts,bst,unknown]);
 assert.deepEqual(tree.map(x=>x.service.name),["youtube","Example CDN",bst.name,"Other / unattributed resources"]);
 assert.equal(tree[2]!.residual,true);
 assert.deepEqual(tree[3]!.children.map(x=>x.service.key),["unknown"]);
});
test("one identified root combines site-loaded and unresolved resources while embedded resources remain nested", () => {
 const fonts={...service("fonts",[resource("site-font"),resource("embedded-font"),resource("unresolved")],[{...link("site:document","site-font"),kind:"site" as const},link("youtube","embedded-font")]),name:"Example CDN"};
 const tree=buildServiceHierarchy([service("youtube"),fonts]);
 const roots=tree.filter(x=>x.service.key==="fonts");
 assert.equal(roots.length,1);
 assert.deepEqual(roots[0]!.ownResources.map(x=>x.key).sort(),["site-font","unresolved"]);
 assert.equal(roots[0]!.directSite,false);
 assert.equal(roots[0]!.residual,true);
 assert.deepEqual(roots[0]!.service.origins,fonts.origins);
 assert.deepEqual(tree.find(x=>x.service.key==="youtube")!.children[0]!.ownResources.map(x=>x.key),["embedded-font"]);
 const owned=(branches: ReturnType<typeof buildServiceHierarchy>): string[] => branches.flatMap(branch=>[...branch.ownResources.map(row=>row.key),...owned(branch.children)]);
 assert.deepEqual(owned(tree).sort(),["embedded-font","site-font","unresolved","youtube"]);
});
test("merging identified roots retains linked children exactly once without merging names across identities", () => {
 const fonts=service("fonts",[resource("direct"),resource("unknown")],[link("site:document","direct")]);
 const sameName={...service("other-fonts"),name:fonts.name};
 const tree=buildServiceHierarchy([fonts,service("assets",[resource("asset")],[link("fonts","asset")]),sameName]);
 const root=tree.find(branch=>branch.service.key==="fonts")!;
 assert.equal(tree.length,2);
 assert.deepEqual(root.children.map(branch=>branch.service.key),["assets"]);
 assert.deepEqual(root.service.resources.map(row=>row.key).sort(),["asset","direct","unknown"]);
});

test("child function and delivery purposes never replace the parent's canonical purpose", () => {
 const identity=(product:string,vendor='Google',entity='Google LLC')=>({identity:{product,vendor,entity}}) as Service['context'];
 const mapsResource={...resource('map'),context:identity('Google Maps JavaScript API')};
 const fontResource={...resource('font'),context:identity('Google Fonts')};
 const maps={...service('maps',[mapsResource]),context:mapsResource.context};
 const fonts={...service('fonts',[fontResource],[link('maps','font')]),context:fontResource.context};
 const tree=buildServiceHierarchy([maps,fonts]);
 assert.deepEqual(tree[0]!.service.purposes,['Maps / location services']);
 assert.deepEqual(tree[0]!.children[0]!.service.purposes,['Font delivery']);
 const inverse=buildServiceHierarchy([{...maps,origins:[link('fonts','map')]},{...fonts,origins:[{...link('site:document','font'),kind:'site' as const}]}]);
 assert.deepEqual(inverse[0]!.service.purposes,['Font delivery']);
 assert.deepEqual(inverse[0]!.children[0]!.service.purposes,['Maps / location services']);
});

const googleFonts = (resources = [resource("font")], origins: Service["origins"] = []): Service => ({
 ...service("fonts", resources, origins), name: "Google Fonts",
 context: { identity: { product: "Google Fonts", vendor: "Google", entity: "Google LLC" } } as Service["context"],
});
const siteLink = (resourceKey: string) => ({...link("site:document", resourceKey), kind: "site" as const});

test("Google Fonts requires verified direct site evidence for a standalone row", () => {
 const tree = buildServiceHierarchy([googleFonts([resource("font")], [siteLink("font")])]);
 assert.equal(tree.length, 1);
 assert.equal(tree[0]!.service.key, "fonts");
 assert.equal(tree[0]!.directSite, true);
 assert.equal(countHierarchyServices(tree), 1);
});

test("Google Fonts loaded by Maps stays beneath Maps and is counted once", () => {
 const tree = buildServiceHierarchy([service("maps"), googleFonts([resource("font")], [link("maps", "font")])]);
 assert.deepEqual(tree.map(branch => branch.service.key), ["maps"]);
 assert.equal(tree[0]!.children[0]!.service.key, "fonts");
 assert.equal(countHierarchyServices(tree), 2);
});

test("unverified Google Fonts origins never produce standalone or inferred child rows", () => {
 const proof = siteLink("font");
 const cases: Service["origins"][] = [
  [], [{...proof, inferred: true}], [{...proof, edgeIds: []}], [{...proof, nodeId: ""}],
  [{...proof, kind: undefined}], [{...proof, occurrenceId: ""}], [{...proof, eventCount: 0}],
  [{...proof, pageId: "other-page"}], [proof, link("maps", "font")], [link("missing", "font")],
  [{...link("maps", "font"), inferred: true}],
 ];
 for (const origins of cases) {
  const tree = buildServiceHierarchy([service("maps"), googleFonts([resource("font")], origins)]);
  assert.deepEqual(tree.filter(branch => !branch.collection).map(branch => branch.service.key), ["maps"]);
  assert.equal(tree[0]!.children.length, 0);
  assert.deepEqual(tree.find(branch => branch.collection)!.children.map(branch => branch.service.key), ["fonts"]);
  assert.equal(countHierarchyServices(tree), 2);
 }
 for (const row of [resource("font", 2), resource("font", 1, ["p", "p2"])]) {
  const tree = buildServiceHierarchy([googleFonts([row], [proof])]);
  assert.equal(tree[0]!.collection, true);
 }
});

test("mixed direct, embedded and unresolved fonts remain separate without loss or duplicate counts", () => {
 const fonts = googleFonts([resource("direct"), resource("embedded"), resource("unknown")], [siteLink("direct"), link("maps", "embedded")]);
 const tree = buildServiceHierarchy([service("maps"), fonts]);
 assert.deepEqual(tree.find(branch => branch.directSite)!.ownResources.map(row => row.key), ["direct"]);
 assert.deepEqual(tree.find(branch => branch.service.key === "maps")!.children[0]!.ownResources.map(row => row.key), ["embedded"]);
 assert.deepEqual(tree.find(branch => branch.collection)!.children[0]!.ownResources.map(row => row.key), ["unknown"]);
 const owned = (branches: typeof tree): string[] => branches.flatMap(branch => [...branch.ownResources.map(row => row.key), ...owned(branch.children)]);
 assert.deepEqual(owned(tree).sort(), ["direct", "embedded", "maps", "unknown"]);
 assert.equal(countHierarchyServices(tree), 2);
 assert.equal(fonts.resources.length, 3);
});
