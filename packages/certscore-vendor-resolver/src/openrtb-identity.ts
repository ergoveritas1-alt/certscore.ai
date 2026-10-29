import type {ProtocolJson} from "./bounded-protocol-json";

export type OpenRtbContext = {
  contractVersion: "bounded_openrtb_context.v1";
  identityCarriers: "none" | "user" | "user_ext" | "mirrored_equal";
  gpcSignal?: "enabled" | "disabled" | "invalid";
  indexAuction?: {contractVersion:"index_banner_auction.v1"; publisherRouting:"consistent_site_id"; bannerImpressions:number};
  magniteAuction?: {contractVersion:"magnite_banner_auction.v1"; publisherRouting:"same_request_account_site_zone"; bannerImpressions:number};
};
function fail(): never { throw Error("duplicate_fields"); }
const object = (v: ProtocolJson | undefined): v is Record<string, ProtocolJson> => v !== null && typeof v === "object" && !Array.isArray(v);
// Object key order is not identity. Arrays inside an EID remain ordered and
// are compared in full; a UID from another source or carrier cannot fill a gap.
function canonical(v: ProtocolJson): string {
  return JSON.stringify(Array.isArray(v) ? v.map(x=>JSON.parse(canonical(x))) : object(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]!))])) : v);
}
export function readOpenRtbIdentities(user: ProtocolJson | undefined): {fields: URLSearchParams; context: OpenRtbContext} {
  const fields=new URLSearchParams(),context:OpenRtbContext={contractVersion:"bounded_openrtb_context.v1",identityCarriers:"none"};
  if(!object(user))return {fields,context};
  const ext=object(user.ext)?user.ext:undefined;
  const inventory=(value:ProtocolJson|undefined):Map<string,Record<string,ProtocolJson>>|undefined=>{
    if(value===undefined)return;
    if(!Array.isArray(value)||value.length>8)fail();
    const rows=new Map<string,Record<string,ProtocolJson>>();
    for(const item of value){
      if(!object(item)||typeof item.source!=="string"||!item.source||rows.has(item.source)||!Array.isArray(item.uids)||item.uids.length!==1||!object(item.uids[0]))fail();
      const id=item.uids[0].id;if(typeof id!=="string"||!id)fail();
      rows.set(item.source,item);
    }
    return rows;
  };
  const a=inventory(user.eids),b=inventory(ext?.eids);
  if(a&&b){
    if(a.size!==b.size||[...a].some(([source,item])=>!b.has(source)||canonical(item)!==canonical(b.get(source)!)))fail();
    context.identityCarriers="mirrored_equal";
  }else if(a)context.identityCarriers="user";else if(b)context.identityCarriers="user_ext";
  for(const [source,item]of a??b??[])if(["pubcid.org","sharedid.org","id5-sync.com","liveramp.com"].includes(source))
    fields.append(`eid_${source}`,(item.uids as Record<string,ProtocolJson>[])[0]!.id as string);
  return {fields,context};
}
/** A transmitted preference flag is context, never an honoring acknowledgment. */
export function openRtbGpcSignal(root: Record<string,ProtocolJson>): OpenRtbContext["gpcSignal"] {
  const regs=object(root.regs)?root.regs:undefined,ext=regs&&object(regs.ext)?regs.ext:undefined;
  if(!ext||!Object.hasOwn(ext,"gpc"))return;
  const v=ext.gpc;
  return v===true||v===1||v==="1"?"enabled":v===false||v===0||v==="0"?"disabled":"invalid";
}
