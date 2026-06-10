import { isOwnMailbox, normalizeEmail } from "@/lib/mail/addresses";
import type { ParsedEmail } from "@/types/email";

export interface ZohoMessage {
  messageId?: string;
  threadId?: string;
  subject?: string;
  fromAddress?: string;
  sender?: string;
  toAddress?: string;
  receivedTime?: number | string;
  sentDateInGMT?: number | string;
  status?: string;
  folderId?: string;
}

export function parseZohoMessage(
  msg: ZohoMessage,
  mailboxEmails: string[] = [],
  options?: { inSentFolder?: boolean }
): ParsedEmail | null {
  const messageId = msg.messageId?.toString();
  const threadId = msg.threadId?.toString() ?? messageId;
  if (!messageId || !threadId) return null;

  const fromRaw = msg.fromAddress ?? msg.sender ?? "";
  const fromAddress = normalizeEmail(fromRaw);
  const fromName =
    fromRaw.match(/^(?:"?([^"]*)"?\s)?</)?.[1]?.trim() ??
    (fromRaw.includes("@") ? undefined : fromRaw.trim() || undefined);

  const subject = msg.subject ?? "(no subject)";
  const rawTs = Number(msg.receivedTime ?? msg.sentDateInGMT ?? Date.now());
  const ts = rawTs > 0 && rawTs < 1e12 ? rawTs * 1000 : rawTs;

  const isSent =
    options?.inSentFolder === true ||
    (mailboxEmails.length > 0 && isOwnMailbox(fromAddress, mailboxEmails));
  const isReply = /^re:/i.test(subject);

  const to = msg.toAddress
    ? msg.toAddress.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    id: messageId,
    gmailMessageId: messageId,
    threadId,
    from: { address: fromAddress, name: fromName },
    to,
    cc: [],
    subject,
    receivedAt: new Date(ts).toISOString(),
    isSent,
    isReply,
    labels: msg.status ? [msg.status] : [],
  };
}
