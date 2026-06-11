import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatParticipant,
  isOwnMailbox,
  normalizeEmail,
} from "@/lib/mail/addresses";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import { resolveIsSent } from "@/lib/mail/sent";
import { fetchEmailsPaginated } from "@/lib/metrics/emails-query";
import { computeThreadReplyStats } from "@/lib/metrics/reply-time";
import {
  scopeEmailsFilter,
  threadUpsertConflict,
  type MailScope,
} from "@/lib/mail/scope";

export type ThreadEmailRow = {
  provider: string;
  gmail_thread_id: string;
  gmail_message_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  is_sent: boolean;
  received_at: string;
  labels: string[] | null;
};

const EMAIL_SELECT =
  "provider, gmail_thread_id, gmail_message_id, from_address, from_name, subject, is_sent, received_at, labels";

export async function upsertThreadFromEmails(
  scope: MailScope,
  msgs: ThreadEmailRow[],
  mailboxEmails: string[]
): Promise<void> {
  if (!msgs.length) return;

  const supabase = createAdminClient();
  const provider = msgs[0].provider;
  const threadId = msgs[0].gmail_thread_id;
  const inbound = msgs.filter((m) => !m.is_sent);
  const outbound = msgs.filter((m) => m.is_sent);
  const replyStats = computeThreadReplyStats(inbound, outbound);

  const counterparty = inbound[0] ?? null;
  const fallback = msgs.find(
    (m) => !isOwnMailbox(m.from_address, mailboxEmails)
  );
  const displaySource = counterparty ?? fallback ?? msgs[0];
  const participants = [
    formatParticipant(displaySource.from_name, displaySource.from_address),
  ];
  const latest = msgs[msgs.length - 1];

  const row =
    scope.mode === "organization"
      ? {
          user_id: scope.userId,
          organization_id: scope.organizationId,
          provider,
          gmail_thread_id: threadId,
          subject: latest.subject ?? "(no subject)",
          participants,
          message_count: msgs.length,
          inbound_count: inbound.length,
          outbound_count: outbound.length,
          first_received_at: replyStats.anchorReceivedAt,
          first_replied_at: replyStats.replyAt,
          last_message_at: latest.received_at,
          reply_time_seconds: replyStats.replyTimeSeconds,
          is_replied: replyStats.isReplied,
          is_archived: false,
          updated_at: new Date().toISOString(),
        }
      : {
          user_id: scope.userId,
          organization_id: null,
          provider,
          gmail_thread_id: threadId,
          subject: latest.subject ?? "(no subject)",
          participants,
          message_count: msgs.length,
          inbound_count: inbound.length,
          outbound_count: outbound.length,
          first_received_at: replyStats.anchorReceivedAt,
          first_replied_at: replyStats.replyAt,
          last_message_at: latest.received_at,
          reply_time_seconds: replyStats.replyTimeSeconds,
          is_replied: replyStats.isReplied,
          is_archived: false,
          updated_at: new Date().toISOString(),
        };

  await supabase.from("threads").upsert(
    row as import("@/types/database").Database["public"]["Tables"]["threads"]["Insert"],
    { onConflict: threadUpsertConflict(scope) }
  );
}

export async function rebuildThreadStats(scope: MailScope): Promise<void> {
  const supabase = createAdminClient();
  const mailboxEmails = await getMailboxEmails(scope);

  const emailRows = await fetchEmailsPaginated(scope, {
    select: EMAIL_SELECT,
    orderAsc: true,
  });

  const emails = emailRows as ThreadEmailRow[];
  if (!emails.length) return;

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

  const groups = new Map<string, ThreadEmailRow[]>();
  for (const email of emails) {
    const key = `${email.provider}:${email.gmail_thread_id}`;
    const list = groups.get(key) ?? [];
    list.push(email);
    groups.set(key, list);
  }

  for (const msgs of Array.from(groups.values())) {
    await upsertThreadFromEmails(scope, msgs, mailboxEmails);
  }
}

/** Rebuild thread reply stats for one mailbox only (after connect / bootstrap). */
export async function rebuildThreadStatsForConnection(
  scope: MailScope,
  connectionId: string
): Promise<void> {
  const supabase = createAdminClient();
  const mailboxEmails = await getMailboxEmails(scope);

  const { data: rows, error } = await supabase
    .from("emails")
    .select(EMAIL_SELECT)
    .eq("mail_connection_id", connectionId)
    .order("received_at", { ascending: true });

  if (error) {
    console.error("rebuildThreadStatsForConnection:", error.message);
    return;
  }

  const emails = (rows ?? []) as ThreadEmailRow[];
  if (!emails.length) return;

  for (const email of emails) {
    const shouldBeSent = resolveIsSent(email, mailboxEmails);
    if (email.is_sent !== shouldBeSent) {
      await supabase
        .from("emails")
        .update({ is_sent: shouldBeSent })
        .eq("mail_connection_id", connectionId)
        .eq("gmail_message_id", email.gmail_message_id);
      email.is_sent = shouldBeSent;
    }
  }

  const groups = new Map<string, ThreadEmailRow[]>();
  for (const email of emails) {
    const key = `${email.provider}:${email.gmail_thread_id}`;
    const list = groups.get(key) ?? [];
    list.push(email);
    groups.set(key, list);
  }

  for (const msgs of Array.from(groups.values())) {
    await upsertThreadFromEmails(scope, msgs, mailboxEmails);
  }
}

/** Pick the external correspondent for inbox display (not the logged-in user). */
export function counterpartyLabel(
  participants: string[],
  userEmails: string[]
): string {
  const own = new Set(userEmails.map(normalizeEmail));

  for (const p of participants) {
    const email = normalizeEmail(p);
    if (!own.has(email)) {
      return p.replace(/<.*>/, "").trim() || email;
    }
  }

  const first = participants[0];
  if (!first) return "Unknown";
  return first.replace(/<.*>/, "").trim() || normalizeEmail(first);
}
