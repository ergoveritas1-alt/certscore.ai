"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { z } from "zod";
import { getDashboardContext } from "../auth";

const searchTermsSchema = z.array(z.string().trim().min(1).max(200)).max(500);

type OrganizationSettingsRow = {
  fintech_sourcing_search_terms: unknown;
};

function normalizeStoredSearchTerms(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed = searchTermsSchema.safeParse(
    value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
  );

  return parsed.success ? parsed.data : [];
}

export async function getFintechSourcingSearchTerms() {
  const { organization } = await getDashboardContext();
  const db = createAdminClient();
  const { data, error } = await db
    .from("organization_settings")
    .select("fintech_sourcing_search_terms")
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load fintech sourcing search terms: ${error.message}`);
  }

  const row = data as OrganizationSettingsRow | null;
  return normalizeStoredSearchTerms(row?.fintech_sourcing_search_terms ?? []);
}

export async function updateFintechSourcingSearchTerms(nextTerms: string[]) {
  const { organization } = await getDashboardContext();
  const parsedTerms = searchTermsSchema.parse(
    nextTerms.map((term) => term.trim()).filter((term) => term.length > 0)
  );

  const db = createAdminClient();
  const { data, error } = await db
    .from("organization_settings")
    .upsert(
      {
        organization_id: organization.id,
        fintech_sourcing_search_terms: parsedTerms
      },
      {
        onConflict: "organization_id"
      }
    )
    .select("fintech_sourcing_search_terms")
    .single();

  if (error) {
    throw new Error(`Failed to save fintech sourcing search terms: ${error.message}`);
  }
  const row = data as OrganizationSettingsRow;
  return normalizeStoredSearchTerms(row.fintech_sourcing_search_terms);
}
