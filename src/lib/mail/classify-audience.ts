import { isOwnMailbox } from "@/lib/mail/addresses";
import { classifyByAddress, type AudienceType } from "@/lib/mail/internal";
import { resolveIsSent } from "@/lib/mail/sent";

export type ThreadEmail = {
  provider?: string | null;
  gmail_thread_id: string;
  from_address: string;
  to_addresses?: string[] | null;
  cc_addresses?: string[] | null;
  is_sent: boolean;
  labels?: string[] | null;
  received_at?: string;
};

export function getEmailsForThread(
  thread: { provider?: string | null; gmail_thread_id: string },
  emails: ThreadEmail[],
  byProviderKey: Map<string, ThreadEmail[]>
): ThreadEmail[] {
  const provider = thread.provider ?? "google";
  const key = `${provider}:${thread.gmail_thread_id}`;
  let list = byProviderKey.get(key) ?? [];

  if (list.length === 0) {
    list = emails.filter((e) => e.gmail_thread_id === thread.gmail_thread_id);
  }

  return [...list].sort((a, b) => {
    const at = a.received_at ? new Date(a.received_at).getTime() : 0;
    const bt = b.received_at ? new Date(b.received_at).getTime() : 0;
    return at - bt;
  });
}

export function collectCounterpartyAddresses(
  emails: ThreadEmail[],
  mailboxEmails: string[]
): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];

  const add = (raw: string) => {
    if (!raw.trim() || isOwnMailbox(raw, mailboxEmails)) return;
    const key = raw.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    addresses.push(raw);
  };

  for (const e of emails) {
    const sent = resolveIsSent(e, mailboxEmails);
    if (!sent) {
      add(e.from_address);
      continue;
    }

    for (const to of e.to_addresses ?? []) add(to);
    for (const cc of e.cc_addresses ?? []) add(cc);
  }

  return addresses;
}

export function classifyFromParticipants(
  participants: string[] | null | undefined,
  mailboxEmails: string[],
  internalDomains: string[]
): AudienceType | null {
  for (const p of participants ?? []) {
    if (!p.trim() || isOwnMailbox(p, mailboxEmails)) continue;
    return classifyByAddress(p, internalDomains);
  }
  return null;
}

export function classifyThreadAudience(
  emails: ThreadEmail[],
  participants: string[] | null | undefined,
  mailboxEmails: string[],
  internalDomains: string[]
): AudienceType {
  if (internalDomains.length === 0) return "external";

  const counterparties = collectCounterpartyAddresses(emails, mailboxEmails);
  for (const address of counterparties) {
    const audience = classifyByAddress(address, internalDomains);
    if (audience === "internal") return "internal";
  }
  if (counterparties.length > 0) return "external";

  const fromParticipants = classifyFromParticipants(
    participants,
    mailboxEmails,
    internalDomains
  );
  if (fromParticipants) return fromParticipants;

  return "external";
}
