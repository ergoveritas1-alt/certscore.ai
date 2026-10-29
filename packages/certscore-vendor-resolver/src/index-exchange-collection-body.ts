import { readBoundedProtocolJson, type ProtocolJson } from "./bounded-protocol-json";
import {protocolLimit} from "./protocol-limit";
import {readOpenRtbIdentities,openRtbGpcSignal,type OpenRtbContext} from "./openrtb-identity";

/** Reviewed Prebid ixBidAdapter envelope, pinned in the coverage policy. Only
 * banner requests and explicitly reviewed metadata are supported. The separate
 * versioned auction witness requires publisher routing and usable geometry. */
export function isIndexExchangeCollection(url: URL): boolean {
  return url.origin === "https://htlb.casalemedia.com" && url.pathname === "/openrtb/pbjs";
}

function fail(code = "unsupported_fields"): never { throw Error(code); }
const object = (value: ProtocolJson | undefined): value is Record<string, ProtocolJson> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
type Check = (value: ProtocolJson) => void;
const scalar: Check = value => { if (value !== null && !["string", "number", "boolean"].includes(typeof value)) fail(); };
const list = (check: Check, cap = 16): Check => value => {
  if (!Array.isArray(value)) fail();
  if ((value as ProtocolJson[]).length > cap) protocolLimit("array_items");
  for (const item of value as ProtocolJson[]) check(item);
};
const shape = (scalars: string, children: Record<string, Check> = {}): Check => value => {
  if (!object(value)) fail();
  const allowed = new Set(scalars.split(" ").filter(Boolean));
  for (const [key, item] of Object.entries(value as Record<string, ProtocolJson>)) {
    if (Object.hasOwn(children, key)) children[key]!(item);
    else if (allowed.has(key)) scalar(item);
    else fail();
  }
};
const strings = list(value => { if (typeof value !== "string") fail(); });
const adserver=shape("name adslot");
const slotData=shape("aupname divId pbadslot",{adserver});
const impExt = shape("siteID sid externalID tid tidSource gpid dfp_ad_unit_code tagid adunitcode divId fl",{data:slotData});
const dimensions = shape("w h",{ext:impExt});
const impression = shape("id adunitCode bidfloor bidfloorcur secure", {
  banner: shape("w h topframe pos", { format: list(dimensions), ext: impExt }), ext: impExt,
});
const eid = shape("source inserter matcher mm", { uids: list(shape("id atype",{ext:shape("stype")}), 8) });
const regs = shape("coppa gpp", {
  gpp_sid: list(value => { if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 63) fail(); }),
  ext: shape("gdpr us_privacy gpc"),
});
const site = shape("id name domain page ref search mobile privacypolicy keywords", {
  cat: strings, sectioncat: strings, pagecat: strings, publisher: shape("id name domain", { cat: strings }),
  ext:shape("amp",{data:shape("documentLang")}),
});
const user = shape("id buyeruid yob gender keywords customdata", {
  eids: list(eid, 8), ext: shape("consent", { eids:list(eid,8),consented_providers_settings: shape("addtl_consent") }),
});
const source = shape("tid", { ext: shape("tidSource", { schain: shape("ver complete", {
  nodes: list(shape("asi sid hp rid name domain")),
}) }) });
const rootShape = shape("id at tmax test cur", {
  site, user, regs, source, imp: list(impression), device: shape("w h ua language dnt",{
    ext:shape("vpw vph webdriver cdep"),sua:shape("mobile source",{platform:shape("brand",{version:strings}),browsers:list(shape("brand",{version:strings}))}),
  }),
  ext: shape("source", {
    ixdiag: shape("ls tmax syncsPerBidder imps fpd tagid adunitcode divId usid mfu bu iu nu ou allu ren version url vpd eidLength pbadslot",{userIds:strings}),
    features:shape("",{pbjs_enable_multiformat:shape("activated"),pbjs_allow_all_eids:shape("activated")}),
  }),
});

/** Read only the protocol's reviewed processing locations even when unrelated
 * ad metadata is unsupported. Duplicate JSON keys still fail the whole read. */
