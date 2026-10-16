import { cmpLoadedInventorySchema, type CmpLoadedInventory } from "@certscore/contracts";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";
import type { Page } from "playwright";

/** Literal fields from Consentmanager's already-mounted public cookie table.
 * The SDK lazy-loads this screen; absence does not authorize opening or fetching
 * it. Never read private SDK state, sample values, or visitor storage here. */
export async function readPassiveConsentmanagerLoadedInventory(page: Page, definition: KnownCmpDefinition) {
  const binding = definition.passiveLoadedInventory;
  if (definition.canonicalName !== "Consentmanager" || binding?.version !== "consentmanager_passive_loaded_inventory.v1") return undefined;
  const roots = await page.locator(binding.rootSelector).elementHandles();
  const tables = await page.locator(`${binding.rootSelector} ${binding.panelSelector}`).elementHandles();
  try {
    if (roots.length !== 1 || tables.length !== 1) return undefined;
    const root = roots[0]!, table = tables[0]!;
    const bound = () => table.evaluate((table, {root, binding}) => table instanceof Element && root instanceof Element && table.isConnected && root.isConnected &&
      root.ownerDocument === document && table.ownerDocument === document && root.contains(table) &&
      document.querySelectorAll(binding.rootSelector).length === 1 && document.querySelector(binding.rootSelector) === root &&
      root.querySelectorAll(binding.panelSelector).length === 1 && root.querySelector(binding.panelSelector) === table, {root, binding});
    if (!await bound()) return undefined;
    const raw = await table.evaluate(table => {
      if (!(table instanceof Element)) return undefined;
      const inventory: CmpLoadedInventory = {version: "consentmanager_loaded_declarations.v1", records: [], truncated: false, unresolvedRecords: 0};
      const helpers = {text(node: Element | undefined | null) {return (node?.textContent ?? "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();},
        field(cells: Element[], columns: number[][], column: number) {return columns[column]!.length === 1 ? helpers.text(cells[columns[column]![0]!]) : "";}};
      const headerRows = table.querySelectorAll(":scope > thead > tr");
      const bodies = table.querySelectorAll(":scope > tbody");
      if (headerRows.length !== 1 || bodies.length !== 1 || table.querySelectorAll("table").length) return undefined;
      const headers = [...headerRows[0]!.children];
      if (!headers.length || headers.length > 16 || headers.some(node => node.tagName !== "TH" ||
          Number(node.getAttribute("colspan") ?? 1) !== 1 || Number(node.getAttribute("rowspan") ?? 1) !== 1)) return undefined;
      // Exact field classes are produced by the public display_cookielist SDK
      // template, independent of translated labels and configurable columns.
      const selectors = [".cmptxt_cookiename", ".cmptxt_vendor", ".cmptxt_expire", ".cmptxt_cookietype"];
      const columns = selectors.map(selector => headers.flatMap((node, index) => node.matches(selector) ? [index] : []));
      if (columns[0]!.length !== 1 || columns.some(indices => indices.length > 1) ||
          headers.some(node => selectors.filter(selector => node.matches(selector)).length > 1)) return undefined;
      const rows = [...bodies[0]!.children];
      if (rows.some(node => node.tagName !== "TR")) return undefined;
      let visited = 0, characters = 0;
      for (let index = 0; index < Math.min(rows.length, 512); index++) {
        const row = rows[index]!, cells = [...row.children];
        if (visited >= 256) {inventory.truncated = true; break;}
        // Description rows belong only to the immediately preceding data row.
        if (cells.length === 1 && cells[0]!.matches("td.cmpcookieinfotable_descr")) {inventory.unresolvedRecords++; continue;}
        visited++;
        if (cells.length !== headers.length || cells.some(node => node.tagName !== "TD" ||
            Number(node.getAttribute("colspan") ?? 1) !== 1 || Number(node.getAttribute("rowspan") ?? 1) !== 1)) {inventory.unresolvedRecords++; continue;}
        const name = helpers.field(cells, columns, 0);
        // The SDK can abbreviate names; an ellipsis is not a cookie identity.
        if (!/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(name) || name.endsWith("...")) {inventory.unresolvedRecords++; continue;}
        const providerText = helpers.field(cells, columns, 1), provider = providerText && providerText.length <= 240 ? providerText : null;
        const durationText = helpers.field(cells, columns, 2), duration = durationText.slice(0, 240);
        const type = helpers.field(cells, columns, 3).toLowerCase();
        const storageType = ["cookie", "http cookie"].includes(type) ? "cookie" : ["local storage", "html local storage"].includes(type) ? "local_storage"
          : type === "indexeddb" ? "indexed_db" : ["pixel", "pixel tracker"].includes(type) ? "pixel" : "unknown";
        let purpose = "";
        const next = rows[index + 1], descriptions = next ? [...next.children] : [];
        if (descriptions.length === 1 && descriptions[0]!.matches("td.cmpcookieinfotable_descr")) {
          index++;
          // Matching SDK row-type markers prevent attaching another row's text.
          if (row.hasAttribute("data-cmptype") && next!.getAttribute("data-cmptype") === row.getAttribute("data-cmptype")) purpose = helpers.text(descriptions[0]!).slice(0, 240);
          else inventory.unresolvedRecords++;
        }
        const size = name.length + purpose.length + duration.length + (provider?.length ?? 0);
        if (inventory.records.length >= 100 || characters + size > 16000) {inventory.truncated = true; continue;}
        if (durationText.length > 240 || providerText.length > 240) inventory.truncated = true;
        characters += size;
        inventory.records.push({name, purpose, duration, provider, storageType, sourceRef: `provider:0/record:${visited - 1}`});
        if (!purpose || !duration || storageType === "unknown") inventory.unresolvedRecords++;
      }
      if (rows.length > 512) inventory.truncated = true;
      return inventory;
    });
    if (!raw || !await bound()) return undefined;
    return cmpLoadedInventorySchema.parse(raw);
  } finally {await Promise.all([...roots, ...tables].map(handle => handle.dispose()));}
}
