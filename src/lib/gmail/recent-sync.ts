import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import { parseMessage } from "@/lib/gmail/parser";
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sync recent inbox messages only — not full mailbox history. */
export async function syncRecentInbox(
  scope: MailScope,
  connection: MailConnection,
  options?: { maxMessages?: number; newerThanDays?: number }
): Promise<{ synced: number; errors: number }> {
  const maxMessages = options?.maxMessages ?? 100;
  const newerThanDays = options?.newerThanDays ?? 30;

  await refreshConnectionToken(connection);
  const gmail = await getGmailClient(connection);
  const supabase = createAdminClient();
  const mailboxEmails = [connection.mailbox_email.toLowerCase()];

  let synced = 0;
  let errors = 0;
  let pageToken: string | undefined;
  let fetched = 0;

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(50, maxMessages - fetched),
      pageToken,
      q: `in:inbox newer_than:${newerThanDays}d`,
    });

    const messageIds = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken ?? undefined;

    for (const item of messageIds) {
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

        if (error) errors += 1;
        else synced += 1;
      } catch {
        errors += 1;
      }

      fetched += 1;
      if (fetched % 10 === 0) await delay(50);
      if (fetched >= maxMessages) break;
    }
  } while (pageToken && fetched < maxMessages);

  return { synced, errors };
}
