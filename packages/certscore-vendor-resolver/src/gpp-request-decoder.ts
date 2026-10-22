import { HeaderV1, UsCa, UsNat } from "@iabgpp/cmpapi";
import type { GpcRequestGpp } from "@certscore/contracts";

export type GppRequestContext = { gpcDelivered?: boolean; requestAtMs?: number; cmp?: {
  capturedAtMs: number; sectionId: 7 | 8; saleNotice: number; sharingNotice: number;
  saleOptOut: number; sharingOptOut: number; gpc: boolean | null;
} };
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Preflight the compressed header before invoking the reference decoder.
 * Its Fibonacci range decoder can expand arbitrary ranges. Bound group count,
 * section IDs and expansion here, without decoding unrelated TCF/vendor data. */
function boundedHeader(raw: string) {
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(raw)) throw Error("malformed_encoding");
  const bits = [...raw].map(char => alphabet.indexOf(char).toString(2).padStart(6, "0")).join("");
  let at = 0;
  const fixed = (size: number) => { if (at + size > bits.length) throw Error("malformed_encoding"); const value = Number.parseInt(bits.slice(at, at + size), 2); at += size; return value; };
  if (fixed(6) !== 3 || fixed(6) !== 1) throw Error("unsupported_header");
  const count = fixed(12); if (count > 32) throw Error("input_limit");
  const fib = () => {
    let a = 1, b = 2, value = 0;
    for (let n = 0; n < 10; n++) {
      const bit = fixed(1); if (bit) value += a;
      if (bit && bits[at] === "1") { fixed(1); if (value > 63) throw Error("input_limit"); return value; }
      [a,b] = [b,a+b];
    }
    throw Error("input_limit");
  };
  const ids: number[] = []; let offset = 0;
  for (let n = 0; n < count; n++) {
    const range = fixed(1), start = offset + fib(), end = range ? start + fib() : start;
    if (start < 1 || end > 63 || ids.length + end - start + 1 > 32) throw Error("input_limit");
    for (let id = start; id <= end; id++) ids.push(id);
    offset = end;
  }
  if (bits.length - at > 12 || /1/.test(bits.slice(at))) throw Error("noncanonical_encoding");
  const header = new HeaderV1(raw), object = header.toObj();
  if (object.Id !== 3 || object.Version !== 1 || JSON.stringify(object.SectionIds) !== JSON.stringify(ids)) throw Error("malformed_encoding");
  const canonicalHeader = new HeaderV1(); canonicalHeader.setFieldValue("SectionIds", [...ids]);
  if (canonicalHeader.encode() !== raw) throw Error("noncanonical_encoding");
  return ids;
}

/** Offline, bounded, read-only decoding. No CMP API is constructed or called.
 * Error objects and original encoded strings never enter retained diagnostics. */
