import { isOwnMailbox } from "@/lib/mail/addresses";

export function resolveIsSent(
  email: {
    is_sent: boolean;
    from_address: string;
    labels?: string[] | null;
  },
  mailboxEmails: string[]
): boolean {
  if (email.is_sent) return true;
  if (email.labels?.includes("SENT")) return true;
  return isOwnMailbox(email.from_address, mailboxEmails);
}
