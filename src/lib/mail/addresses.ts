/** Extract and normalize an email address from a header or display string. */
export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();

  const plain = trimmed.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  if (plain?.[1]) return plain[1].trim().toLowerCase();

  return trimmed.toLowerCase();
}

export function formatParticipant(
  name: string | null | undefined,
  address: string
): string {
  if (name?.trim()) return `${name.trim()} <${address}>`;
  return address;
}

export function isOwnMailbox(
  fromAddress: string,
  mailboxEmails: string[]
): boolean {
  const from = normalizeEmail(fromAddress);
  return mailboxEmails.some((m) => normalizeEmail(m) === from);
}
