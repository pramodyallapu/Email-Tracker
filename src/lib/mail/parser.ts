import type { ParsedEmail } from "@/types/email";
import type { Database } from "@/types/database";
import type { MailProvider } from "@/types/mail";
import type { MailScope } from "@/lib/mail/scope";

type EmailInsert = Database["public"]["Tables"]["emails"]["Insert"];

export function toEmailInsert(
  parsed: ParsedEmail,
  scope: MailScope,
  provider: MailProvider,
  mailConnectionId?: string
): EmailInsert {
  const base: EmailInsert = {
    provider,
    gmail_message_id: parsed.gmailMessageId,
    gmail_thread_id: parsed.threadId,
    from_address: parsed.from.address,
    from_name: parsed.from.name ?? null,
    to_addresses: parsed.to,
    cc_addresses: parsed.cc,
    subject: parsed.subject,
    is_sent: parsed.isSent,
    is_reply: parsed.isReply,
    labels: parsed.labels,
    received_at: parsed.receivedAt,
    mail_connection_id: mailConnectionId ?? null,
    user_id: scope.userId,
    organization_id:
      scope.mode === "organization" ? scope.organizationId : null,
  };

  return base;
}
