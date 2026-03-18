export type DerivedFindingRecord = {
  category: "accessibility" | "privacy" | "legal";
  description: string;
  evidence_json: Record<string, unknown>;
  remediation_business: string;
  remediation_technical: string;
  rule_key: string;
  scan_id: string;
  scan_page_id: string | null;
  severity: "high" | "medium" | "low" | "info";
  status: "open";
  subtype: string;
  title: string;
  weight: number;
};
