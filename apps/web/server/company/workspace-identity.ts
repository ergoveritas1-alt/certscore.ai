import "server-only";

import { randomUUID } from "node:crypto";

function slugifyWorkspaceName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 71) || "workspace";
}

export function createWorkspaceSlug(name: string) {
  return `${slugifyWorkspaceName(name)}-${randomUUID().slice(0, 8)}`;
}

export function createUserWorkspaceIdentity(email: string) {
  const name = `${email.slice(0, 110)} workspace`;
  return {
    name,
    slug: createWorkspaceSlug(name)
  };
}
