"use server";

import { z } from "zod";
import { getDashboardContext } from "../auth";
import { loadOrganizationSettings, upsertOrganizationSettings } from "./repository";

const searchTermsSchema = z.array(z.string().trim().min(1).max(200)).max(500);

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
  const settings = await loadOrganizationSettings(organization.id);
  return normalizeStoredSearchTerms(settings?.fintech_sourcing_search_terms ?? []);
}

export async function updateFintechSourcingSearchTerms(nextTerms: string[]) {
  const { organization } = await getDashboardContext();
  const parsedTerms = searchTermsSchema.parse(
    nextTerms.map((term) => term.trim()).filter((term) => term.length > 0)
  );

  const settings = await upsertOrganizationSettings(organization.id, {
    fintech_sourcing_search_terms: parsedTerms
  });

  return normalizeStoredSearchTerms(settings?.fintech_sourcing_search_terms ?? []);
}
