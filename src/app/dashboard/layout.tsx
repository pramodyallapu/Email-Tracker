import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { auth } from "@/lib/auth";
import { getOrgMembership } from "@/lib/org/context";
import { resolveMailScope, scopeEmailsFilter } from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  if (session.error === "RefreshAccessTokenError") {
    redirect("/auth/signin?error=RefreshAccessTokenError");
  }

  const membership = session.user?.id
    ? await getOrgMembership(session.user.id)
    : null;

  let showSyncBanner = false;

  if (session.user?.id && membership) {
    try {
      const scope = await resolveMailScope(session.user.id);
      const supabase = createAdminClient();

      const emailCountQuery = scopeEmailsFilter(
        supabase.from("emails").select("*", { count: "exact", head: true }),
        scope
      );
      const { count: emailCount } = await emailCountQuery;

      const { data: connections } = await supabase
        .from("mail_connections")
        .select("sync_cursor")
        .eq("organization_id", membership.organizationId);

      const hasConnections = (connections ?? []).length > 0;
      const hasSynced = (connections ?? []).some((c) => c.sync_cursor);
      showSyncBanner = hasConnections && !hasSynced && (emailCount ?? 0) === 0;
    } catch (err) {
      console.error("Dashboard layout: could not check sync status", err);
    }
  }

  return (
    <DashboardShell
      showSyncBanner={showSyncBanner}
      organizationName={membership?.organizationName}
    >
      {children}
    </DashboardShell>
  );
}
