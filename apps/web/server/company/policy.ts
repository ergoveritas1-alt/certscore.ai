import type { AssignableMembershipRole } from "../../lib/auth/membership-role-policy";

export function isAdvancedCompanyRole(role: string | null | undefined) {
  return role === "advanced" || role === "admin";
}

export function roleForNewCompanyMember(memberCount: number, requestedRole: AssignableMembershipRole = "user"): AssignableMembershipRole {
  return memberCount === 0 ? "advanced" : requestedRole;
}

export function canLoseAdvancedAccess(input: { advancedCount: number; currentRole: string; nextRole: AssignableMembershipRole }) {
  return !(isAdvancedCompanyRole(input.currentRole) && input.nextRole === "user" && input.advancedCount <= 1);
}

export function canRemoveCompanyMember(input: { advancedCount: number; currentRole: string }) {
  return !(isAdvancedCompanyRole(input.currentRole) && input.advancedCount <= 1);
}
