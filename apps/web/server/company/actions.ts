"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "../better-auth/auth";
import { sendPasswordSetupLink } from "../auth-flows/password-setup";
import { upsertAppUserProfile, findAppUserByEmailRecord } from "../users/repository";
import { putStorageObject } from "../storage/s3";
import { requireCompanyCapability } from "./authorization";
import {
  addCompanyMembership,
  createCompany,
  findCompanyBySlug,
  removeCompanyMembership,
  updateCompanyLogo,
  updateCompanyMembershipRole
} from "./repository";
import { requirePlatformAdminContext } from "../admin/platform-admin";

const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.").max(80)
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
}

export async function createCompanyFormAction(formData: FormData) {
  await requirePlatformAdminContext();
  const parsed = companySchema.parse({ name: formValue(formData, "name"), slug: formValue(formData, "slug") });
  if (await findCompanyBySlug(parsed.slug)) throw new Error("A company with this slug already exists.");
  const companyId = await createCompany(parsed);
  redirect(`/app/admin/companies/${companyId}`);
}

export async function createCompanyUserFormAction(formData: FormData) {
  const companyId = formValue(formData, "companyId");
  await requireCompanyCapability(companyId, "manage_users");
  const parsed = userSchema.parse({
    companyId,
    email: formValue(formData, "email")
  });

  if (await findAppUserByEmailRecord(parsed.email)) throw new Error("A user with this email already exists.");
  const initialName = parsed.email.split("@", 1)[0] || parsed.email;
  const created = await getAuth().api.createUser({
    body: { email: parsed.email, name: initialName }
  });
  if (!created?.user) throw new Error("The authentication account could not be created.");

  await upsertAppUserProfile({
    authProvider: "password",
    email: created.user.email,
    fullName: created.user.name ?? initialName,
    userId: created.user.id
  });
  await addCompanyMembership({ organizationId: parsed.companyId, userId: created.user.id });
  await sendPasswordSetupLink(created.user.email);
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
  const companyId = formValue(formData, "companyId");
  await requireCompanyCapability(companyId, "manage_logo");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo must be 2 MB or smaller.");
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
  if (!allowedTypes.has(file.type)) throw new Error("Logo must be PNG, JPEG, WebP, or SVG.");

  const extension = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1] ?? "bin";
  const key = `company-logos/${companyId}/${randomUUID()}.${extension}`;
  await putStorageObject({ key, body: Buffer.from(await file.arrayBuffer()), contentType: file.type });
  await updateCompanyLogo(companyId, key);
  revalidateCompany(companyId);
}

export async function removeCompanyLogoFormAction(formData: FormData) {
  const companyId = formValue(formData, "companyId");
  await requireCompanyCapability(companyId, "manage_logo");
  await updateCompanyLogo(companyId, null);
  revalidateCompany(companyId);
}
