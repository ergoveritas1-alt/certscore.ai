"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";

export type IndustryOption = {
  id: string;
  slug: string;
  label: string;
};

type IndustryRow = {
  id: string;
  slug: string;
  label: string;
};

function isMissingIndustriesTable(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("relation \"public.industries\" does not exist"));
}

export async function listIndustries(): Promise<IndustryOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("industries").select("id, slug, label").order("sort_order", { ascending: true }).order("label", { ascending: true });

  if (error) {
    if (isMissingIndustriesTable(error)) {
      return [];
    }

    throw new Error(`Failed to load industries: ${error.message}`);
  }

  return ((data ?? []) as IndustryRow[]).map((industry) => ({
    id: industry.id,
    slug: industry.slug,
    label: industry.label
  }));
}