export function decodeGppRequest(q: URLSearchParams, context: GppRequestContext = {}): GpcRequestGpp {
  const result: GpcRequestGpp = { policyVersion: "gpp_request_decode.v1", decoderVersion: "@iabgpp/cmpapi@3.2.0",
    status: "not_present", sectionIds: [], applicableSections: [], sections: [], requestSignals: "not_assessed", cmpComparison: "not_compared", reasons: [] };
  const reason = (value: GpcRequestGpp["reasons"][number]) => { if (!result.reasons.includes(value)) result.reasons.push(value); };
  if (!q.has("gpp") && !q.has("gpp_sid")) return result;
  result.status = "invalid";
  const values = q.getAll("gpp"), applicable = q.getAll("gpp_sid");
  if (values.length > 1 || applicable.length > 1) { reason("duplicate_privacy_parameters"); return result; }
  // These are independent declarations. An empty payload must not hide an
  // empty/invalid applicability declaration or discard valid retained IDs.
  if (values.length !== 1 || !values[0]) reason("missing_gpp");
  else if (values[0].length > 4096) { result.status = "limited"; reason("input_limit"); }
  else if (!/^[A-Za-z0-9_.~-]+$/.test(values[0])) reason("malformed_encoding");
  if (applicable.length !== 1 || !applicable[0]) reason("missing_applicable_sections");
  else if (applicable[0].length > 128) { result.status = "limited"; reason("input_limit"); }
  else {
    const sid = applicable[0].split(",");
    if (sid.length > 8) { result.status = "limited"; reason("input_limit"); }
    else if (sid.some(id => !/^(?:-1|[1-9][0-9]?)$/.test(id) || Number(id) > 63) || new Set(sid).size !== sid.length) reason("invalid_applicable_sections");
    else result.applicableSections = sid.map(Number);
  }
  if (result.reasons.length) return result;
  const encoded = values[0]!;
  try {
    const segments = encoded.split("~");
    result.sectionIds = boundedHeader(segments[0]!);
    if (segments.length !== result.sectionIds.length + 1 || segments.slice(1).some(segment => !segment)) throw Error("section_inventory_mismatch");
    if (result.applicableSections.some(id => id !== -1 && !result.sectionIds.includes(id))) throw Error("applicable_section_missing");
    if (result.applicableSections.some(id => id !== 7 && id !== 8)) { result.status = "unsupported"; reason("unsupported_applicable_section"); return result; }
    for (const id of result.applicableSections as Array<7 | 8>) {
      const raw = segments[result.sectionIds.indexOf(id) + 1]!;
      if (!/^[A-Za-z0-9_-]{1,64}(?:\.[A-Za-z0-9_-]{2})?$/.test(raw)) throw Error("malformed_encoding");
      const section = id === 8 ? new UsCa(raw) : new UsNat(raw), fields = section.toObj();
      if (id === 8 ? fields.Version !== 1 : ![1,2].includes(fields.Version)) throw Error("unsupported_section_version");
      if (Object.entries(fields).some(([key,value]) => key !== "Version" && key !== "Gpc" && key !== "GpcSegmentType" &&
        (Array.isArray(value) ? value.some(v => ![0,1,2].includes(v)) : ![0,1,2].includes(value as number))) ||
        ![1,2].includes(fields.MspaCoveredTransaction)) throw Error("invalid_fields");
      const included = section.getFieldValue("GpcSegmentIncluded");
      if (included && (fields.GpcSegmentType !== 1 || typeof fields.Gpc !== "boolean")) throw Error("invalid_fields");
      const canonicalSection = id === 8 ? new UsCa() : new UsNat();
      for (const [key,value] of Object.entries(fields)) canonicalSection.setFieldValue(key,value);
      canonicalSection.setFieldValue("GpcSegmentIncluded",included);
      if (canonicalSection.encode() !== raw) throw Error("noncanonical_encoding");
      result.sections.push({ sectionId: id, version: fields.Version, saleNotice: fields.SaleOptOutNotice, sharingNotice: fields.SharingOptOutNotice,
        saleOptOut: fields.SaleOptOut, sharingOptOut: fields.SharingOptOut, serviceProviderMode: fields.MspaServiceProviderMode,
        targetedAdvertisingOptOut: id === 7 ? fields.TargetedAdvertisingOptOut : null, gpc: included ? fields.Gpc : null });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const known = ["malformed_encoding", "unsupported_header", "input_limit", "noncanonical_encoding", "section_inventory_mismatch",
      "applicable_section_missing", "unsupported_section_version", "invalid_fields"] as const;
    reason(known.includes(code as typeof known[number]) ? code as typeof known[number] : "malformed_encoding");
    result.status = code === "input_limit" ? "limited" : code.startsWith("unsupported_") ? "unsupported" : "invalid";
    result.sections = []; return result;
  }
  result.status = "decoded"; result.requestSignals = "consistent"; result.cmpComparison = "unavailable";
  const conflict = (code: GpcRequestGpp["reasons"][number]) => { reason(code); result.requestSignals = "conflicting"; };
  const usp = q.getAll("us_privacy");
  if (usp.length === 1 && /^1[YN-]{3}$/.test(usp[0]!)) {
    const sale = usp[0]![2] === "Y" ? 1 : usp[0]![2] === "N" ? 2 : 0;
    if (sale && result.sections.some(section => section.saleOptOut !== 0 && section.saleOptOut !== sale)) conflict("us_privacy_conflict");
  }
  if (result.sections.length === 2) {
    const [a,b] = result.sections;
    if (a && b && (["saleOptOut", "sharingOptOut", "serviceProviderMode", "gpc"] as const).some(key => {
      const av = a[key], bv = b[key];
      return av !== null && bv !== null && (typeof av === "boolean" || av !== 0 && bv !== 0) && av !== bv;
    })) conflict("section_state_conflict");
  }
  // A payload failing to propagate GPC cannot neutralize independently verified
  // identified collection. This diagnostic alone never creates a deduction.
  if (context.gpcDelivered === true && result.sections.some(section => section.gpc === false)) reason("gpc_delivery_disagrees");
  return applyGppRequestCmpContext(result,context);
}

/** Reuse exact-time comparison for already-decoded, hash-bound request proof. */
export function applyGppRequestCmpContext(input:GpcRequestGpp,context:GppRequestContext):GpcRequestGpp {
  const result=structuredClone(input);
  if(result.status!=="decoded")return result;
  const reason=(code:GpcRequestGpp["reasons"][number])=>{if(!result.reasons.includes(code))result.reasons.push(code);};
  const cmp = context.cmp, selected = result.sections.find(section => section.sectionId === cmp?.sectionId);
  if (cmp && selected && context.requestAtMs !== undefined) {
    if (cmp.capturedAtMs < context.requestAtMs) result.cmpComparison = "earlier_readback";
    else if (cmp.capturedAtMs > context.requestAtMs) result.cmpComparison = "later_readback";
    else {
      result.cmpComparison = "same_time_consistent";
      if (selected.saleOptOut !== cmp.saleOptOut || selected.saleNotice !== cmp.saleNotice) reason("cmp_sale_disagrees");
      if (selected.sharingOptOut !== cmp.sharingOptOut || selected.sharingNotice !== cmp.sharingNotice) reason("cmp_sharing_disagrees");
      if (selected.gpc !== null && cmp.gpc !== null && selected.gpc !== cmp.gpc) reason("cmp_gpc_disagrees");
      if (result.reasons.some(code => code.startsWith("cmp_"))) result.cmpComparison = "same_time_conflicting";
    }
  }
  return result;
}
