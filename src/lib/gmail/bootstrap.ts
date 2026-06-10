import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import { syncRecentInbox } from "@/lib/gmail/recent-sync";
import { rebuildThreadStats } from "@/lib/mail/rebuild-threads";
import type { MailScope } from "@/lib/mail/scope";
import type { MailConnection } from "@/types/mail";

export type GmailProfileStats = {
  messagesTotal: number;
  threadsTotal: number;
  historyId: string | null;
};

/** Fast connect: save history cursor + Gmail totals, sync recent inbox only. */
export async function bootstrapGmailConnection(
  scope: MailScope,
  connection: MailConnection
): Promise<{
  profile: GmailProfileStats;
  recentSynced: number;
  recentErrors: number;
}> {
  await refreshConnectionToken(connection);
  const gmail = await getGmailClient(connection);
  const supabase = createAdminClient();

  const profileRes = await gmail.users.getProfile({ userId: "me" });
  const profile: GmailProfileStats = {
    messagesTotal: profileRes.data.messagesTotal ?? 0,
    threadsTotal: profileRes.data.threadsTotal ?? 0,
    historyId: profileRes.data.historyId ?? null,
  };

  if (connection.id) {
    await supabase
      .from("mail_connections")
      .update({
        sync_cursor: profile.historyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  }

  const recent = await syncRecentInbox(scope, connection, {
    maxMessages: 50,
    newerThanDays: 30,
  });

  await rebuildThreadStats(scope);

  return {
    profile,
    recentSynced: recent.synced,
    recentErrors: recent.errors,
  };
}

export async function fetchGmailProfileStats(
  connection: MailConnection
): Promise<GmailProfileStats | null> {
  if (!connection.access_token && !connection.refresh_token) return null;

  try {
    await refreshConnectionToken(connection);
    const gmail = await getGmailClient(connection);
    const profileRes = await gmail.users.getProfile({ userId: "me" });
    return {
      messagesTotal: profileRes.data.messagesTotal ?? 0,
      threadsTotal: profileRes.data.threadsTotal ?? 0,
      historyId: profileRes.data.historyId ?? null,
    };
  } catch (err) {
    console.error(`Gmail profile fetch failed for ${connection.mailbox_email}:`, err);
    return null;
  }
}
