import { ACCESSIBILITY_EVIDENCE_FINDING_IDS, getAccessibilityFindingIdForRuleCode } from "./accessibility-evidence";
import { ACCESSIBILITY_PRIORITY_GROUP_ID } from "./accessibility-priority-group";

export type FindingReference = {
  label: string;
  kind: "Directive" | "Regulation" | "Statute" | "Technical standard";
  explanation: string;
  url: string;
  publisher: string;
};

const GDPR = "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng";
const CCPA = "https://cppa.ca.gov/pdf/20260101_ccpa_statute.pdf";
const CALIFORNIA_REGULATIONS = "https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf";

const gdprExplanations: Readonly<Record<string, string>> = {
  "4(11)": "Defines consent as a freely given, specific, informed and unambiguous indication of the person’s wishes through a statement or clear affirmative action.",
  "5": "Sets principles for processing personal data, including lawfulness, fairness, transparency, purpose limitation and data minimization.",
  "5(1)(e)": "Limits how long personal data may be kept in an identifiable form, with exceptions and safeguards for specified uses.",
  "5(2)": "Makes the controller responsible for complying with the data-processing principles and able to demonstrate that compliance.",
  "5–6": "Set out personal-data processing principles and the lawful bases that can justify processing.",
  "6": "Sets out the lawful bases for processing personal data, including when consent is used as the basis.",
  "6–7": "Article 6 sets out lawful bases for processing personal data. Article 7 sets conditions for consent when consent is the basis.",
  "7(3)": "When processing relies on consent, people must be able to withdraw it as easily as they gave it.",
  "7": "This article sets conditions for demonstrating, requesting and withdrawing consent.",
  "9": "Generally prohibits processing specified categories of sensitive personal data unless a listed exception applies.",
  "12": "Sets requirements for clear, accessible privacy information and for communicating with people about their rights.",
  "12–14": "These articles set transparency requirements and specify what information people must receive about the use of their personal data.",
  "12–22": "Cover transparency, information about processing, and rights such as access, correction and erasure, subject to applicable conditions.",
  "13": "Lists information a controller must provide when it obtains personal data from the individual.",
  "13(1)(a)": "Requires the controller’s identity and contact details when personal data are collected from the individual.",
  "13(1)(b)": "Requires the contact details of the data protection officer where applicable when personal data are collected from the individual.",
  "13(1)(e)": "Requires information on recipients or categories of recipients, if any, when personal data are collected from the individual.",
  "13(1)(f)": "Covers disclosures about intended international transfers and the relevant decisions or safeguards where applicable.",
  "13(2)(a)": "Requires disclosure of the retention period or the criteria used to determine it when personal data are collected from the individual.",
  "13(2)(d)": "Requires information about the right to lodge a complaint with a supervisory authority when data are collected from the individual.",
  "13–14": "Specify what people must be told about processing, depending on whether the data came from them or another source.",
  "14(1)(a)": "Requires the controller’s identity and contact details where the controller obtains personal data from another source, subject to the article’s exceptions.",
  "14(1)(e)": "Covers disclosures about recipients or recipient categories where personal data came from another source, subject to the article’s exceptions.",
  "14(2)(e)": "Covers disclosure of the right to lodge a complaint where personal data came from another source, subject to the article’s exceptions.",
  "22": "Addresses decisions based solely on automated processing that have legal or similarly significant effects, with exceptions and safeguards.",
  "25": "Requires appropriate measures for data protection by design and by default, taking the processing and its risks into account.",
  "32": "Controllers and processors must use security measures appropriate to the risks of their personal-data processing. Encryption is one measure to consider where appropriate.",
  "37–39": "Cover when a data protection officer must be designated, the officer’s position and their duties.",
  "44–49": "Set the conditions and safeguards for transfers of personal data to third countries or international organizations, including limited exceptions.",
};

const californiaStatutes: Readonly<Record<string, readonly [number, string]>> = {
  "1798.100": [3, "Sets duties for businesses that collect personal information, including disclosures at or before collection."],
  "1798.120": [8, "Gives consumers the right to direct a covered business to stop selling or sharing their personal information."],
  "1798.130": [11, "Sets disclosure and request-handling requirements for specified California privacy rights."],
  "1798.135": [15, "Sets requirements for offering sale and sharing opt-outs and describes when a qualifying preference signal may be used in place of specified links."],
};

const californiaRegulations: Readonly<Record<string, readonly [number, string]>> = {
  "7011": [21, "Specifies what a covered business’s privacy policy must explain and how the policy must be made available."],
  "7012": [24, "Specifies the contents, timing and presentation of a notice at collection."],
  "7013": [27, "Specifies the notice and link for exercising the right to opt out of sale or sharing."],
  "7015": [32, "Sets requirements for using a single alternative link for applicable opt-out and sensitive-information limitation rights."],
  "7020": [34, "Specifies methods for submitting requests to delete, correct or know personal information."],
  "7025": [44, "Specifies how a covered business must process a qualifying opt-out preference signal, such as Global Privacy Control, for sale or sharing."],
  "7026": [50, "Sets requirements for submitting, processing and applying requests to opt out of sale or sharing."],
  "7063": [67, "Sets rules for how authorized agents may submit specified privacy requests on a consumer’s behalf."],
};

