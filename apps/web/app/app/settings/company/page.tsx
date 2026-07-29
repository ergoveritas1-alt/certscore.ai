import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { getCompanyAccess } from "../../../../server/company/authorization";
import { createCompanyUserFormAction, removeCompanyLogoFormAction, removeCompanyUserFormAction, updateCompanyMembershipRoleFormAction, uploadCompanyLogoFormAction } from "../../../../server/company/actions";
import { getCompanyDetail } from "../../../../server/company/repository";
import { createSignedStorageUrl } from "../../../../server/storage/s3";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanySettingsPage() {
  const access = await getCompanyAccess();
  if (!access.organizationId) notFound();
  const company = await getCompanyDetail(access.organizationId);
  if (!company) notFound();
  const canManage = access.isPlatformAdmin || ["advanced", "admin"].includes(access.membershipRole ?? "");
  const logoUrl = company.logoStorageKey ? await createSignedStorageUrl(company.logoStorageKey, 900) : null;

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Company</h1><p className="mt-1 text-sm text-slate-600">{company.name} · {company.slug}</p></div>
      <div className="flex items-center gap-3">{logoUrl ? <img alt={`${company.name} logo`} className="h-14 w-14 rounded-xl object-contain ring-1 ring-slate-200" src={logoUrl} /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-xl font-semibold text-slate-500">{company.name.slice(0, 1).toUpperCase()}</div>}<div><p className="text-sm text-slate-600">{company.userCount} users · {company.domainCount} domains · {company.scanCount} scans</p><p className="text-xs text-slate-500">Your access: {access.membershipRole === "advanced" || access.membershipRole === "admin" ? "advanced" : "default"}</p></div></div>

      {canManage ? <>
        <Card className="border-slate-200 bg-white"><CardHeader><CardTitle>Company logo</CardTitle></CardHeader><CardContent className="space-y-3"><form action={uploadCompanyLogoFormAction} className="flex flex-wrap items-end gap-3"><input name="companyId" type="hidden" value={company.id} /><label className="text-sm font-medium text-slate-700">Upload logo<input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="mt-1 block text-sm" name="logo" required type="file" /></label><button className="app-raised-button rounded-lg px-3 py-2 text-sm font-semibold" type="submit">Upload</button></form>{company.logoStorageKey ? <form action={removeCompanyLogoFormAction}><input name="companyId" type="hidden" value={company.id} /><button className="text-sm font-semibold text-rose-700" type="submit">Remove logo</button></form> : <p className="text-xs text-slate-500">PNG, JPEG, WebP, or SVG up to 2 MB.</p>}</CardContent></Card>
        <Card className="border-slate-200 bg-white"><CardHeader><CardTitle>Add user</CardTitle><p className="text-sm text-slate-600">New users receive default access. We’ll email the user a secure link to choose their own password.</p></CardHeader><CardContent><form action={createCompanyUserFormAction} className="grid gap-3"><input name="companyId" type="hidden" value={company.id} /><label className="text-sm font-medium text-slate-700">Email<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" name="email" required type="email" /></label><div><button className="app-raised-button app-raised-button-dark rounded-lg px-4 py-2 text-sm font-semibold text-white" type="submit">Create user and send invite</button></div></form></CardContent></Card>
      </> : <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Only advanced users can manage company users or branding.</p>}

      <Card className="border-slate-200 bg-white"><CardHeader><CardTitle>Company users</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 pr-4">User</th><th className="pb-3 pr-4">Access</th><th className="pb-3 pr-4">Last login</th>{canManage ? <th className="pb-3">Actions</th> : null}</tr></thead><tbody className="divide-y divide-slate-100">{company.users.map((user) => <tr key={user.id}><td className="py-4 pr-4"><p className="font-medium text-slate-900">{user.fullName ?? user.email}</p><p className="text-xs text-slate-500">{user.email}</p></td><td className="py-4 pr-4 text-slate-600">{user.role === "admin" || user.role === "advanced" ? "advanced" : "default"}</td><td className="py-4 pr-4 text-slate-600">{user.lastLoginAt ? formatAdminDateTime(user.lastLoginAt) : "Never"}</td>{canManage ? <td className="py-4"><div className="flex flex-wrap items-center gap-3"><form action={updateCompanyMembershipRoleFormAction} className="flex items-center gap-2"><input name="companyId" type="hidden" value={company.id} /><input name="userId" type="hidden" value={user.id} /><select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" defaultValue={user.role === "admin" ? "advanced" : user.role} name="role"><option value="user">default</option><option value="advanced">advanced</option></select><button className="text-xs font-semibold text-sky-700" type="submit">Save</button></form><form action={removeCompanyUserFormAction}><input name="companyId" type="hidden" value={company.id} /><input name="userId" type="hidden" value={user.id} /><button className="text-sm font-semibold text-rose-700" type="submit">Remove</button></form></div></td> : null}</tr>)}</tbody></table></div></CardContent></Card>
      <Link className="text-sm font-semibold text-sky-700" href="/app/settings">← Back to settings</Link>
    </div>
  );
}
