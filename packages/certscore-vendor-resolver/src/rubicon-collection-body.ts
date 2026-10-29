import {readBoundedProtocolJson,readMagniteProtocolJson, type ProtocolJson} from "./bounded-protocol-json";
import {protocolLimit} from "./protocol-limit";
import {readOpenRtbIdentities,openRtbGpcSignal,type OpenRtbContext} from "./openrtb-identity";

/** Exact retained collector. Generic OpenRTB shape is never recipient proof. */
export function isRubiconExchangeCollection(url: URL): boolean {
  return url.origin === "https://fastlane.rubiconproject.com" && url.pathname === "/a/api/prebid-exchange.json";
}
function fail(code = "unsupported_fields"): never { throw Error(code); }
const object = (v: ProtocolJson | undefined): v is Record<string, ProtocolJson> => v !== null && typeof v === "object" && !Array.isArray(v);
type Check = (v: ProtocolJson) => void;
const scalar: Check = v => { if (v !== null && !["string", "number", "boolean"].includes(typeof v)) fail(); };
const list = (check: Check, cap = 16): Check => v => {
  if (!Array.isArray(v)) fail();
  if ((v as ProtocolJson[]).length > cap) protocolLimit("array_items");
  for (const item of v as ProtocolJson[]) check(item);
};
const shape = (keys: string, children: Record<string, Check> = {}): Check => v => {
  if (!object(v)) fail();
  const allowed = new Set(keys.split(" ").filter(Boolean));
  for (const [key, item] of Object.entries(v as Record<string, ProtocolJson>)) {
    if (Object.hasOwn(children, key)) children[key]!(item);
    else if (allowed.has(key)) scalar(item);
    else fail();
  }
};
const strings = list(v => { if (typeof v !== "string") fail(); });
const eid = shape("source inserter matcher mm", {uids: list(shape("id atype", {ext: shape("stype")}), 8)});
// Publisher-defined first-party-data maps require a separate reviewed schema.
// Do not silently drop them or flatten their keys into visitor identities.
const rubicon = shape("account_id site_id zone_id accountId siteId zoneId position floor bidonmultiformat");
const slotData=shape("aupname divId pbadslot",{adserver:shape("name adslot")});
const impression = shape("id tagid bidfloor bidfloorcur secure instl", {
  banner: shape("w h pos topframe id", {format: list(shape("w h wratio hratio wmin")), battr: list(scalar), btype: list(scalar), api: list(scalar)}),
  ext: shape("gpid tid tidSource", {data:slotData,rubicon, prebid: shape("adunitcode", {floors:shape("floorMin floorMinCur"),bidder: shape("", {rubicon, dvplus: rubicon})}), rp: shape("", {rtb: shape("", {formats: strings})})}),
});
const regs = shape("coppa gpp gdpr us_privacy", {gpp_sid: list(v => { if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 63) fail(); }), ext: shape("gdpr us_privacy gpc")});
const rootShape = shape("id at tmax test", {
  cur: strings, bcat: strings, badv: strings,
  imp: list(impression),
  site: shape("id name domain page ref search mobile privacypolicy keywords", {
    cat: strings, sectioncat: strings, pagecat: strings, publisher: shape("id name domain", {cat: strings}),
    ext: shape("amp",{data:shape("documentLang")}),
  }),
  device: shape("ua ip ipv6 dnt lmt js language devicetype make model os osv h w pxratio connectiontype ifa", {
    ext: shape("cdep vpw vph webdriver"), sua: shape("mobile source", {browsers: list(shape("brand", {version: strings})), platform: shape("brand", {version: strings})}),
  }),
  user: shape("id buyeruid yob gender keywords customdata", {
    eids: list(eid, 8), ext: shape("consent", {eids: list(eid, 8)}),
  }),
  regs, source: shape("fd tid pchain", {ext: shape("tidSource", {schain: shape("ver complete", {nodes: list(shape("asi sid hp rid name domain"))})})}),
  ext: shape("source integration version", {prebid: shape("auctiontimestamp adServerCurrency safeRenderer", {
    channel: shape("name version"),targeting:shape("includewinners includebidderkeys"),
    aliases:shape("rubicon magnite"),aliasgvlids:shape("rubicon magnite"),page_view_ids:shape("rubicon magnite"),
    floors:shape("enabled floorMin floorMinCur"),
  })}),
});
function processing(root: Record<string, ProtocolJson>): URLSearchParams {
  const fields = new URLSearchParams(), r = root.regs;
  if (!object(r ?? null)) return fields;
  for (const key of ["gpp", "gpp_sid"] as const) if (Object.hasOwn(r as object, key)) {
    const v = (r as Record<string, ProtocolJson>)[key];
    fields.append(key, key === "gpp_sid" && Array.isArray(v) && v.every(x => typeof x === "number" && Number.isInteger(x)) ? v.join(",") : typeof v === "string" ? v : "[invalid]");
  }
  const ext = (r as Record<string, ProtocolJson>).ext;
  if (Object.hasOwn(r as object, "us_privacy")) {
    const v = (r as Record<string, ProtocolJson>).us_privacy;
    fields.append("us_privacy", typeof v === "string" ? v : "[invalid]");
  }
  if (object(ext ?? null) && Object.hasOwn(ext as object, "us_privacy")) {
    const v = (ext as Record<string, ProtocolJson>).us_privacy;
    fields.append("us_privacy", typeof v === "string" ? v : "[invalid]");
  }
  return fields;
}
export function readRubiconExchangeProcessing(url: URL, body: string, structuralPolicy?:"magnite_json_structure.v1"): URLSearchParams | null {
  if (!isRubiconExchangeCollection(url)) return null;
  try {
    const read=structuralPolicy==="magnite_json_structure.v1"?readMagniteProtocolJson:readBoundedProtocolJson;
    const root = read(body, [...url.searchParams].length);
    return object(root) ? processing(root) : null;
  } catch { return null; }
}
/** Reviewed Magnite adapter only. Query routing must corroborate the exact
 * per-impression DV+ account/site/zone tuple, not an alias or vendor label. */
