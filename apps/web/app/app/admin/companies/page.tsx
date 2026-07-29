import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { requirePlatformAdminContext } from "../../../../server/admin/platform-admin";
import { listCompanies } from "../../../../server/company/repository";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { createSignedStorageUrl } from "../../../../server/storage/s3";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCompaniesPage() {
  await requirePlatformAdminContext();
  const companies = await listCompanies();
  const logos = await Promise.all(companies.map((company) => company.logoStorageKey ? createSignedStorageUrl(company.logoStorageKey, 900) : null));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Companies</h2>
          <p className="mt-1 text-sm text-slate-600">Manage company workspaces, membership, and branding.</p>
        </div>
        <Link className="app-raised-button app-raised-button-dark rounded-lg px-4 py-2 text-sm font-semibold text-white" href="/app/admin/companies/new">New company</Link>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Company directory</CardTitle></CardHeader>
        <CardContent>
          {companies.length === 0 ? <p className="text-sm text-slate-600">No companies have been created yet.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 pr-4">Company</th><th className="pb-3 pr-4">Users</th><th className="pb-3 pr-4">Domains</th><th className="pb-3 pr-4">Scans</th><th className="pb-3 pr-4">Created</th><th className="pb-3"> </th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((company, index) => (
                    <tr key={company.id}>
                      <td className="py-4 pr-4"><div className="flex items-center gap-3">{logos[index] ? <img alt="" className="h-9 w-9 rounded-lg object-contain ring-1 ring-slate-200" src={logos[index] ?? undefined} /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500">{company.name.slice(0, 1).toUpperCase()}</div>}<div><p className="font-medium text-slate-900">{company.name}</p><p className="text-xs text-slate-500">{company.slug}</p></div></div></td>
                      <td className="py-4 pr-4 text-slate-600">{company.userCount} <span className="text-xs text-slate-400">({company.advancedUserCount} advanced)</span></td>
                      <td className="py-4 pr-4 text-slate-600">{company.domainCount}</td>
                      <td className="py-4 pr-4 text-slate-600">{company.scanCount}</td>
                      <td className="whitespace-nowrap py-4 pr-4 text-slate-600">{formatAdminDateTime(company.createdAt)}</td>
                      <td className="py-4 text-right"><Link className="font-semibold text-sky-700 hover:text-sky-900" href={`/app/admin/companies/${company.id}`}>Manage</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
