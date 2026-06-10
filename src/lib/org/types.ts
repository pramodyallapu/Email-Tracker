export type OrgRole = "owner" | "manager" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrgMembership {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}
