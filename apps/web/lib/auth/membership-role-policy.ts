export const MEMBERSHIP_ROLES = ["admin", "advanced", "user"] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ASSIGNABLE_MEMBERSHIP_ROLES = ["advanced", "user"] as const;

export type AssignableMembershipRole = (typeof ASSIGNABLE_MEMBERSHIP_ROLES)[number];

export const DEFAULT_NEW_MEMBERSHIP_ROLE: AssignableMembershipRole = "user";
