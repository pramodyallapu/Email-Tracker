import { isOwnMailbox } from "@/lib/mail/addresses";
import type { gmail_v1 } from "googleapis";
import type { ParsedEmail } from "@/types/email";

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined | null,
  name: string
): string | undefined {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseFrom(raw: string): { address: string; name?: string } {
  const match = raw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  return {
    name: match?.[1]?.trim(),
    address: (match?.[2] ?? raw).trim().toLowerCase(),
  };
}

export function parseMessage(
  rawMsg: gmail_v1.Schema$Message,
  mailboxEmails: string[] = []
): ParsedEmail | null {
  if (!rawMsg.id || !rawMsg.threadId) return null;

  const headers = rawMsg.payload?.headers ?? [];
  const fromRaw = getHeader(headers, "From") ?? "";
  const subject = getHeader(headers, "Subject") ?? "(no subject)";
  const references = getHeader(headers, "References");
  const inReplyTo = getHeader(headers, "In-Reply-To");
  const labelIds = rawMsg.labelIds ?? [];
  const from = parseFrom(fromRaw);

  const isSent =
    labelIds.includes("SENT") ||
    (mailboxEmails.length > 0 && isOwnMailbox(from.address, mailboxEmails));
  const isReply =
    /^re:/i.test(subject) ||
    Boolean(references || inReplyTo) ||
    (isSent && Boolean(inReplyTo || references));

  return {
    id: rawMsg.id,
    gmailMessageId: rawMsg.id,
    threadId: rawMsg.threadId,
    from,
    to: parseAddressList(getHeader(headers, "To")),
    cc: parseAddressList(getHeader(headers, "Cc")),
    subject,
    receivedAt: new Date(Number(rawMsg.internalDate ?? Date.now())).toISOString(),
    isSent,
    isReply,
    labels: labelIds,
  };
}
