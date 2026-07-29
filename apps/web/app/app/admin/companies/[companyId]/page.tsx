import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { requirePlatformAdminContext } from "../../../../../server/admin/platform-admin";
import { getCompanyDetail } from "../../../../../server/company/repository";
import { createCompanyUserFormAction, removeCompanyLogoFormAction, removeCompanyUserFormAction, updateCompanyMembershipRoleFormAction, uploadCompanyLogoFormAction } from "../../../../../server/company/actions";
import { createSignedStorageUrl } from "../../../../../server/storage/s3";
import { formatAdminDateTime } from "../../../../../lib/admin/date-time";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ companyId: string }> };

export default async function AdminCompanyDetailPage({ params }: Props) {
  await requirePlatformAdminContext();
  const { companyId } = await params;
  const company = await getCompanyDetail(companyId);
  if (!company) notFound();
  const logoUrl = company.logoStorageKey ? await createSignedStorageUrl(company.logoStorageKey, 900) : null;

  return <CompanyDetailContent company={company} logoUrl={logoUrl} backHref="/app/admin/companies" />;
}

async function CompanyDetailContent({ company, logoUrl, backHref }: { company: NonNullable<Awaited<ReturnType<typeof getCompanyDetail>>>; logoUrl: string | null; backHref: string }) {
  return (
    <div className="space-y-6">
      <Link className="text-sm font-semibold text-sky-700" href={backHref}>← Back to companies</Link>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold text-slate-950">{company.name}</h2><p className="mt-1 text-sm text-slate-500">{company.slug} · {company.plan} plan · Created {formatAdminDateTime(company.createdAt)}</p></div><div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-2xl font-semibold text-slate-500">{logoUrl ? <img alt={`${company.name} logo`} className="h-full w-full rounded-xl object-contain" src={logoUrl} /> : company.name.slice(0, 1).toUpperCase()}</div></div>
      <div className="grid gap-4 sm:grid-cols-4"><Metric label="Users" value={company.userCount} /><Metric label="Advanced" value={company.advancedUserCount} /><Metric label="Domains" value={company.domainCount} /><Metric label="Scans" value={company.scanCount} /></div>

      <Card className="border-slate-200 bg-white"><CardHeader><CardTitle>Company logo</CardTitle></CardHeader><CardContent className="space-y-3"><form action={uploadCompanyLogoFormAction} className="flex flex-wrap items-end gap-3"><input name="companyId" type="hidden" value={company.id} /><label className="text-sm font-medium text-slate-700">Upload logo<input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="mt-1 block text-sm" name="logo" required type="file" /></label><button className="app-raised-button rounded-lg px-3 py-2 text-sm font-semibold" type="submit">Upload</button></form>{company.logoStorageKey ? <form action={removeCompanyLogoFormAction}><input name="companyId" type="hidden" value={company.id} /><button className="text-sm font-semibold text-rose-700" type="submit">Remove logo</button></form> : <p className="text-xs text-slate-500">PNG, JPEG, WebP, or SVG up to 2 MB.</p>}</CardContent></Card>

      <Card className="border-slate-200 bg-white"><CardHeader><CardTitle>Add user</CardTitle><p className="text-sm text-slate-600">New users receive default access. The first user in a company receives advanced access automatically. We’ll email the user a secure link to choose their own password.</p></CardHeader><CardContent><form action={createCompanyUserFormAction} className="grid gap-3"><input name="companyId" type="hidden" value={company.id} /><label className="text-sm font-medium text-slate-700">Email<input className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3" name="email" required type="email" /></label><div><button className="app-raised-button app-raised-button-dark rounded-lg px-4 py-2 text-sm font-semibold text-white" type="submit">Create user and send invite</button></div></form></CardContent></Card>

      <Card className="border-slate-200 bg-white"><CardHeader><CardTitle>Users</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 pr-4">User</th><th className="pb-3 pr-4">Access</th><th className="pb-3 pr-4">Last login</th><th className="pb-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{company.users.map((user) => <tr key={user.id}><td className="py-4 pr-4"><p className="font-medium text-slate-900">{user.fullName ?? user.email}</p><p className="text-xs text-slate-500">{user.email}</p></td><td className="py-4 pr-4"><form action={updateCompanyMembershipRoleFormAction} className="flex items-center gap-2"><input name="companyId" type="hidden" value={company.id} /><input name="userId" type="hidden" value={user.id} /><select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" defaultValue={user.role === "admin" ? "advanced" : user.role} name="role"><option value="user">default</option><option value="advanced">advanced</option></select><button className="text-xs font-semibold text-sky-700" type="submit">Save</button></form></td><td className="py-4 pr-4 text-slate-600">{user.lastLoginAt ? formatAdminDateTime(user.lastLoginAt) : "Never"}</td><td className="py-4"><form action={removeCompanyUserFormAction}><input name="companyId" type="hidden" value={company.id} /><input name="userId" type="hidden" value={user.id} /><button className="text-sm font-semibold text-rose-700" type="submit">Remove</button></form></td></tr>)}</tbody></table></div></CardContent></Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div>; }
