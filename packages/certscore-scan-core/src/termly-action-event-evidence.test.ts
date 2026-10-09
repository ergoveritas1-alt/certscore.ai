import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema, projectPostAcceptEvidenceForReport } from "@certscore/contracts";

type EventMode = "complete" | "mixed" | "malformed" | "none" | "preexisting" | "before_click" | "before_reject";
async function withFixture(mode: EventMode, run: (url: string, counts: { actions: number; submissions: number }) => Promise<void>) {
  const counts = { actions: 0, submissions: 0 };
  const server = createServer((req,res) => {
    if (req.method === "POST") counts.submissions++;
    if (req.url === "/action") { counts.actions++; res.writeHead(204).end(); return; }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><body>
      <div id="termly-banner" data-termly-part="consent-banner"><p>We use cookies for analytics and advertising. Choose your consent preferences.</p>
        <div data-termly-part="banner-actions"><button id="accept">Accept all</button><button id="reject">Reject all</button></div></div>
      <script>
        const handlers=[];
        const categories=['essential','performance','analytics','advertising','social_networking','unclassified'];
        // Deliberately stale API: only the documented consent event changes.
        let scheduled=false;
        window.Termly={getConsentState:()=>{
          // An asynchronous baseline getter allows an event to arrive before
          // dispatch but after the reader sampled its event cache. This must
          // never become confirmation of the subsequent click.
          const mode=${JSON.stringify(mode)};
          if(['before_click','before_reject'].includes(mode)&&!scheduled){
            scheduled=true;
            return new Promise(resolve=>setTimeout(()=>{
              handlers.forEach(handler=>handler({categories:mode==='before_reject'?['essential']:categories,cookies:[]}));
              resolve(Object.fromEntries(categories.map(key=>[key,mode==='before_reject'||key==='essential'])));
            },0));
          }
          return Object.fromEntries(categories.map(key=>[key,key==='essential']));
        },on:(event,handler)=>{
          if(event==='consent'){handlers.push(handler);if(${JSON.stringify(mode)}==='preexisting')handler({categories,cookies:[]});}
        }};
        for(const action of ['accept','reject'])document.getElementById(action).onclick=()=>{
          fetch('/action');document.getElementById('termly-banner').remove();
          const mode=${JSON.stringify(mode)};
          if(!['none','preexisting','before_click','before_reject'].includes(mode))handlers.forEach(handler=>handler({categories:mode==='malformed'?['invented_category']:mode==='mixed'?['essential','analytics']:action==='accept'?categories:['essential'],cookies:[],uuid:'do-not-retain'}));
          document.body.insertAdjacentHTML('beforeend','<form method="post" action="/submit" aria-label="Contact"><label>Name<input name="name" value="private-entered-value"></label><label>Email<input name="email" type="email"></label></form>');
        };
      </script>`);
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const address=server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`,counts); }
  finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
const authorization = { authorizationId: "loopback_local_lab", kind: "loopback" as const };

test("documented Termly event confirms one Accept click and enables existing masked form screenshots", async () => {
  await withFixture("complete",async(url,counts)=>{
    const recipe=buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==="Termly");assert.ok(recipe);
    assert.match(recipe.recipeId, /:v2$/);
    const packet=await runPostAcceptObserver({url,scanId:"termly-event-accept",recipe,
      interactionAuthorization:authorization,actionSearchTimeoutMs:1000,confirmationTimeoutMs:500,
      observationWindowMs:3000,productionProjectable:true,formSnapshotReviewer:async()=>({safeForDisplay:true})});
    assert.equal(counts.actions,1);assert.equal(counts.submissions,0);
    assert.equal(packet.acceptanceRegistration.status,"confirmed");
    assert.equal(packet.acceptanceRegistration.witnesses[0]?.witnessType,"cmp_api_state");
    assert.equal(packet.decisionEvidence?.decision,"granted");
    assert.ok(postAcceptEvidencePacketSchema.safeParse(packet).success);
    assert.equal(packet.formSnapshotCapture?.snapshots[0]?.status,"available");
    const projection=projectPostAcceptEvidenceForReport({packet,packetSha256:"a".repeat(64)});
    assert.equal(projection.formSnapshotCapture?.snapshots[0]?.status,"available");
    assert.ok(!JSON.stringify(projection).includes("private-entered-value"));
    assert.ok(!JSON.stringify(projection).includes("do-not-retain"));
  });
});

test("documented Termly refusal event confirms one Reject click without inventing offending activity", async () => {
  await withFixture("complete",async(url,counts)=>{
    const recipe=buildCanonicalPostRefusalActionRecipes().find(r=>r.cmpId==="Termly");assert.ok(recipe);
    assert.match(recipe.recipeId, /:v2$/);
    const packet=await runPostRefusalObserver({url,scanId:"termly-event-reject",recipe,
      interactionAuthorization:authorization,actionSearchTimeoutMs:1000,confirmationTimeoutMs:500,
      observationWindowMs:200,productionProjectable:true});
    assert.equal(counts.actions,1);assert.equal(counts.submissions,0);
    assert.equal(packet.refusalRegistration.status,"confirmed");
    assert.equal(packet.decisionEvidence?.decision,"denied");
    assert.equal(packet.observations.length,0);
    assert.ok(postRefusalEvidencePacketSchema.safeParse(packet).success);
  });
});

for(const mode of ["mixed","malformed","none","preexisting","before_click"] as const) {
  test(`Termly ${mode} Accept remains unconfirmed and retains only bounded after-click form fields`, async()=>{
    await withFixture(mode,async(url,counts)=>{
      const recipe=buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==="Termly");assert.ok(recipe);
      const packet=await runPostAcceptObserver({url,scanId:`termly-event-${mode}`,recipe,
        interactionAuthorization:authorization,actionSearchTimeoutMs:1000,confirmationTimeoutMs:100,
        observationWindowMs:300,productionProjectable:true,formSnapshotReviewer:async()=>({safeForDisplay:true})});
      assert.equal(counts.actions,1);assert.equal(counts.submissions,0);
      assert.equal(packet.acceptanceRegistration.status,"unconfirmed");
      assert.equal(packet.productionProjectable,false);
      assert.equal(packet.formSnapshotCapture,undefined);
      assert.equal(packet.formCapture?.frames[0]?.forms[0]?.fields.length,2);
      assert.ok(postAcceptEvidencePacketSchema.safeParse(packet).success);
    });
  });
}

for (const mode of ["mixed", "malformed", "none", "before_reject"] as const) {
  test(`Termly ${mode} Reject does not turn default-denied state into confirmed refusal`, async () => {
    await withFixture(mode, async (url, counts) => {
      const recipe = buildCanonicalPostRefusalActionRecipes().find(r => r.cmpId === "Termly"); assert.ok(recipe);
      const packet = await runPostRefusalObserver({ url, scanId: `termly-reject-${mode}`, recipe,
        interactionAuthorization: authorization, actionSearchTimeoutMs: 1000, confirmationTimeoutMs: 100,
        observationWindowMs: 300, productionProjectable: true });
      assert.equal(counts.actions, 1); assert.equal(counts.submissions, 0);
      assert.equal(packet.refusalRegistration.status, "unconfirmed");
      assert.equal(packet.productionProjectable, false);
      assert.equal(packet.observations.length, 0);
      assert.ok(postRefusalEvidencePacketSchema.safeParse(packet).success);
    });
  });
}
