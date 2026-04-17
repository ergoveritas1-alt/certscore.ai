"use server";

import { listIndustryRows } from "./repository";

export type IndustryOption = {
  id: string;
  slug: string;
  label: string;
};

export async function listIndustries(): Promise<IndustryOption[]> {
  const industries = await listIndustryRows();
  return industries.map((industry) => ({
    id: industry.id,
    slug: industry.slug,
    label: industry.label
  }));
}
