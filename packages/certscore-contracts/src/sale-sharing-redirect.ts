import {parse} from "tldts";
import {z} from "zod";

export const SALE_SHARING_REDIRECT_POLICY="bounded_sale_sharing_opt_out.v2-apex-www" as const;
export const SALE_SHARING_REDIRECT_AUTHORIZATION="sale_sharing_apex_www.v1" as const;

/** One exact counterpart, never a host wildcard. Pinned PSL includes private
 * suffix exclusions; tenant and unknown-suffix names cannot delegate authority. */
export function saleSharingApexWwwCounterpart(value:string):string|null {
  try{
    const url=new URL(value);
    if(url.href!==value||url.protocol!=="https:"||url.port||url.username||url.password||url.pathname!=="/"||url.search||url.hash)return null;
    const site=parse(url.hostname,{allowPrivateDomains:true});
    if(!site.isIcann||site.isPrivate||site.isIp||!site.domain||!site.publicSuffix)return null;
    // Bound both legal DNS names and retained authorization metadata, including
    // the four characters added by the www counterpart.
    if(site.domain.length>249||url.hostname.split(".").some(label=>label.length>63||!label.length))return null;
    if(url.hostname===site.domain)return `https://www.${site.domain}/`;
    if(url.hostname===`www.${site.domain}`)return `https://${site.domain}/`;
    return null;
  }catch{return null;}
}

export const saleSharingRedirectAuthorizationSchema=z.object({
  version:z.literal(SALE_SHARING_REDIRECT_AUTHORIZATION),
  alternateTargetUrl:z.string().url().max(2000),
}).strict();

export const saleSharingRedirectProofSchema=z.object({
  version:z.literal("sale_sharing_redirect_proof.v1"),
  fromUrl:z.string().url().max(2000),toUrl:z.string().url().max(2000),
  status:z.union([z.literal(301),z.literal(302),z.literal(303),z.literal(307),z.literal(308)]),
  // CDP Fetch IDs bind the browser's own redirected request, not a later GET or
  // a passive lane. No header values, redirect query strings or payloads.
  sourceRequestId:z.string().min(1).max(200),targetRequestId:z.string().min(1).max(200),
  tlsValidated:z.literal(true),
}).strict();

export const SALE_SHARING_EXACT_ROUTE_POLICY="bounded_sale_sharing_opt_out.v3-exact-routes" as const;
export const SALE_SHARING_EXACT_ROUTE_AUTHORIZATION="sale_sharing_exact_route.v1" as const;

// Owner-approved October 23, 2026. These are ordered, source-specific grants,
// not host/path patterns. Do not infer another route from a passive final URL.
const exactRoutes:Readonly<Record<string,{id:string;targets:readonly string[]}>>=Object.freeze({
  "https://hollisterco.com/":{id:"hollister.v1",targets:["https://www.hollisterco.com/shop/us"]},
  "https://livroreclamacoes.pt/":{id:"livroreclamacoes.v1",targets:["https://www.livroreclamacoes.pt/Inicio/"]},
  "https://volkswagen.co.uk/":{id:"volkswagen.v1",targets:["https://www.volkswagen.co.uk/","https://www.volkswagen.co.uk/en.html"]},
  "https://fc-moto.com/":{id:"fc-moto.v1",targets:["https://fc-moto.com/en-us/","https://www.fc-moto.com/en-us/"]},
  "https://jaguar.com/":{id:"jaguar.v1",targets:["https://www.jaguar.com/","https://www.jaguar.com/en-us/index.html?akam_redirect=true"]},
  "https://readcube.com/":{id:"readcube.v1",targets:["https://www.readcube.com/","https://about.readcube.com/"]},
  "https://viadeo.com/":{id:"viadeo.v1",targets:["https://viadeo.journaldunet.com/"]},
  "https://ift.tt/":{id:"ifttt.v1",targets:["https://ifttt.com/"]},
  "https://gimbal.com/":{id:"gimbal.v1",targets:["https://infillion.com/"]},
  "https://cognitiondigital.io/":{id:"cognitiondigital.v1",targets:["https://cognitionads.com/","https://www.cognitionads.com/"]},
});
export const saleSharingExactRouteAuthorizationSchema=z.object({
  version:z.literal(SALE_SHARING_EXACT_ROUTE_AUTHORIZATION),routeId:z.string().min(1).max(64),
  targets:z.array(z.string().url().max(300)).min(1).max(2),
}).strict();
export type SaleSharingExactRouteAuthorization=z.infer<typeof saleSharingExactRouteAuthorizationSchema>;
export function saleSharingExactRouteAuthorization(original:string):SaleSharingExactRouteAuthorization|undefined {
  const route=Object.hasOwn(exactRoutes,original)?exactRoutes[original]:undefined;
  return route?{version:SALE_SHARING_EXACT_ROUTE_AUTHORIZATION,routeId:route.id,targets:[...route.targets]}:undefined;
}
export function saleSharingExactRouteMatches(original:string,grant:SaleSharingExactRouteAuthorization|undefined):boolean {
  const expected=saleSharingExactRouteAuthorization(original);
  return !!expected&&!!grant&&grant.version===expected.version&&grant.routeId===expected.routeId&&
    grant.targets.length===expected.targets.length&&grant.targets.every((url,i)=>url===expected.targets[i]);
}
export const saleSharingExactRouteProofSchema=z.object({
  version:z.literal("sale_sharing_exact_route_proof.v1"),
  hops:z.array(saleSharingRedirectProofSchema).min(1).max(2),
}).strict();
