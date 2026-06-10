import { getOrgMembership } from "@/lib/org/context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function userCanAccessOrgData(
  userId: string,
  organizationId: string | null | undefined
): Promise<boolean> {
  if (!organizationId) return true;
  const membership = await getOrgMembership(userId);
  return membership?.organizationId === organizationId;
}

export async function getThreadForUser(
  userId: string,
  threadId: string
): Promise<Record<string, unknown> | null> {
  const supabase = createAdminClient();
  const { data: thread } = await supabase
    .from("threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return null;

  if (thread.organization_id) {
    const allowed = await userCanAccessOrgData(userId, thread.organization_id);
    return allowed ? thread : null;
  }

  return thread.user_id === userId ? thread : null;
}
