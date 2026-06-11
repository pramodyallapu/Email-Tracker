import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import {
  bulkUpsertParsedEmails,
  GMAIL_METADATA_HEADERS,
} from "@/lib/gmail/metadata-sync";
import { parseMessage } from "@/lib/gmail/parser";
import { getOrgMailConnections, getMailConnections } from "@/lib/mail/connections";
import { resolveMailScope, type MailScope } from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection } from "@/types/mail";

async function resolveConnection(
  scope: MailScope,
  provider: "google" | "zoho",
  gmailThreadId?: string
): Promise<MailConnection | null> {
  const connections =
    scope.mode === "organization"
      ? await getOrgMailConnections(scope.organizationId)
      : await getMailConnections(scope.userId);

  if (gmailThreadId) {
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("emails")
      .select("mail_connection_id")
      .eq("provider", provider)
      .eq("gmail_thread_id", gmailThreadId)
      .not("mail_connection_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (row?.mail_connection_id) {
      const match = connections.find((c) => c.id === row.mail_connection_id);
      if (match) return match;
    }
  }

  return connections.find((c) => c.provider === provider) ?? null;
}

/** Pull every message in a Gmail thread (fills gaps from list-based sync). */
export async function syncGmailThread(
  userId: string,
  gmailThreadId: string,
  connection?: MailConnection
): Promise<{ synced: number; total: number }> {
  const scope = await resolveMailScope(userId);
  const conn =
    connection ?? (await resolveConnection(scope, "google", gmailThreadId));
  if (!conn?.access_token && !conn?.refresh_token) {
    return { synced: 0, total: 0 };
  }

  await refreshConnectionToken(conn);
  const gmail = await getGmailClient(conn);
  const mailboxEmails = [conn.mailbox_email.toLowerCase()];

  const threadRes = await gmail.users.threads.get({
    userId: "me",
    id: gmailThreadId,
    format: "metadata",
    metadataHeaders: GMAIL_METADATA_HEADERS,
  });

  const messages = threadRes.data.messages ?? [];
  const parsed = messages
    .map((msg) => parseMessage(msg, mailboxEmails))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const { synced } = await bulkUpsertParsedEmails(scope, conn.id, parsed);

  return { synced, total: messages.length };
}
