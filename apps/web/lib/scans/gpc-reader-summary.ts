/** Reader wording for an already-projected GPC finding. Internal assessment and proof remain unchanged. */
export function gpcReaderSummary(summary: string): string {
  return summary
    .replace(/Bounded GPC observation completed\.\s*/g, "")
    .replace("GPC was observed on the main-document request and browser property.", "GPC delivery was verified on the page request and browser setting.")
    .replace(/The CMP's sale\/sharing opt-out state was unavailable\.\s*/g, "")
    .replace(/The consent platform’s sale\/sharing opt-out setting could not be read\.\s*/g, "")
    .replace(/Paired activity comparison: indeterminate\.\s*/g, "")
    .replace(/The comparison with GPC disabled was inconclusive\.\s*/g, "")
    .replace(/\b1 collection requests\b/g, "1 collection request")
    .trim();
}
