import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { getCompanyAccess } from "../../../../server/company/authorization";
import { createCompanyUserFormAction, removeCompanyLogoFormAction, removeCompanyUserFormAction, updateCompanyMembershipRoleFormAction, updateCompanyNameFormAction, uploadCompanyLogoFormAction } from "../../../../server/company/actions";
import { getCompanyDetail } from "../../../../server/company/repository";
import { createSignedStorageUrl } from "../../../../server/storage/s3";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanySettingsPage() {
  const access = await getCompanyAccess();
  if (!access.organizationId) notFound();
  const company = await getCompanyDetail(access.organizationId);
  if (!company) notFound();
  if (!access.isPlatformAdmin) notFound();
  const canManage = true;
  const logoUrl = company.logoStorageKey ? await createSignedStorageUrl(company.logoStorageKey, 900) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
          <p className="mt-0.5 text-sm text-slate-600">{company.name} <span className="text-slate-400">·</span> {company.slug}</p>
        </div>
        <Link className="text-sm font-semibold text-sky-700" href="/app/settings">← Settings</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {logoUrl ? <img alt={`${company.name} logo`} className="h-10 w-10 rounded-lg object-contain ring-1 ring-slate-200" src={logoUrl} /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg font-semibold text-slate-500">{company.name.slice(0, 1).toUpperCase()}</div>}
        <div className="mr-auto"><p className="text-sm font-medium text-slate-900">Workspace overview</p><p className="text-xs text-slate-500">{company.userCount} users <span className="text-slate-300">·</span> {company.domainCount} domains <span className="text-slate-300">·</span> {company.scanCount} scans</p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{access.membershipRole === "advanced" || access.membershipRole === "admin" ? "Advanced access" : "Default access"}</span>
      </div>

      {canManage ? <Card className="border border-slate-200 bg-white"><CardHeader className="px-4 py-4"><CardTitle className="text-lg">Workspace details</CardTitle><p className="text-xs text-slate-500">Workspace names must be unique across CertScore.</p></CardHeader><CardContent className="px-4 pb-4"><form action={updateCompanyNameFormAction} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input name="companyId" type="hidden" value={company.id} /><label className="min-w-0 max-w-xl flex-1 text-xs font-semibold text-slate-600">Workspace name<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" defaultValue={company.name} name="name" required type="text" /></label><button className="app-raised-button app-raised-button-dark h-10 shrink-0 rounded-lg px-4 text-sm font-semibold text-white" type="submit">Save name</button></form></CardContent></Card> : null}

      {canManage ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="border border-slate-200 bg-white"><CardHeader className="px-4 py-4"><CardTitle className="text-lg">Add user</CardTitle><p className="text-xs text-slate-500">They’ll receive a secure link to set their password.</p></CardHeader><CardContent className="px-4 pb-4"><form action={createCompanyUserFormAction} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input name="companyId" type="hidden" value={company.id} /><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Email<input aria-label="Email address" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" name="email" required type="email" /></label><button className="app-raised-button app-raised-button-dark h-10 shrink-0 rounded-lg px-4 text-sm font-semibold text-white" type="submit">Create &amp; invite</button></form></CardContent></Card>
        <Card className="border border-slate-200 bg-white"><CardHeader className="px-4 py-4"><CardTitle className="text-lg">Branding</CardTitle><p className="text-xs text-slate-500">PNG, JPEG, WebP, or SVG up to 2 MB.</p></CardHeader><CardContent className="px-4 pb-4"><form action={uploadCompanyLogoFormAction} className="flex items-center gap-2"><input name="companyId" type="hidden" value={company.id} /><label className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600"><span className="sr-only">Choose logo</span><input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full truncate text-xs font-normal" name="logo" required type="file" /></label><button className="app-raised-button shrink-0 rounded-lg px-3 py-2 text-xs font-semibold" type="submit">Upload</button></form>{company.logoStorageKey ? <form action={removeCompanyLogoFormAction} className="mt-2"><input name="companyId" type="hidden" value={company.id} /><button className="text-xs font-semibold text-rose-700" type="submit">Remove logo</button></form> : null}</CardContent></Card>
      </div> : <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Only advanced users can manage company users or branding.</p>}

      <Card className="border border-slate-200 bg-white"><CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div><CardTitle className="text-lg">Users</CardTitle>{company.advancedUserCount <= 1 ? <p className="mt-1 text-xs text-slate-500">At least one advanced user is required.</p> : null}</div><span className="text-xs text-slate-500">{company.userCount} total</span></CardHeader><CardContent className="px-4 pb-3"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-2 pr-4">User</th><th className="pb-2 pr-4">Access</th><th className="pb-2 pr-4">Last login</th>{canManage ? <th className="pb-2">Actions</th> : null}</tr></thead><tbody className="divide-y divide-slate-100">{company.users.map((user) => { const isRequiredAdvancedUser = company.advancedUserCount <= 1 && (user.role === "admin" || user.role === "advanced"); return <tr key={user.id}><td className="py-2.5 pr-4"><p className="font-medium text-slate-900">{user.fullName ?? user.email}</p><p className="text-xs text-slate-500">{user.email}</p></td><td className="py-2.5 pr-4 text-slate-600">{isRequiredAdvancedUser ? <span className="font-medium text-slate-900">advanced <span className="text-xs font-normal text-slate-500">(required)</span></span> : user.role === "admin" || user.role === "advanced" ? "advanced" : "default"}</td><td className="py-2.5 pr-4 text-slate-600">{user.lastLoginAt ? formatAdminDateTime(user.lastLoginAt) : "Never"}</td>{canManage ? <td className="py-2.5">{isRequiredAdvancedUser ? <span className="text-xs text-slate-400">Required</span> : <div className="flex flex-wrap items-center gap-3"><form action={updateCompanyMembershipRoleFormAction} className="flex items-center gap-2"><input name="companyId" type="hidden" value={company.id} /><input name="userId" type="hidden" value={user.id} /><select className="rounded-lg border border-slate-300 px-2 py-1 text-xs" defaultValue={user.role === "admin" ? "advanced" : user.role} name="role"><option value="user">default</option><option value="advanced">advanced</option></select><button className="text-xs font-semibold text-sky-700" type="submit">Save</button></form><form action={removeCompanyUserFormAction}><input name="companyId" type="hidden" value={company.id} /><input name="userId" type="hidden" value={user.id} /><button className="text-xs font-semibold text-rose-700" type="submit">Remove</button></form></div>}</td> : null}</tr>; })}</tbody></table></div></CardContent></Card>
    </div>
  );
}
