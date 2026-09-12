type RetainedSection = { heading?: string; textExcerpt?: string; extractionMethod?: string };
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Select only a unique retained HTML section containing the exact supporting passage. */
export function retainedPolicySectionHeading(excerpt: string, sections: readonly RetainedSection[] = []) {
  const passage = normalize(excerpt);
  const matches = sections.filter(section => {
    if (section.extractionMethod !== "html_heading_hierarchy" || !section.heading || !section.textExcerpt) return false;
    const body = normalize(section.textExcerpt);
    const heading = normalize(section.heading);
    const withoutHeading = passage.startsWith(heading) ? passage.slice(heading.length).replace(/^[. :]+/, "") : passage;
    return withoutHeading.length >= 80 && (body.includes(withoutHeading) || withoutHeading.includes(body) && body.length >= 80);
  });
  return matches.length === 1 ? matches[0]?.heading : undefined;
}
