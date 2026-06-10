import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import { parseMessage } from "@/lib/gmail/parser";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import { toEmailInsert } from "@/lib/mail/parser";
import {
  emailUpsertConflict,
  scopeEmailsFilter,
  type MailScope,
} from "@/lib/mail/scope";
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

export async function fullSync(
  scope: MailScope,
  connection: MailConnection
): Promise<{ synced: number; errors: number; total: number }> {
  await refreshConnectionToken(connection);
  const gmail = await getGmailClient(connection);
  const supabase = createAdminClient();
  const mailboxEmails = await getMailboxEmails(scope);

  let synced = 0;
  let errors = 0;
  let pageToken: string | undefined;
  let requestCount = 0;

  const profileRes = await gmail.users.getProfile({ userId: "me" });
  const historyId = profileRes.data.historyId ?? undefined;

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      pageToken,
      includeSpamTrash: true,
      q: "in:anywhere",
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

      requestCount += 1;
      if (requestCount % 10 === 0) await delay(100);
    }
  } while (pageToken);

  if (historyId && connection.id) {
    await supabase
      .from("mail_connections")
      .update({ sync_cursor: historyId })
      .eq("id", connection.id);
  }

  let countQuery = supabase
    .from("emails")
    .select("*", { count: "exact", head: true })
    .eq("provider", "google");
  countQuery = scopeEmailsFilter(countQuery, scope);

  const { count } = await countQuery;

  return { synced, errors, total: count ?? synced };
}
