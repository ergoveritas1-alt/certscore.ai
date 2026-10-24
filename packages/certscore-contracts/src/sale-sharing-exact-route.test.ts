import assert from "node:assert/strict";
import test from "node:test";
import {exactRouteEvidenceFixture,exactRouteSources} from "./sale-sharing-exact-route.fixture";
import {SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorization,saleSharingOptOutDispatchSchema,saleSharingOptOutEvidenceSchema,saleSharingOptOutMatchesDispatch,saleSharingOptOutBindsDocument} from "./sale-sharing-opt-out";

const expected=[
  ["https://www.hollisterco.com/shop/us"],["https://www.livroreclamacoes.pt/Inicio/"],
  ["https://www.volkswagen.co.uk/","https://www.volkswagen.co.uk/en.html"],
  ["https://fc-moto.com/en-us/","https://www.fc-moto.com/en-us/"],
  ["https://www.jaguar.com/","https://www.jaguar.com/en-us/index.html?akam_redirect=true"],
  ["https://www.readcube.com/","https://about.readcube.com/"],["https://viadeo.journaldunet.com/"],
  ["https://ifttt.com/"],["https://infillion.com/"],["https://cognitionads.com/","https://www.cognitionads.com/"],
];
for(const [i,original] of exactRouteSources.entries())test(`exact route is source-bound and persists full proof: ${original}`,()=>{
  const grant=saleSharingExactRouteAuthorization(original)!;
  assert.deepEqual(grant.targets,expected[i]);
  const config=saleSharingOptOutDispatchSchema.parse({enabled:true,policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,scanId:"route-fixture",exactTargetUrl:original,exactRouteAuthorization:grant});
  const packet=exactRouteEvidenceFixture(original);
  assert.ok(saleSharingOptOutMatchesDispatch(packet,config));assert.ok(saleSharingOptOutBindsDocument(packet,original));assert.ok(saleSharingOptOutBindsDocument(packet,grant.targets.at(-1)!));
  if(grant.targets.length===2)assert.equal(saleSharingOptOutBindsDocument(packet,grant.targets[0]!),false);
  assert.equal(saleSharingOptOutMatchesDispatch(packet,{...config,scanId:"other"}),false);
  for(const targets of [[],[...grant.targets].reverse().concat("https://unapproved.com/"),[grant.targets.at(-1)!+"?extra=1"]])assert.equal(saleSharingOptOutDispatchSchema.safeParse({...config,exactRouteAuthorization:{...grant,targets}}).success,false);
  // Returned grants cannot mutate the reviewed registry.
  grant.targets[0]="https://unapproved.com/";assert.deepEqual(saleSharingExactRouteAuthorization(original)!.targets,expected[i]);
});

test("Salomon, other candidates, alternate entrances and legacy versions cannot gain exact-route authority",()=>{
  const grant=saleSharingExactRouteAuthorization("https://jaguar.com/")!;
  for(const original of ["https://salomon.com/","https://nubia.com/","https://securid.com/","https://www.jaguar.com/","http://jaguar.com/","https://jaguar.com/?x=1","https://jaguar.com/path","https://jaguar.com:443/","https://JAGUAR.com/","https://jaguar.com.evil.com/"]){
    assert.equal(saleSharingExactRouteAuthorization(original),undefined);
    assert.equal(saleSharingOptOutDispatchSchema.safeParse({enabled:true,policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,scanId:"one",exactTargetUrl:original,exactRouteAuthorization:grant}).success,false);
  }
  const packet=exactRouteEvidenceFixture();
  for(const policyVersion of ["bounded_sale_sharing_opt_out.v1","bounded_sale_sharing_opt_out.v2-apex-www"]){
    assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...packet,policyVersion}).success,false);
    assert.equal(saleSharingOptOutDispatchSchema.safeParse({enabled:true,policyVersion,scanId:"one",exactTargetUrl:packet.targetUrl,exactRouteAuthorization:grant}).success,false);
  }
  for(const contractVersion of ["certscore.sale-sharing-opt-out-evidence.v1","certscore.sale-sharing-opt-out-evidence.v2"])assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...packet,contractVersion}).success,false);
});

test("missing, reordered, repeated, truncated and changed-query route proof fails closed",()=>{
  const p=exactRouteEvidenceFixture(),hops=p.exactRouteProof!.hops;
  for(const proof of [null,undefined,{...p.exactRouteProof,hops:[]},{...p.exactRouteProof,hops:hops.slice(1)},{...p.exactRouteProof,hops:[...hops].reverse()},
    {...p.exactRouteProof,hops:[hops[0],{...hops[1],sourceRequestId:"wrong"}]},
    {...p.exactRouteProof,hops:[hops[0],{...hops[1],targetRequestId:hops[0]!.sourceRequestId}]},
    {...p.exactRouteProof,hops:[hops[0],{...hops[1],tlsValidated:false}]},
    ...["false","true&akam_redirect=true","true&extra=1"].map(v=>({...p.exactRouteProof,hops:[hops[0],{...hops[1],toUrl:`https://www.jaguar.com/en-us/index.html?akam_redirect=${v}`}]}))]){
    assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...p,exactRouteProof:proof}).success,false);
  }
  for(const patch of [{actionTargetUrl:p.exactRouteAuthorization!.targets[0]},{actionTargetUrl:null},{tlsValidated:false},{exactRouteAuthorization:undefined},{redirectProof:null}])assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...p,...patch}).success,false);
  assert.ok(saleSharingOptOutEvidenceSchema.safeParse({...p,actionTargetUrl:p.targetUrl,exactRouteProof:null}).success,"direct original target remains authorized");
});
