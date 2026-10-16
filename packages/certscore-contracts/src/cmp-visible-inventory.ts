import { z } from "zod";
import { cookieDisclosureColumn } from "./cookie-disclosure-column";

/** Literal labelled fields from the verified preference surface. A bounded
 * visible sample never establishes a complete configured cookie inventory. */
export const cmpVisibleInventorySchema = z.object({
  version: z.literal("cmp_visible_inventory.v1"),
  records: z.array(z.object({
    ref: z.string().regex(/^(?:table|aria_table|definition_list):[0-9]{1,3}\/row:[0-9]{1,3}$/),
    fields: z.array(z.object({
      column: z.enum(["cookieName", "provider", "purpose", "duration"]),
      label: z.string().min(1).max(120), value: z.string().max(240),
    }).strict().refine(field => cookieDisclosureColumn(field.label) === field.column,
      "Inventory columns require their exact retained label")).min(1).max(4),
  }).strict().refine(record => new Set(record.fields.map(field => field.column)).size === record.fields.length,
    "Ambiguous duplicate fields cannot identify one inventory record")).max(100),
  truncated: z.boolean(), unresolvedRecords: z.number().int().min(0).max(1000),
}).strict().superRefine((inventory, ctx) => {
  if (new Set(inventory.records.map(record => record.ref)).size !== inventory.records.length ||
      inventory.records.reduce((n, record) => n + record.fields.reduce((sum, field) => sum + field.label.length + field.value.length, 0), 0) > 16000)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "Inventory references and retained text must remain bounded and unique"});
});
export type CmpVisibleInventory = z.infer<typeof cmpVisibleInventorySchema>;

/** A literal named provider, not a domain, category or unavailable marker. */
export function isExplicitCmpProviderName(provider: string) {
  return /^[\p{L}\p{N}][\p{L}\p{N} .'’&()+-]{0,159}$/u.test(provider) &&
    !/^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+\.?$/u.test(provider) &&
    !/^(?:first party|third party|unknown|various|none|not available|n\/a|analytics|marketing|necessary|functional)$/i.test(provider);
}

export function projectVisibleCmpInventory(inventory: CmpVisibleInventory) {
  const declarations: Array<{name: string; purpose: string; duration: string; source: "cmp_visible_inventory"}> = [];
  const services: Array<{name: string; source: "cmp_visible_inventory"; sourceRef: string}> = [];
  for (const record of inventory.records) {
    const value = (column: string) => record.fields.find(field => field.column === column)?.value.trim() ?? "";
    const name = value("cookieName");
    if (/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(name)) {
      const row = {name, purpose: value("purpose"), duration: value("duration"), source: "cmp_visible_inventory" as const};
      if (!declarations.some(item => item.name === row.name && item.purpose === row.purpose && item.duration === row.duration)) declarations.push(row);
    }
    // The explicit Provider field supplies the name. Domains, category labels,
    // cookie names and broad industry/vendor lists are not service identities.
    const provider = value("provider");
    if (isExplicitCmpProviderName(provider) &&
        !services.some(item => item.name === provider))
      services.push({name: provider, source: "cmp_visible_inventory", sourceRef: record.ref});
  }
  return {declarations, services};
}
