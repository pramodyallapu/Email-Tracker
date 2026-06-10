import { getOrgMembership } from "@/lib/org/context";
import { redirect } from "next/navigation";

export async function requireOrganization(userId: string) {
  const membership = await getOrgMembership(userId);
  if (!membership) {
    redirect("/dashboard/organization");
  }
  return membership;
}
