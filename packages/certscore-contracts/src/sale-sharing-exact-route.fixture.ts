import {SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorization,saleSharingOptOutEvidenceSchema} from "./sale-sharing-opt-out";

export const exactRouteSources=["https://hollisterco.com/","https://livroreclamacoes.pt/","https://volkswagen.co.uk/","https://fc-moto.com/","https://jaguar.com/","https://readcube.com/","https://viadeo.com/","https://ift.tt/","https://gimbal.com/","https://cognitiondigital.io/"];
export function exactRouteEvidenceFixture(original="https://jaguar.com/"){
  const grant=saleSharingExactRouteAuthorization(original)!;
  return saleSharingOptOutEvidenceSchema.parse({contractVersion:"certscore.sale-sharing-opt-out-evidence.v3",policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,
    scanId:"route-fixture",parentDispatchSha256:"a".repeat(64),targetUrl:original,documentToken:"loader",exactRouteAuthorization:grant,actionTargetUrl:grant.targets.at(-1),tlsValidated:true,
    exactRouteProof:{version:"sale_sharing_exact_route_proof.v1",hops:grant.targets.map((toUrl,i)=>({version:"sale_sharing_redirect_proof.v1",fromUrl:i===0?original:grant.targets[i-1],toUrl,status:302,sourceRequestId:`r${i}`,targetRequestId:`r${i+1}`,tlsValidated:true}))},
    startedAt:"2026-10-23T00:00:00Z",confirmedAt:"2026-10-23T00:00:01Z",completedAt:"2026-10-23T00:00:02Z",status:"complete",recipeVersion:"onetrust.explicit_sale_share.v2",provider:"OneTrust",actionCount:1,submitted:true,registration:"confirmed",before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,requests:[],limitations:[]});
}
