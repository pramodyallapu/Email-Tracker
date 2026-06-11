import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import {
  bulkUpsertParsedEmails,
  fetchGmailMetadataBatch,
} from "@/lib/gmail/metadata-sync";
import type { MailScope } from "@/lib/mail/scope";
import type { MailConnection } from "@/types/mail";

/** Sync recent inbox metadata only — no body or attachments. */
export async function syncRecentInbox(
  scope: MailScope,
  connection: MailConnection,
  options?: { maxMessages?: number; newerThanDays?: number }
): Promise<{ synced: number; errors: number }> {
  const maxMessages = options?.maxMessages ?? 100;
  const newerThanDays = options?.newerThanDays ?? 30;

  await refreshConnectionToken(connection);
  const gmail = await getGmailClient(connection);
  const mailboxEmails = [connection.mailbox_email.toLowerCase()];

  let synced = 0;
  let errors = 0;
  let pageToken: string | undefined;
  const toFetch: string[] = [];

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(50, maxMessages - toFetch.length),
      pageToken,
      q: `in:inbox newer_than:${newerThanDays}d`,
    });

    const messageIds = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken ?? undefined;

    for (const item of messageIds) {
      const msgId = item?.id;
      if (!msgId) continue;
      toFetch.push(msgId);
      if (toFetch.length >= maxMessages) break;
    }
  } while (pageToken && toFetch.length < maxMessages);

  if (toFetch.length === 0) {
    return { synced: 0, errors: 0 };
  }

  const { parsed, errors: fetchErrors } = await fetchGmailMetadataBatch(
    gmail,
    toFetch,
    mailboxEmails
  );
  errors += fetchErrors;

  const upsert = await bulkUpsertParsedEmails(scope, connection.id, parsed);
  synced = upsert.synced;
  errors += upsert.errors;

  return { synced, errors };
}