/** Interpret the exact provisions already assigned by the review or applicability catalog. */
export function regulatoryFindingReferences(rule: string): FindingReference[] {
  return rule.split("; ").flatMap<FindingReference>(part => {
    if (part === "ePrivacy Art. 5(3)") return [{
      label: part, kind: "Directive", publisher: "EUR-Lex",
      explanation: "Applies to storing or accessing information on a user’s device. Consent is generally required, with exceptions for communications transmission and functions strictly necessary for a service the user requested.",
      url: "https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng",
    }];
    const gdpr = /^GDPR Arts?\. (.+)$/.exec(part);
    if (gdpr) return gdpr[1]!.split(", ").flatMap(articles => {
      const explanation = gdprExplanations[articles];
      if (!explanation) return [];
      return [{ label: `GDPR ${articles.includes("–") ? "Arts." : "Art."} ${articles}`,
        kind: "Regulation", publisher: "EUR-Lex", explanation,
        url: `${GDPR}#art_${/^\d+/.exec(articles)![0]}` }];
    });
    const statute = /^CCPA §(1798\.\d+)$/.exec(part);
    const provision = statute && californiaStatutes[statute[1]!];
    if (provision) return [{ label: part, kind: "Statute", publisher: "California Privacy Protection Agency", url: `${CCPA}#page=${provision[0]}`, explanation: provision[1] }];

    const sections = /^(?:CCPA )?regulations §§?([\d, –]+)$/.exec(part)?.[1];
    if (!sections) return [];
    // Expand a range only across reviewed sections, in numerical order.
    return sections.split(", ").flatMap(section => {
      const [first, last = first] = section.split("–");
      return Object.entries(californiaRegulations).flatMap(([number, [page, explanation]]) =>
        Number(number) >= Number(first) && Number(number) <= Number(last) ? [{
          label: `11 CCR §${number}`, kind: "Regulation", publisher: "California Privacy Protection Agency",
          url: `${CALIFORNIA_REGULATIONS}#page=${page}`, explanation,
        }] : []);
    });
  });
}

// Exact retained axe rule IDs. Several criteria span WCAG versions, so only
// show a version in the label when the cited criterion establishes it.
const axeCriteria: Readonly<Record<string, readonly [string, string, string]>> = {
  "color-contrast": ["1.4.3", "contrast-minimum", "Specifies minimum contrast for text and images of text, with different thresholds for large text and exceptions for incidental text and logos."],
  "link-in-text-block": ["1.4.1", "use-of-color", "Requires a visual cue beyond color alone when color conveys meaning or distinguishes a visual element."],
  "image-alt": ["1.1.1", "non-text-content", "Requires equivalent text alternatives for non-text content, subject to the criterion’s exceptions."],
  "input-image-alt": ["1.1.1", "non-text-content", "Requires equivalent text alternatives for non-text content, subject to the criterion’s exceptions."],
  "button-name": ["4.1.2", "name-role-value", "Requires assistive technologies to be able to determine interface controls’ names and roles, as well as applicable states and values."],
  "link-name": ["4.1.2", "name-role-value", "Requires assistive technologies to be able to determine interface controls’ names and roles, as well as applicable states and values."],
  "meta-viewport": ["1.4.4", "resize-text", "Requires text to be resizable up to 200% without assistive technology or loss of content or functionality, subject to stated exceptions."],
  "target-size": ["2.5.8", "target-size-minimum", "Specifies a minimum pointer-target size, with exceptions including sufficient spacing around undersized targets."],
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function accessibilityFindingReferences(id: string, evidenceJson: Record<string, unknown>): FindingReference[] {
  const members = id === ACCESSIBILITY_PRIORITY_GROUP_ID && Array.isArray(evidenceJson.findings)
    ? evidenceJson.findings : [{ id, evidenceJson }];
  const references = new Map<string, FindingReference>();
  for (const value of members) {
    const member = record(value);
    if (typeof member?.id !== "string" || !ACCESSIBILITY_EVIDENCE_FINDING_IDS.has(member.id)) continue;
    const details = record(record(member.evidenceJson)?.evidenceDetails);
    const evidence = record(details?.accessibilityEvidence);
    if (!Array.isArray(evidence?.axeEvidence)) continue;
    for (const sample of evidence.axeEvidence) {
      const ruleId = record(sample)?.ruleId;
      if (typeof ruleId !== "string" || getAccessibilityFindingIdForRuleCode(ruleId) !== member.id) continue;
      const criterion = Object.hasOwn(axeCriteria, ruleId) ? axeCriteria[ruleId] : undefined;
      if (!criterion) continue;
      const [number, anchor, explanation] = criterion;
      references.set(number, {
        label: number === "2.5.8" ? `WCAG 2.2 · SC ${number}` : `WCAG SC ${number}`,
        kind: "Technical standard", publisher: "W3C", explanation, url: `https://www.w3.org/TR/WCAG22/#${anchor}`,
      });
    }
  }
  return [...references.values()];
}
