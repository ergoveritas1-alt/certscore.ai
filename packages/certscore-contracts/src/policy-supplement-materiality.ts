export const POLICY_SUPPLEMENT_MATERIALITY_VERSION = "policy_supplement_materiality.v1";
type Surface = {surfaceType:string;linkText?:string|null;url:string;normalizedUrl?:string;traversalDepth?:number;parentObservationId?:string;selectionReasonCodes?:string[]};

/** Narrow exclusions from a governing English/California notice review. Unknown
 * linked notices stay material. A language label alone never excludes a CA notice. */
export function privacySupplementExclusion(surface:Surface, parentUrl?:string): "language_alternate" | "unrelated_document" | undefined {
  if(surface.traversalDepth!==1 || !surface.parentObservationId || surface.surfaceType!=="privacy_policy")return undefined;
  const label=(surface.linkText??"").normalize("NFKC").trim();
  if(/\b(?:california|ccpa|cpra|collection|supplement|addendum|consumer rights)\b/i.test(label))return undefined;
  let url:URL;
  try {url=new URL(surface.normalizedUrl??surface.url,parentUrl);if(parentUrl&&url.hostname!==new URL(parentUrl).hostname)return undefined;}catch{return undefined;}
  if(/^Modern Slavery Statement$/i.test(label) && /\/modern-slavery-statement\/?$/i.test(url.pathname) ||
    /^(?:UK )?Editorial Complaints Policy$/i.test(label) && /\/complaints\/(?:policy|procedure)\/?$/i.test(url.pathname))return "unrelated_document";
  const locale= /^(?:日本語)$/.test(label)?"jp|ja":/^Deutsch$/i.test(label)?"de":/^Español(?:\s+Cambiar el idioma del sitio a español)?$/i.test(label)?"es":
    /^Português$/i.test(label)?"br|pt":/^Français$/i.test(label)?"fr":/^Italiano$/i.test(label)?"it":undefined;
  if(locale && new RegExp(`^/(?:${locale})(?:/|$)`,"i").test(url.pathname))return "language_alternate";
  return undefined;
}
