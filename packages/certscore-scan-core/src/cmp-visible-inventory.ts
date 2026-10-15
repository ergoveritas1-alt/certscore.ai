import type { Locator } from "playwright";
import { cmpVisibleInventorySchema, cookieDisclosureColumn } from "@certscore/contracts";

/** Read only inside the already verified panel. No fetch, SDK calls, scroll,
 * deeper navigation or cookie-purpose inference. Shadow DOM is traversed by
 * the locator; each record keeps its own explicit labels and values. */
export async function readVisibleCmpInventory(panel: Locator) {
  const raw = await panel.locator('table, [role="table"], dl').evaluateAll(readVisibleInventoryInDocument);
  const records = [];
  let unresolvedRecords = raw.unresolvedRecords;
  for (const record of raw.records) {
    const fields = record.fields.flatMap(field => {
      const column = cookieDisclosureColumn(field.label);
      return column ? [{label: field.label, value: column === "cookieName" && field.code !== undefined ? field.code : field.value, column}] : [];
    });
    if (!fields.some(field => field.column === "cookieName" || field.column === "provider")) continue;
    if (fields.some(field => field.column === "cookieName" && !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(field.value.trim()) ||
        field.column === "provider" && /[@=?#]/.test(field.value))) { unresolvedRecords++; continue; }
    if (fields.length > 4 || new Set(fields.map(field => field.column)).size !== fields.length) { unresolvedRecords++; continue; }
    records.push({ref: record.ref, fields});
  }
  return cmpVisibleInventorySchema.parse({version: "cmp_visible_inventory.v1", records, truncated: raw.truncated,
    unresolvedRecords: Math.min(1000, unresolvedRecords)});
}

/** Self-contained serialized DOM read; all traversal and output share caps. */
export function readVisibleInventoryInDocument(surfaces: Element[]) {
  const records: Array<{ref: string; fields: Array<{label: string; value: string; code?: string}>}> = [];
  let truncated = surfaces.length > 16, unresolvedRecords = 0, retainedText = 0, visited = 0;
  const helpers = {
  visible(element: Element) {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    let ancestor: Element | null = element;
    for (let depth = 0; ancestor && depth < 64; depth++) {
      const style = getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility !== "visible" || style.opacity === "0" ||
          ancestor.matches('[hidden], [aria-hidden="true" i], [inert]')) return false;
      const tree = ancestor.getRootNode();
      ancestor = ancestor.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
    }
    return !ancestor;
  },
  text(element: Element) { return (element as HTMLElement).innerText?.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim() ?? ""; },
  retain(ref: string, pairs: Array<{label: Element; value: Element}>) {
    if (++visited > 100) { truncated = true; return; }
    if (!pairs.length || pairs.length > 16 || pairs.some(pair => !helpers.visible(pair.label) || !helpers.visible(pair.value))) { unresolvedRecords++; return; }
    const fields = pairs.map(pair => {
      const codes = pair.value.querySelectorAll("code");
      const code = codes.length === 1 && helpers.visible(codes[0]!) ? helpers.text(codes[0]!).slice(0, 241) : undefined;
      const value = helpers.text(pair.value);
      if (value.length > 240) truncated = true;
      // Preserve a bounded purpose excerpt rather than losing its cookie name.
      // Names/providers longer than their identity cap still fail downstream.
      return {label: helpers.text(pair.label), value: value.slice(0, 240), ...(code !== undefined ? {code} : {})};
    });
    if (fields.some(field => !field.label || field.label.length > 120)) { unresolvedRecords++; return; }
    const size = fields.reduce((sum, field) => sum + field.label.length + field.value.length + (field.code?.length ?? 0), 0);
    if (retainedText + size > 16000) { truncated = true; return; }
    retainedText += size; records.push({ref, fields});
  }};
  for (const [index, surface] of surfaces.slice(0, 16).entries()) {
    if (visited >= 100) { truncated = true; break; }
    if (surface.tagName === "DL") {
      const children = [...surface.children];
      // HTML definition lists may group each labelled cookie card in a div.
      // Flat lists are one record; repeated identities fail ambiguous downstream.
      const groups = children.every(child => child.tagName === "DIV") ? children : [surface];
      if (groups.length > 100) truncated = true;
      for (const [row, group] of groups.slice(0, 100).entries()) {
        if (visited >= 100) { truncated = true; break; }
        const nodes = [...group.children];
        if (!nodes.length || nodes.length % 2 || nodes.some((node, i) => node.tagName !== (i % 2 ? "DD" : "DT"))) { unresolvedRecords++; continue; }
        helpers.retain(`definition_list:${index}/row:${row}`, nodes.filter((_, i) => i % 2 === 0).map((label, i) => ({label, value: nodes[i * 2 + 1]!})));
      }
      continue;
    }
    const aria = surface.tagName !== "TABLE", kind = aria ? "aria_table" : "table";
    const rows = [...surface.querySelectorAll(aria ? '[role="row"]' : "tr")]
      .filter(row => row.closest(aria ? '[role="table"]' : "table") === surface);
    if (rows.length > 101) truncated = true;
    const header = rows[0];
    if (!header) continue;
    const labels = [...header.querySelectorAll(aria ? '[role="columnheader"]' : "th")];
    if (!labels.length || labels.length > 16 || labels.some(label => label.closest(aria ? '[role="row"]' : "tr") !== header ||
        Number(label.getAttribute("colspan") ?? 1) !== 1 || Number(label.getAttribute("rowspan") ?? 1) !== 1)) continue;
    for (const [row, element] of rows.slice(1, 101).entries()) {
      if (visited >= 100) { truncated = true; break; }
      const cells = [...element.querySelectorAll(aria ? '[role="cell"], [role="rowheader"]' : "td, th")]
        .filter(cell => cell.closest(aria ? '[role="row"]' : "tr") === element);
      if (cells.length !== labels.length || cells.some(cell => Number(cell.getAttribute("colspan") ?? 1) !== 1 || Number(cell.getAttribute("rowspan") ?? 1) !== 1)) { unresolvedRecords++; continue; }
      helpers.retain(`${kind}:${index}/row:${row}`, labels.map((label, i) => ({label, value: cells[i]!})));
    }
  }
  return {records, truncated, unresolvedRecords};
}
