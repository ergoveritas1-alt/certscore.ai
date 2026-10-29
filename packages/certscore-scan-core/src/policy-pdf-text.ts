import { type PolicyPdfSourceCoverage } from "@certscore/contracts";

/** Metadata from the already-required bounded getText call. No extra parsing. */
export function boundedPdfText(result: {text: string; total?: unknown; pages?: unknown}) {
  const text = result.text.replace(/\s+/g," ").trim();
  const totalPages = Number.isInteger(result.total) && (result.total as number)>0 && (result.total as number)<=1_000_000 ? result.total as number : null;
  const numbers = Array.isArray(result.pages) ? result.pages.map(p => p && typeof p === "object" ? (p as {num?:unknown}).num : undefined) : null;
  const extractedPages = numbers && numbers.length<=12 && numbers.every((num,i)=>num===i+1) && (totalPages===null || numbers.length<=totalPages) ? numbers.length : null;
  const characterLimitReached = text.length>500_000;
  const status = characterLimitReached || totalPages!==null && extractedPages!==null && extractedPages<totalPages
    ? "partial" : totalPages!==null && extractedPages===totalPages ? "complete" : "unknown";
  const coverage: PolicyPdfSourceCoverage = {contractVersion:"policy_pdf_source_coverage.v1",status,totalPages,extractedPages,pageLimit:12,characterLimit:500_000,characterLimitReached};
  return {text:text.slice(0,500_000),coverage};
}

export function pdfSourceLimitations(coverage: PolicyPdfSourceCoverage | undefined): string[] {
  if (!coverage) return [];
  return [
    ...(coverage.totalPages!==null && coverage.extractedPages!==null && coverage.extractedPages<coverage.totalPages
      ? [coverage.extractedPages === coverage.pageLimit ? "policy_pdf_page_limit" : "policy_pdf_pages_unextracted"] : []),
    ...(coverage.characterLimitReached ? ["policy_pdf_character_limit"] : []),
    ...(coverage.status==="unknown" ? ["policy_pdf_source_coverage_unknown"] : []),
  ];
}
