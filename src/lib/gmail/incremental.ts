import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient } from "@/lib/gmail/client";
import { bootstrapGmailConnection } from "@/lib/gmail/bootstrap";
import { syncRecentInbox } from "@/lib/gmail/recent-sync";
import { rebuildThreadStats } from "@/lib/mail/rebuild-threads";
import { parseMessage } from "@/lib/gmail/parser";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import { toEmailInsert } from "@/lib/mail/parser";
import { emailUpsertConflict, type MailScope } from "@/lib/mail/scope";
import type { MailConnection } from "@/types/mail";

const METADATA_HEADERS = [
  "From",
  "To",
  "Cc",
  "Subject",
  "Date",
  "References",
  "In-Reply-To",
];

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
  let synced = 0;

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
        if (!messageId) continue;

        const detail = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "metadata",
          metadataHeaders: METADATA_HEADERS,
        });

        const parsed = parseMessage(detail.data, mailboxEmails);
        if (!parsed) continue;

        await supabase.from("emails").upsert(
          toEmailInsert(parsed, scope, "google", connection.id),
          { onConflict: emailUpsertConflict(scope) }
        );

        synced += 1;
      }
    }

    if (synced > 0) {
      await rebuildThreadStats(scope);
    }

    if (newHistoryId && connection.id) {
      await supabase
        .from("mail_connections")
        .update({ sync_cursor: newHistoryId })
        .eq("id", connection.id);
    }
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

  return { synced };
}
