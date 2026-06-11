import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient } from "@/lib/gmail/client";
import { bootstrapGmailConnection } from "@/lib/gmail/bootstrap";
import { syncRecentInbox } from "@/lib/gmail/recent-sync";
import { rebuildThreadStats } from "@/lib/mail/rebuild-threads";
import {
  bulkUpsertParsedEmails,
  fetchGmailMetadataBatch,
} from "@/lib/gmail/metadata-sync";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import type { MailScope } from "@/lib/mail/scope";
import type { MailConnection } from "@/types/mail";

export async function incrementalSync(
  scope: MailScope,
  connection: MailConnection
): Promise<{ synced: number }> {
  const historyId = connection.sync_cursor;

  if (!historyId) {
    const boot = await bootstrapGmailConnection(scope, connection);
    return { synced: boot.recentSynced };
  }

  const gmail = await getGmailClient(connection);
  const supabase = createAdminClient();
  const mailboxEmails = await getMailboxEmails(scope);
  const newMessageIds: string[] = [];

  try {
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyId,
      historyTypes: ["messageAdded"],
    });

    const history = historyRes.data.history ?? [];
    const newHistoryId = historyRes.data.historyId;

    for (const record of history) {
      for (const added of record.messagesAdded ?? []) {
        const messageId = added.message?.id;
        if (messageId) newMessageIds.push(messageId);
      }
    }

    let synced = 0;

    if (newMessageIds.length > 0) {
      const { parsed } = await fetchGmailMetadataBatch(
        gmail,
        newMessageIds,
        mailboxEmails
      );
      const upsert = await bulkUpsertParsedEmails(
        scope,
        connection.id,
        parsed
      );
      synced = upsert.synced;

      if (synced > 0) {
        await rebuildThreadStats(scope);
      }
    }

    if (newHistoryId && connection.id) {
      await supabase
        .from("mail_connections")
        .update({ sync_cursor: newHistoryId })
        .eq("id", connection.id);
    }

    return { synced };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("404") || message.includes("historyId")) {
      const recent = await syncRecentInbox(scope, connection, {
        maxMessages: 30,
        newerThanDays: 7,
      });
      await rebuildThreadStats(scope);
      return { synced: recent.synced };
    }
    throw err;
  }
}
