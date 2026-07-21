"use client";

import { useFormStatus } from "react-dom";
import {
  ASSIGNABLE_MEMBERSHIP_ROLES,
  type MembershipRole
} from "../../lib/auth/membership-role-policy";

export type { MembershipRole } from "../../lib/auth/membership-role-policy";

type MembershipRoleFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultRole: MembershipRole;
  organizationId: string;
  userId: string;
};

function RoleSelect({ defaultRole }: { defaultRole: MembershipRole }) {
  const { pending } = useFormStatus();

  return (
    <select
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-wait disabled:opacity-60"
      defaultValue={defaultRole}
      disabled={pending}
      name="role"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {defaultRole === "admin" ? <option disabled value="admin">admin (existing)</option> : null}
      {ASSIGNABLE_MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
    </select>
  );
}

export function MembershipRoleForm({ action, defaultRole, organizationId, userId }: MembershipRoleFormProps) {
  const formKey = `${organizationId}:${userId}:${defaultRole}`;

  return (
    <form action={action} className="mt-0 self-start" key={formKey}>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="userId" type="hidden" value={userId} />
      <RoleSelect defaultRole={defaultRole} />
    </form>
  );
}
