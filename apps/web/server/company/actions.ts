"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findAppUserByEmailRecord, findOrganizationMembershipByUserId } from "../users/repository";
import { deleteStorageObject, putStorageObject } from "../storage/s3";
import { isWorkspaceLogoKey, MAX_LOGO_UPLOAD_BYTES, normalizeCompanyLogo } from "./logo-image";
import { requireCompanyCapability } from "./authorization";
import {
  addCompanyMembership,
  createCompany,
  findCompanyByName,
  removeCompanyMembership,
  updateCompanyLogo,
  updateCompanyReportHeaderTheme,
  updateCompanyName,
  updateCompanyMembershipRole
} from "./repository";
import { requirePlatformAdminContext } from "../admin/platform-admin";
import { createWorkspaceSlug } from "./workspace-identity";

const companySchema = z.object({
  name: z.string().trim().min(2).max(120)
});

const userSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email()
});

const membershipSchema = z.object({
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["advanced", "user"])
});

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function revalidateCompany(organizationId: string) {
  revalidatePath("/app/admin/companies");
  revalidatePath(`/app/admin/companies/${organizationId}`);
  revalidatePath("/app/settings/company");
  revalidatePath("/app/settings");
  revalidatePath("/app/scans/[scanId]", "page");
  revalidatePath("/app/scanso2/[scanId]", "page");
}

export async function createCompanyFormAction(formData: FormData) {
  await requirePlatformAdminContext();
  const parsed = companySchema.parse({ name: formValue(formData, "name") });
  const slug = createWorkspaceSlug(parsed.name);
  if (await findCompanyByName(parsed.name)) throw new Error("A company with this name already exists.");
  const companyId = await createCompany({ ...parsed, slug });
  redirect(`/app/admin/companies/${companyId}`);
}

export async function updateCompanyNameFormAction(formData: FormData) {
  const parsed = z.object({
    companyId: z.string().uuid(),
    name: z.string().trim().min(2).max(120)
  }).parse({
    companyId: formValue(formData, "companyId"),
    name: formValue(formData, "name")
  });
  await requireCompanyCapability(parsed.companyId, "manage_settings");
  if (await findCompanyByName(parsed.name, parsed.companyId)) throw new Error("A company with this name already exists.");

  try {
    await updateCompanyName(parsed.companyId, parsed.name);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new Error("A company with this name already exists.");
    }
    throw error;
  }
  revalidateCompany(parsed.companyId);
}

export async function createCompanyUserFormAction(formData: FormData) {
  return addExistingCompanyUserFormAction(formData);
}

export async function addExistingCompanyUserFormAction(formData: FormData) {
  const companyId = formValue(formData, "companyId");
  await requireCompanyCapability(companyId, "manage_users");
  const parsed = userSchema.parse({ companyId, email: formValue(formData, "email") });
  const existingUser = await findAppUserByEmailRecord(parsed.email);
  if (!existingUser) {
    throw new Error("Create the user from Admin → Users first, then assign them to a workspace.");
  }
  if (await findOrganizationMembershipByUserId(existingUser.id)) {
    throw new Error("This user already belongs to a workspace. Users can belong to only one workspace.");
  }
  await addCompanyMembership({ organizationId: parsed.companyId, userId: existingUser.id });
  revalidateCompany(parsed.companyId);
}

export async function updateCompanyMembershipRoleFormAction(formData: FormData) {
  const parsed = membershipSchema.parse({
    companyId: formValue(formData, "companyId"),
    userId: formValue(formData, "userId"),
    role: formValue(formData, "role")
  });
  await requireCompanyCapability(parsed.companyId, "manage_users");
  await updateCompanyMembershipRole({ organizationId: parsed.companyId, userId: parsed.userId, role: parsed.role });
  revalidateCompany(parsed.companyId);
}

export async function removeCompanyUserFormAction(formData: FormData) {
  const companyId = formValue(formData, "companyId");
  const userId = formValue(formData, "userId");
  await requireCompanyCapability(companyId, "manage_users");
  z.string().uuid().parse(userId);
  await removeCompanyMembership({ organizationId: companyId, userId });
  revalidateCompany(companyId);
}

export async function uploadCompanyLogoFormAction(formData: FormData) {
  const companyId = z.string().uuid().parse(formValue(formData, "companyId"));
  await requireCompanyCapability(companyId, "manage_logo");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file.");
  if (file.size > MAX_LOGO_UPLOAD_BYTES) throw new Error("Logo must be 2 MB or smaller.");
  const body = await normalizeCompanyLogo(Buffer.from(await file.arrayBuffer()), file.type);
  const key = `company-logos/${companyId}/${randomUUID()}.png`;
  await putStorageObject({ key, body, contentType: "image/png" });
  let previous: string | null;
  try {
    previous = await updateCompanyLogo(companyId, key);
  } catch (error) {
    await discardCompanyLogo(companyId, key);
    throw error;
  }
  await discardCompanyLogo(companyId, previous);
  revalidateCompany(companyId);
}

export async function removeCompanyLogoFormAction(formData: FormData) {
  const companyId = z.string().uuid().parse(formValue(formData, "companyId"));
  await requireCompanyCapability(companyId, "manage_logo");
  const previous = await updateCompanyLogo(companyId, null);
  await discardCompanyLogo(companyId, previous);
  revalidateCompany(companyId);
}

async function discardCompanyLogo(companyId: string, key: string | null) {
  if (!key || !isWorkspaceLogoKey(companyId, key)) return;
  try {
    await deleteStorageObject(key);
  } catch {
    console.error(JSON.stringify({ event: "company.logo_cleanup_failed" }));
  }
}

export async function saveWorkspaceLogoAction(
  _state: { error: string | null; success: string | null }, formData: FormData,
): Promise<{ error: string | null; success: string | null }> {
  try {
    if (formValue(formData, "intent") === "remove") await removeCompanyLogoFormAction(formData);
    else await uploadCompanyLogoFormAction(formData);
    return { error: null, success: formValue(formData, "intent") === "remove" ? "Workspace logo removed." : "Workspace logo saved." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      error: /^(Choose |Logo must |Use a valid)/.test(message) ? message
        : message.startsWith("Company capability denied") ? "Only workspace managers can change the report logo."
        : "Unable to save the workspace logo. Try again.",
      success: null,
    };
  }
}

export async function saveWorkspaceReportHeaderAction(
  _state: { error: string | null; success: string | null }, formData: FormData,
): Promise<{ error: string | null; success: string | null }> {
  try {
    const companyId = z.string().uuid().parse(formValue(formData, "companyId"));
    await requireCompanyCapability(companyId, "manage_logo");
    const theme = z.enum(["white", "black"]).safeParse(formValue(formData, "headerTheme"));
    if (!theme.success) return { error: "Choose a white or black report header.", success: null };
    await updateCompanyReportHeaderTheme(companyId, theme.data);
    revalidateCompany(companyId);
    return { error: null, success: "Report header saved." };
  } catch (error) {
    return { error: error instanceof Error && error.message.startsWith("Company capability denied")
      ? "Advanced access is required to change report branding." : "Unable to save the report header. Try again.", success: null };
  }
}
