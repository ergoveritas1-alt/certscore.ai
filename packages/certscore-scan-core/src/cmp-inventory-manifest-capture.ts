import type {CmpInventoryManifest} from "@certscore/contracts";

/** Self-contained read-only browser helper, serialized with the adapter. The
 * adapter supplies only its registered cookie lists, never a global vendor list.
 * Detail extraction has a separate budget; this retains names without values. */
export function captureCmpNameManifest(lists:unknown[],key:"Name"|"cookieID",source:CmpInventoryManifest["source"],unresolvedSources=0):CmpInventoryManifest {
  const own=(value:unknown,key:string):unknown=>{
    if (!value || typeof value!=="object") return undefined;
    const d=Object.getOwnPropertyDescriptor(value,key);return d && "value" in d ? d.value : undefined;
  };
  let total=0,resolved=0,visited=0,characters=0,truncated=lists.length>128;
  const names:string[]=[];
  for (const list of lists.slice(0,128)) {
    if (!Array.isArray(list)) {unresolvedSources++;continue}
    total+=list.length;
    for(let i=0;i<list.length;i++) {
      if (visited++>=256) {truncated=true;break}
      const name=own(own(list,String(i)),key);
      if(typeof name!=="string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(name)) continue;
      if(!names.includes(name)) {
        if(characters+name.length>8192) {truncated=true;break}
        names.push(name);characters+=name.length;
      }
      resolved++;
    }
  }
  if(total>10000) truncated=true;
  total=Math.min(10000,total);
  return {version:"cmp_inventory_manifest.v1",source,names,sourceRecordCount:total,resolvedRecordCount:resolved,
    unresolvedRecordCount:total-resolved,unresolvedSources:Math.min(10000,unresolvedSources),truncated};
}
