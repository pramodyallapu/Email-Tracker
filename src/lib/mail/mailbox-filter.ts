import { getOrgMailConnections } from "@/lib/mail/connections";
import { fetchEmailsPaginated } from "@/lib/metrics/emails-query";
import type { MailScope } from "@/lib/mail/scope";
import type { MailConnection } from "@/types/mail";

export type MailboxOption = {
  id: string;
  email: string;
  provider: string;
};

export async function getMailboxOptions(
  scope: MailScope
): Promise<MailboxOption[]> {
  if (scope.mode !== "organization") return [];

  const connections = await getOrgMailConnections(scope.organizationId);
  return connections
    .filter((c) => c.provider === "google" || c.provider === "zoho")
    .map((c) => ({
      id: c.id,
      email: c.mailbox_email,
      provider: c.provider,
    }));
}

export function resolveMailboxConnection(
  connections: MailConnection[],
  mailboxParam?: string
): MailConnection | null {
  if (!mailboxParam) return null;
  const decoded = decodeURIComponent(mailboxParam).toLowerCase();
  return (
    connections.find(
      (c) =>
        c.id === mailboxParam ||
        c.mailbox_email.toLowerCase() === decoded
    ) ?? null
  );
}

/** Thread keys (provider:threadId) that have email from this mailbox connection. */
export async function getThreadKeysForConnection(
  scope: MailScope,
  connectionId: string
): Promise<Set<string>> {
  const emails = await fetchEmailsPaginated(scope, {
    select: "provider, gmail_thread_id",
    extraFilters: (q) => q.eq("mail_connection_id", connectionId),
  });

  const keys = new Set<string>();
  for (const row of emails) {
    const e = row as { provider: string; gmail_thread_id: string };
    keys.add(`${e.provider}:${e.gmail_thread_id}`);
  }
  return keys;
}

export function threadKey(provider: string, gmailThreadId: string): string {
  return `${provider}:${gmailThreadId}`;
}

/** Map thread row id → mailbox email (from synced emails). */
export async function buildThreadMailboxMap(
  scope: MailScope,
  connections: MailConnection[],
  threadRowIds: Array<{
    id: string;
    provider: string;
    gmail_thread_id: string;
  }>
): Promise<Record<string, string>> {
  if (!threadRowIds.length || !connections.length) return {};

  const connById = new Map(connections.map((c) => [c.id, c.mailbox_email]));
  const emails = await fetchEmailsPaginated(scope, {
    select: "provider, gmail_thread_id, mail_connection_id",
  });

  const byThread = new Map<string, string>();
  for (const raw of emails) {
    const e = raw as {
      provider: string;
      gmail_thread_id: string;
      mail_connection_id: string | null;
    };
    if (!e.mail_connection_id) continue;
    const email = connById.get(e.mail_connection_id);
    if (!email) continue;
    byThread.set(threadKey(e.provider, e.gmail_thread_id), email);
  }

  const map: Record<string, string> = {};
  for (const row of threadRowIds) {
    const label = byThread.get(threadKey(row.provider, row.gmail_thread_id));
    if (label) map[row.id] = label;
  }
  return map;
}
