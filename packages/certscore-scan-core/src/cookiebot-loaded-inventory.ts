import type { Locator, Page } from "playwright";
import type { CmpLoadedInventory, CmpInventoryManifest } from "@certscore/contracts";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

/** Read only the declaration cards already loaded under the exact opened
 * Cookiebot panel. No accordion clicks, SDK calls, fetches or visitor values. */
export async function readCookiebotLoadedInventory(panel: Locator, recipe: NonNullable<KnownCmpDefinition["preferenceLoadedInventory"]>, recordLimit = 100): Promise<CmpLoadedInventory> {
  return panel.evaluate((panel, {recipe, recordLimit}) => {
    const helpers = { text(node: Element | null) { return (node?.textContent ?? "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim(); } };
    const inventory: CmpLoadedInventory = {version:recipe.version,records:[],truncated:false,unresolvedRecords:0};
    const groups = panel.querySelectorAll(recipe.groupSelector);
    let visited = 0, characters = 0, nameCharacters=0;
    const manifest:CmpInventoryManifest={version:"cmp_inventory_manifest.v1",source:recipe.version,names:[],sourceRecordCount:0,resolvedRecordCount:0,unresolvedRecordCount:0,unresolvedSources:0,truncated:false};
    inventory.inventoryManifest=manifest;
    if (groups.length > 100) {inventory.truncated = true;manifest.truncated=true;}
    outer: for (let groupIndex = 0; groupIndex < Math.min(groups.length, 100); groupIndex++) {
      const group = groups[groupIndex]!;
      const providers = group.querySelectorAll(recipe.providerSelector);
      const providerNode = providers.length === 1 ? providers[0]! : null;
      // Flattening nested domain lists would invent one concatenated provider.
      const providerChildrenValid = providerNode && [...providerNode.children].every(child => child.matches(recipe.countSelector));
      const providerText = providerChildrenValid ? [...providerNode.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? "").join(" ").replace(/\s+/g," ").trim() : "";
      const provider = providerText && providerText.length <= 240 ? providerText : null;
      const records = group.querySelectorAll(recipe.recordSelector);
      for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
        if (visited++ >= 256) { inventory.truncated = true; manifest.truncated=true; break outer; }
        const record = records[recordIndex]!;
        if (record.closest(recipe.groupSelector) !== group) { inventory.unresolvedRecords++; continue; }
        const names = record.querySelectorAll(recipe.nameSelector), descriptions = record.querySelectorAll(recipe.descriptionSelector);
        const footers = [...record.querySelectorAll(recipe.footerSelector)];
        // The bracketed xN is Cookiebot's aggregate count, not part of a name.
        const name = names.length === 1 ? helpers.text(names[0]!).replace(/\s+\[x[1-9]\d{0,4}\]$/, "") : "";
        const purpose = descriptions.length === 1 ? helpers.text(descriptions[0]!).slice(0,240) : "";
        const durations = footers.filter(node => node.querySelectorAll("b").length === 1 && helpers.text(node.querySelector("b")) === "Maximum Storage Duration");
        const types = footers.filter(node => node.querySelectorAll("b").length === 1 && helpers.text(node.querySelector("b")) === "Type");
        const duration = durations.length === 1 ? (helpers.text(durations[0]!).match(/^Maximum Storage Duration\s*:\s*(.+)$/)?.[1] ?? "").slice(0,240) : "";
        const type = types.length === 1 ? helpers.text(types[0]!).replace(/^Type\s*:\s*/, "") : "";
        const storageType = type === "HTTP Cookie" ? "cookie" : type === "HTML Local Storage" ? "local_storage" : type === "IndexedDB" ? "indexed_db" : type === "Pixel Tracker" ? "pixel" : "unknown";
        if(storageType==="cookie") {
          manifest.sourceRecordCount++;
          if(!/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(name)) manifest.unresolvedRecordCount++;
          else if(!manifest.names.includes(name) && nameCharacters+name.length>8192) {manifest.truncated=true;manifest.unresolvedRecordCount++;}
          else {manifest.resolvedRecordCount++;if(!manifest.names.includes(name)){manifest.names.push(name);nameCharacters+=name.length;}}
        } else if(storageType==="unknown") manifest.unresolvedSources++;
        if(visited>recordLimit) {inventory.truncated=true;continue;}
        if (!name || name.length > 160 || /[\u0000-\u0020\u007f]/.test(name)) { inventory.unresolvedRecords++; continue; }
        const size = name.length + purpose.length + duration.length + (provider?.length ?? 0);
        if (characters + size > 16000) { inventory.truncated = true; continue; }
        characters += size;
        inventory.records.push({name,purpose,duration,storageType,provider,sourceRef:`provider:${groupIndex}/record:${recordIndex}`});
        if (!purpose || !duration || storageType === "unknown") inventory.unresolvedRecords++;
      }
    }
    return inventory;
  }, {recipe, recordLimit:Number.isFinite(recordLimit) ? Math.max(0,Math.min(100,Math.floor(recordLimit))) : 0});
}

/** Exact registered, already-mounted nodes only. No opening, waiting or fetching.
 * Node identity must survive the bounded DOM read, even when the panel is hidden. */
export async function readPassiveCookiebotLoadedInventory(page: Page, definition: KnownCmpDefinition) {
  const binding=definition.passiveLoadedInventory;
  if (binding?.version!=="cookiebot_passive_loaded_inventory.v1" || !definition.preferenceLoadedInventory || definition.canonicalName!=="Cookiebot") return undefined;
  const roots=await page.locator(binding.rootSelector).elementHandles();
  const panels=await page.locator(binding.panelSelector).elementHandles();
  try {
    if (roots.length!==1 || panels.length!==1) return undefined;
    const root=roots[0]!, panel=panels[0]!;
    const bound=()=>panel.evaluate((node,{root,binding})=>node.isConnected && root.isConnected &&
      node.ownerDocument===document && root.ownerDocument===document && root.contains(node) &&
      document.querySelectorAll(binding.rootSelector).length===1 && document.querySelectorAll(binding.panelSelector).length===1 &&
      document.querySelector(binding.rootSelector)===root && document.querySelector(binding.panelSelector)===node,{root,binding});
    if (!await bound()) return undefined;
    const inventory=await readCookiebotLoadedInventory(page.locator(binding.panelSelector),definition.preferenceLoadedInventory);
    return await bound() ? inventory : undefined;
  } finally { await Promise.all([...roots,...panels].map(handle=>handle.dispose())); }
}
