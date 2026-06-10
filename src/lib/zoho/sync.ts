import { createAdminClient } from "@/lib/supabase/admin";
import { toEmailInsert } from "@/lib/mail/parser";
import type { MailConnection } from "@/types/mail";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import {
  emailUpsertConflict,
  scopeEmailsFilter,
  type MailScope,
} from "@/lib/mail/scope";
import {
  getZohoAccountId,
  getZohoFolders,
  zohoApiGet,
} from "@/lib/zoho/client";
import { parseZohoMessage, type ZohoMessage } from "@/lib/zoho/parser";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function syncZohoFolder(
  scope: MailScope,
  connection: MailConnection,
  accountId: string,
  folderId: string,
  folderName: string,
  folderType: string | undefined,
  mailboxEmails: string[]
): Promise<{ synced: number; errors: number }> {
  const supabase = createAdminClient();
  let synced = 0;
  let errors = 0;
  let start = 1;
  const limit = 200;

  while (true) {
    const params = new URLSearchParams({
      folderId,
      start: String(start),
      limit: String(limit),
      status: "all",
      includesent: "true",
      includeto: "true",
      includearchive: "true",
      threadedMails: "false",
      sortBy: "date",
      sortorder: "false",
    });

    const data = await zohoApiGet<{ data?: ZohoMessage[] }>(
      connection,
      `/api/accounts/${accountId}/messages/view?${params}`
    );

    const messages = data.data ?? [];
    if (messages.length === 0) break;

    for (const msg of messages) {
      try {
        const inSentFolder =
          folderType === "Sent" || folderName === "Sent";
        const parsed = parseZohoMessage(msg, mailboxEmails, { inSentFolder });
        if (!parsed) continue;

        const { error } = await supabase.from("emails").upsert(
          toEmailInsert(parsed, scope, "zoho", connection.id),
          { onConflict: emailUpsertConflict(scope) }
        );

        if (error) errors += 1;
        else synced += 1;
      } catch {
        errors += 1;
      }
    }

    if (messages.length < limit) break;
    start += limit;
    await delay(150);
  }

  return { synced, errors };
}

export async function fullZohoSync(
  scope: MailScope,
  connection: MailConnection
): Promise<{ synced: number; errors: number; total: number }> {
  const supabase = createAdminClient();
  const accountId = await getZohoAccountId(connection);
  const folders = await getZohoFolders(connection);
  const mailboxEmails = await getMailboxEmails(scope);

  let synced = 0;
  let errors = 0;

  if (folders.length === 0) {
    console.warn("Zoho sync: no folders found for", connection.mailbox_email);
  }

  for (const folder of folders) {
    try {
      const result = await syncZohoFolder(
        scope,
        connection,
        accountId,
        folder.folderId,
        folder.folderName,
        folder.folderType,
        mailboxEmails
      );
      synced += result.synced;
      errors += result.errors;
      console.log(
        `Zoho sync [${folder.folderName}]: synced=${result.synced}, errors=${result.errors}`
      );
    } catch (err) {
      console.error(`Zoho sync failed for folder ${folder.folderName}:`, err);
      errors += 1;
    }
    await delay(100);
  }

  await supabase
    .from("mail_connections")
    .update({
      sync_cursor: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  let countQuery = supabase
    .from("emails")
    .select("*", { count: "exact", head: true })
    .eq("provider", "zoho");
  countQuery = scopeEmailsFilter(countQuery, scope);

  const { count } = await countQuery;

  return { synced, errors, total: count ?? synced };
}