function processing(root: Record<string, ProtocolJson>): URLSearchParams {
  const fields = new URLSearchParams();
  if (!object(root.regs ?? null)) return fields;
  const r = root.regs as Record<string, ProtocolJson>;
  for (const key of ["gpp", "gpp_sid"] as const) if (Object.hasOwn(r, key)) {
    const value = r[key];
    fields.append(key, key === "gpp_sid" && Array.isArray(value) && value.every(v => typeof v === "number" && Number.isInteger(v))
      ? value.join(",") : typeof value === "string" ? value : "[invalid]");
  }
  if (object(r.ext ?? null) && Object.hasOwn(r.ext as object, "us_privacy")) {
    const value = (r.ext as Record<string, ProtocolJson>).us_privacy;
    fields.append("us_privacy", typeof value === "string" ? value : "[invalid]");
  }
  return fields;
}

export function readIndexExchangeProcessing(url: URL, body: string): URLSearchParams | null {
  if (!isIndexExchangeCollection(url)) return null;
  try {
    const root = readBoundedProtocolJson(body.trim(), [...url.searchParams].length);
    return object(root) ? processing(root) : null;
  } catch { return null; }
}

/** Exact adapter routing, not publisher ownership or a legal sale verdict.
 * Inspect only the already bounded tree; no extra reads or retained raw IDs. */
function auctionWitness(url:URL,root:Record<string,ProtocolJson>):OpenRtbContext["indexAuction"] {
  const siteIds:string[]=[];
  const siteId=(value:ProtocolJson|undefined):boolean=>{
    if(value===undefined)return true;
    const id=String(value);
    if(!/^[1-9][0-9]{0,11}$/.test(id))return false;
    siteIds.push(id);return true;
  };
  const query=url.searchParams.getAll("s");
  if(query.length>1 || query.length===1&&!siteId(query[0]))return;
  const publisher=object(root.site)?root.site:undefined;
  try{const page=new URL(typeof publisher?.page==="string"?publisher.page:"");
    if(!["http:","https:"].includes(page.protocol)||page.username||page.password)return;
  }catch{return;}
  const geometry=(value:Record<string,ProtocolJson>)=>[value.w,value.h].every(n=>typeof n==="number"&&Number.isInteger(n)&&n>0&&n<=16384);
  const extId=(value:ProtocolJson|undefined)=>!object(value)||siteId(value.siteID);
  const imps=root.imp as Record<string,ProtocolJson>[];
  const seen=new Set<string>();
  for(const imp of imps){
    if(seen.has(imp.id as string))return;seen.add(imp.id as string);
    const banner=imp.banner as Record<string,ProtocolJson>;
    const formats=Array.isArray(banner.format)?banner.format as Record<string,ProtocolJson>[]:[];
    if((banner.w!==undefined||banner.h!==undefined)&&!geometry(banner))return;
    if(formats.length&&!formats.every(geometry)||!geometry(banner)&&!formats.length)return;
    if(!extId(imp.ext)||!extId(banner.ext)||!formats.every(f=>extId(f.ext)))return;
    // Every impression needs its own route or the common query route.
    const ownRoute=(object(imp.ext)&&imp.ext.siteID!==undefined)||(object(banner.ext)&&banner.ext.siteID!==undefined)||(formats.length>0&&formats.every(f=>object(f.ext)&&f.ext.siteID!==undefined));
    if(!query.length&&!ownRoute)return;
  }
  if(!siteIds.length||new Set(siteIds).size!==1)return;
  return {contractVersion:"index_banner_auction.v1",publisherRouting:"consistent_site_id",bannerImpressions:imps.length};
}

export function decodeIndexExchangeCollectionBody(url: URL, body: string): { fields: URLSearchParams; format: "json"; context:OpenRtbContext } | null {
  if (!isIndexExchangeCollection(url)) return null;
  const root = readBoundedProtocolJson(body.trim(), [...url.searchParams].length);
  rootShape(root);
  if (!object(root) || typeof root.id !== "string" || !root.id || !Array.isArray(root.imp) || !root.imp.length ||
      !object(root.ext ?? null) || (root.ext as Record<string, ProtocolJson>).source !== "prebid") fail();
  for (const imp of root.imp as ProtocolJson[]) if (!object(imp) || typeof imp.id !== "string" || !imp.id || !object(imp.banner ?? null)) fail();
  const fields = processing(root as Record<string, ProtocolJson>);
  const identity=readOpenRtbIdentities((root as Record<string, ProtocolJson>).user);
  for(const [key,value]of identity.fields)fields.append(key,value);
  const gpcSignal=openRtbGpcSignal(root as Record<string,ProtocolJson>);
  const indexAuction=auctionWitness(url,root);
  return { fields, format: "json",context:{...identity.context,...(gpcSignal?{gpcSignal}:{}),...(indexAuction?{indexAuction}:{})} };
}
