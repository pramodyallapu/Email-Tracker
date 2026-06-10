import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import { parseMessage } from "@/lib/gmail/parser";
import { toEmailInsert } from "@/lib/mail/parser";
import { updateConnectionSyncProgress } from "@/lib/mail/sync-progress";
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

/** Messages processed per API request (keeps under server timeout). */
export const GMAIL_FULL_SYNC_BATCH_SIZE = 250;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countSyncedForConnection(
  connectionId: string
): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("emails")
    .select("*", { count: "exact", head: true })
    .eq("mail_connection_id", connectionId);

  if (error) {
    console.error("countSyncedForConnection:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function fullGmailSyncBatch(
  scope: MailScope,
  connection: MailConnection
): Promise<{ synced: number; errors: number; hasMore: boolean; total: number }> {
  await refreshConnectionToken(connection);
  const gmail = await getGmailClient(connection);
  const supabase = createAdminClient();
  const mailboxEmails = [connection.mailbox_email.toLowerCase()];

  const profileRes = await gmail.users.getProfile({ userId: "me" });
  const historyId = profileRes.data.historyId ?? undefined;

  let pageToken: string | undefined =
    connection.sync_page_token ?? undefined;
  let synced = 0;
  let errors = 0;
  let processed = 0;
  let requestCount = 0;
  let lastUpsertError: string | null = null;

  while (processed < GMAIL_FULL_SYNC_BATCH_SIZE) {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(100, GMAIL_FULL_SYNC_BATCH_SIZE - processed),
      pageToken,
      includeSpamTrash: true,
      q: "in:anywhere",
    });

    const messageIds = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken ?? undefined;

    if (messageIds.length === 0) break;

    for (const item of messageIds) {
      if (processed >= GMAIL_FULL_SYNC_BATCH_SIZE) break;

      const msgId = item?.id;
      if (!msgId) continue;

      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msgId,
          format: "metadata",
          metadataHeaders: METADATA_HEADERS,
        });

        const parsed = parseMessage(detail.data, mailboxEmails);
        if (!parsed) continue;

        const { error } = await supabase.from("emails").upsert(
          toEmailInsert(parsed, scope, "google", connection.id),
          { onConflict: emailUpsertConflict(scope) }
        );

        if (error) {
          errors += 1;
          if (!lastUpsertError) {
            lastUpsertError = error.message;
            console.error(
              `Gmail upsert failed for ${connection.mailbox_email}:`,
              error.message
            );
          }
        } else {
          synced += 1;
        }
      } catch (err) {
        errors += 1;
        if (!lastUpsertError) {
          lastUpsertError =
            err instanceof Error ? err.message : "message fetch failed";
        }
      }

      processed += 1;
      requestCount += 1;
      if (requestCount % 10 === 0) await delay(50);
    }

    if (!pageToken) break;
  }

  const hasMore = Boolean(pageToken);
  const totalInDb = await countSyncedForConnection(connection.id);

  await updateConnectionSyncProgress(connection.id, {
    sync_page_token: hasMore ? pageToken! : null,
    sync_cursor: !hasMore && historyId ? historyId : connection.sync_cursor,
    sync_status: hasMore ? "running" : "idle",
    sync_progress_synced: totalInDb,
  });

  if (synced === 0 && errors > 0 && lastUpsertError) {
    console.error(
      `Batch for ${connection.mailbox_email}: 0 synced, ${errors} errors. First error: ${lastUpsertError}`
    );
  }

  return {
    synced,
    errors,
    hasMore,
    total: totalInDb,
  };
}

/** True if this connection still has pages left from a full sync. */
export function connectionNeedsFullSyncBatch(
  connection: MailConnection
): boolean {
  return Boolean(connection.sync_page_token);
}
