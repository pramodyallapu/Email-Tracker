import { getZohoDc, zohoMailHost } from "@/lib/zoho/config";
import type { MailProvider } from "@/types/mail";

export function buildMailMessageUrl(options: {
  provider: MailProvider;
  messageId: string;
  threadId?: string;
  zohoDc?: string | null;
}): string {
  if (options.provider === "zoho") {
    const dc = options.zohoDc ?? getZohoDc();
    return `${zohoMailHost(dc)}/zm/#mail/folder/inbox/p/${encodeURIComponent(options.messageId)}`;
  }

  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(options.messageId)}`;
}

export function mailProviderLabel(provider: MailProvider): string {
  return provider === "zoho" ? "Zoho Mail" : "Gmail";
}
