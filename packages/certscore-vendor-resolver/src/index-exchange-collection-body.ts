import { readBoundedProtocolJson, type ProtocolJson } from "./bounded-protocol-json";

/** Reviewed Prebid ixBidAdapter envelope, pinned in the coverage policy. Only
 * banner requests and explicitly reviewed metadata are supported. Shape and
 * EIDs do not establish a California sale/sharing purpose. */
export function isIndexExchangeCollection(url: URL): boolean {
  return url.origin === "https://htlb.casalemedia.com" && url.pathname === "/openrtb/pbjs";
}

function fail(code = "unsupported_fields"): never { throw Error(code); }
const object = (value: ProtocolJson): value is Record<string, ProtocolJson> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
type Check = (value: ProtocolJson) => void;
const scalar: Check = value => { if (value !== null && !["string", "number", "boolean"].includes(typeof value)) fail(); };
const list = (check: Check, cap = 16): Check => value => {
  if (!Array.isArray(value) || value.length > cap) fail("body_limit");
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
const dimensions = shape("w h");
const impExt = shape("siteID sid externalID tid gpid dfp_ad_unit_code tagid adunitcode divId fl");
const impression = shape("id adunitCode bidfloor bidfloorcur secure", {
  banner: shape("w h topframe pos", { format: list(dimensions), ext: impExt }), ext: impExt,
});
const eid = shape("source", { uids: list(shape("id atype"), 8) });
const regs = shape("coppa gpp", {
  gpp_sid: list(value => { if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 63) fail(); }),
  ext: shape("gdpr us_privacy"),
});
const site = shape("id name domain page ref search mobile privacypolicy keywords", {
  cat: strings, sectioncat: strings, pagecat: strings, publisher: shape("id name domain", { cat: strings }),
});
const user = shape("id buyeruid yob gender keywords customdata", {
  eids: list(eid, 8), ext: shape("consent", { consented_providers_settings: shape("addtl_consent") }),
});
const source = shape("tid", { ext: shape("", { schain: shape("ver complete", {
  nodes: list(shape("asi sid hp rid name domain")),
}) }) });
const rootShape = shape("id at tmax test cur", {
  site, user, regs, source, imp: list(impression), device: shape("w h"),
  ext: shape("source", { ixdiag: shape("ls tmax syncsPerBidder imps fpd tagid adunitcode divId usid") }),
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

export function decodeIndexExchangeCollectionBody(url: URL, body: string): { fields: URLSearchParams; format: "json" } | null {
  if (!isIndexExchangeCollection(url)) return null;
  const root = readBoundedProtocolJson(body.trim(), [...url.searchParams].length);
  rootShape(root);
  if (!object(root) || typeof root.id !== "string" || !root.id || !Array.isArray(root.imp) || !root.imp.length ||
      !object(root.ext ?? null) || (root.ext as Record<string, ProtocolJson>).source !== "prebid") fail();
  for (const imp of root.imp as ProtocolJson[]) if (!object(imp) || typeof imp.id !== "string" || !imp.id || !object(imp.banner ?? null)) fail();
  const fields = processing(root as Record<string, ProtocolJson>);
  const u = (root as Record<string, ProtocolJson>).user;
  if (object(u ?? null) && Array.isArray((u as Record<string, ProtocolJson>).eids)) {
    const seen = new Set<string>();
    for (const entry of (u as Record<string, ProtocolJson>).eids as ProtocolJson[]) {
      if (!object(entry) || typeof entry.source !== "string" || seen.has(entry.source)) fail("duplicate_fields");
      seen.add(entry.source);
      if (!Array.isArray(entry.uids) || entry.uids.length !== 1 || !object(entry.uids[0] ?? null)) fail();
      const id = (entry.uids[0] as Record<string, ProtocolJson>).id;
      if (typeof id !== "string" || !id) fail();
      // Existing reviewed EID identity vocabulary; no new attribution or role.
      if (["pubcid.org", "sharedid.org", "id5-sync.com", "liveramp.com"].includes(entry.source)) fields.append(`eid_${entry.source}`, id as string);
    }
  }
  return { fields, format: "json" };
}
