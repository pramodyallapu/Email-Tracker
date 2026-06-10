import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/mail/addresses";
import type { MailScope } from "@/lib/mail/scope";

export async function getMailboxEmails(scope: MailScope): Promise<string[]> {
  const supabase = createAdminClient();
  const emails = new Set<string>();

  if (scope.mode === "organization") {
    const { data: connections } = await supabase
      .from("mail_connections")
      .select("mailbox_email")
      .eq("organization_id", scope.organizationId);

    for (const conn of connections ?? []) {
      if (conn.mailbox_email) emails.add(normalizeEmail(conn.mailbox_email));
    }
    return Array.from(emails);
  }

  const [{ data: user }, { data: connections }] = await Promise.all([
    supabase.from("users").select("email").eq("id", scope.userId).single(),
    supabase
      .from("mail_connections")
      .select("mailbox_email")
      .eq("user_id", scope.userId),
  ]);

  if (user?.email) emails.add(normalizeEmail(user.email));
  for (const conn of connections ?? []) {
    if (conn.mailbox_email) emails.add(normalizeEmail(conn.mailbox_email));
  }
  return Array.from(emails);
}

/** @deprecated Use getMailboxEmails(scope) */
export async function getUserMailboxEmails(
  userId: string
): Promise<string[]> {
  const { resolveMailScope } = await import("@/lib/mail/scope");
  const scope = await resolveMailScope(userId);
  return getMailboxEmails(scope);
}