function auctionWitness(url:URL,root:Record<string,ProtocolJson>):OpenRtbContext["magniteAuction"] {
  const one=(key:string)=>{const values=url.searchParams.getAll(key);return values.length===1?values[0]:undefined;};
  if(one("m")!=="banner")return;
  const imps=root.imp as Record<string,ProtocolJson>[];
  if(one("s")!==String(imps.length))return;
  const prebid=object(root.ext)&&object(root.ext.prebid)?root.ext.prebid:undefined;
  if(!prebid||!object(prebid.channel)||prebid.channel.name!=="pbjs")return;
  const site=object(root.site)?root.site:undefined;
  try{const page=new URL(typeof site?.page==="string"?site.page:"");
    if(!["http:","https:"].includes(page.protocol)||page.username||page.password)return;
  }catch{return;}
  const id=(v:ProtocolJson|undefined)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=999999999999?String(v):
    typeof v==="string"&&/^[1-9][0-9]{0,11}$/.test(v)?v:undefined;
  const geometry=(v:Record<string,ProtocolJson>)=>[v.w,v.h].every(n=>typeof n==="number"&&Number.isInteger(n)&&n>0&&n<=16384);
  const seen=new Set<string>();let accountSite:string|undefined;
  for(const imp of imps){
    if(seen.has(imp.id as string))return;seen.add(imp.id as string);
    const banner=imp.banner as Record<string,ProtocolJson>;
    const formats=Array.isArray(banner.format)?banner.format as Record<string,ProtocolJson>[]:[];
    if((banner.w!==undefined||banner.h!==undefined)&&!geometry(banner))return;
    if(formats.length&&!formats.every(geometry)||!geometry(banner)&&!formats.length)return;
    const ext=object(imp.ext)?imp.ext:undefined;
    const p=ext&&object(ext.prebid)?ext.prebid:undefined;
    const bidders=p&&object(p.bidder)?p.bidder:undefined;
    if(!bidders||Object.keys(bidders).length!==1||!object(bidders.dvplus))return;
    const route=bidders.dvplus,account=id(route.accountId),siteId=id(route.siteId),zone=id(route.zoneId);
    // This recipe does not reinterpret legacy/snake-case routing or combine
    // several publisher routing carriers into a synthetic tuple.
    if(!account||!siteId||!zone||["account_id","site_id","zone_id"].some(k=>Object.hasOwn(route,k))||ext?.rubicon!==undefined)return;
    const current=`${account}-${siteId}`;
    if(accountSite!==undefined&&accountSite!==current||one("as")!==current)return;
    accountSite=current;
  }
  return {contractVersion:"magnite_banner_auction.v1",publisherRouting:"same_request_account_site_zone",bannerImpressions:imps.length};
}
export function decodeRubiconExchangeCollectionBody(url: URL, body: string): {fields: URLSearchParams; format: "json";context:OpenRtbContext} | null {
  if (!isRubiconExchangeCollection(url)) return null;
  const root = readMagniteProtocolJson(body, [...url.searchParams].length);
  rootShape(root);
  if (!object(root) || typeof root.id !== "string" || !root.id || !Array.isArray(root.imp) || !root.imp.length || !object(root.site ?? null)) fail();
  for (const imp of root.imp as ProtocolJson[]) if (!object(imp) || typeof imp.id !== "string" || !imp.id || !object(imp.banner ?? null)) fail();
  const fields = processing(root as Record<string, ProtocolJson>),identity=readOpenRtbIdentities((root as Record<string,ProtocolJson>).user);
  for(const [key,value]of identity.fields)fields.append(key,value);
  const gpcSignal=openRtbGpcSignal(root as Record<string,ProtocolJson>);
  const magniteAuction=auctionWitness(url,root);
  return {fields, format: "json",context:{...identity.context,...(gpcSignal?{gpcSignal}:{}),...(magniteAuction?{magniteAuction}:{})}};
}
