import { fetchGmailProfileStats } from "@/lib/gmail/bootstrap";
import { getOrgMailConnections, getMailConnections } from "@/lib/mail/connections";
import { isMailboxFullSyncComplete } from "@/lib/mail/sync-progress";
import { resolveMailScope, scopeEmailsFilter, type MailScope } from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection } from "@/types/mail";

export type MailboxLiveStat = {
  connectionId: string;
  email: string;
  provider: string;
  messagesTotal: number | null;
  threadsTotal: number | null;
  syncedMessages: number;
  syncStatus: "idle" | "running" | "error";
};

async function countEmailsForConnection(
  scope: MailScope,
  connectionId: string
): Promise<number> {
  const supabase = createAdminClient();

  const { count: byConnection, error: connError } = await supabase
    .from("emails")
    .select("*", { count: "exact", head: true })
    .eq("mail_connection_id", connectionId);

  if (connError) {
    console.error("countEmailsForConnection:", connError.message);
  }

  return byConnection ?? 0;
}

async function syncedCountForConnection(
  scope: MailScope,
  conn: MailConnection,
  siblingCount: number
): Promise<number> {
  const byConnection = await countEmailsForConnection(scope, conn.id);
  const progressCount = conn.sync_progress_synced ?? 0;

  if (byConnection > 0 || progressCount > 0) {
    return Math.max(byConnection, progressCount);
  }

  // Single mailbox of this provider — legacy rows may lack mail_connection_id
  if (siblingCount === 1) {
    const supabase = createAdminClient();
    const query = scopeEmailsFilter(
      supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("provider", conn.provider),
      scope
    );
    const { count } = await query;
    return count ?? 0;
  }

  return 0;
}

async function statForConnection(
  scope: MailScope,
  conn: MailConnection,
  siblingCount: number
): Promise<MailboxLiveStat> {
  const syncedMessages = await syncedCountForConnection(
    scope,
    conn,
    siblingCount
  );

  let messagesTotal: number | null = null;
  let threadsTotal: number | null = null;

  if (conn.provider === "google") {
    const profile = await fetchGmailProfileStats(conn);
    if (profile) {
      messagesTotal = profile.messagesTotal;
      threadsTotal = profile.threadsTotal;
    }
  }

  const isRunning =
    !isMailboxFullSyncComplete(conn) &&
    (conn.sync_status === "running" || Boolean(conn.sync_page_token));

  return {
    connectionId: conn.id,
    email: conn.mailbox_email,
    provider: conn.provider,
    messagesTotal,
    threadsTotal,
    syncedMessages,
    syncStatus: isRunning
      ? "running"
      : conn.sync_status === "error"
        ? "error"
        : "idle",
  };
}

export async function getMailboxLiveStats(
  userId: string
): Promise<MailboxLiveStat[]> {
  const scope = await resolveMailScope(userId);
  const connections =
    scope.mode === "organization"
      ? await getOrgMailConnections(scope.organizationId)
      : await getMailConnections(scope.userId);

  const active = connections.filter(
    (c) => c.access_token || c.refresh_token
  );

  const googleCount = active.filter((c) => c.provider === "google").length;
  const zohoCount = active.filter((c) => c.provider === "zoho").length;

  return Promise.all(
    active.map((c) =>
      statForConnection(
        scope,
        c,
        c.provider === "google" ? googleCount : zohoCount
      )
    )
  );
}

export async function getEnrichedMailboxStats(userId: string) {
  const { enrichMailboxStat } = await import("@/lib/mail/sync-status");
  const stats = await getMailboxLiveStats(userId);
  return stats.map(enrichMailboxStat);
}
