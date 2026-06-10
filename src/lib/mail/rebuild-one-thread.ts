import { getMailboxEmails } from "@/lib/mail/mailboxes";
import { resolveIsSent } from "@/lib/mail/sent";
import type { ThreadEmailRow } from "@/lib/mail/rebuild-threads";
import { upsertThreadFromEmails } from "@/lib/mail/rebuild-threads";
import { fetchThreadEmails } from "@/lib/metrics/emails-query";
import { resolveMailScope, scopeEmailsFilter } from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_SELECT =
  "provider, gmail_thread_id, gmail_message_id, from_address, from_name, subject, is_sent, received_at, labels";

export async function rebuildOneThread(
  userId: string,
  provider: string,
  gmailThreadId: string
): Promise<{ messageCount: number }> {
  const scope = await resolveMailScope(userId);
  const supabase = createAdminClient();
  const mailboxEmails = await getMailboxEmails(scope);

  const emailRows = await fetchThreadEmails(
    scope,
    provider,
    gmailThreadId,
    EMAIL_SELECT
  );

  const emails = emailRows as ThreadEmailRow[];

  for (const email of emails) {
    const shouldBeSent = resolveIsSent(email, mailboxEmails);
    if (email.is_sent !== shouldBeSent) {
      let updateQuery = supabase
        .from("emails")
        .update({ is_sent: shouldBeSent })
        .eq("provider", email.provider)
        .eq("gmail_message_id", email.gmail_message_id);
      updateQuery = scopeEmailsFilter(updateQuery, scope);
      await updateQuery;
      email.is_sent = shouldBeSent;
    }
  }

  if (emails.length) {
    await upsertThreadFromEmails(scope, emails, mailboxEmails);
  }

  return { messageCount: emails.length };
}
