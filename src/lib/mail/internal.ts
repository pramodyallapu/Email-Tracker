import { normalizeEmail } from "@/lib/mail/addresses";

/** Normalize user input: "@Example.COM" → "example.com" */
export function normalizeDomainInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(withoutAt)) {
    return null;
  }
  return withoutAt;
}

export function domainFromAddress(address: string): string | null {
  const email = normalizeEmail(address);
  const domain = email.split("@")[1];
  return domain || null;
}

export function isInternalDomain(
  domain: string | null,
  internalDomains: string[]
): boolean {
  if (!domain || internalDomains.length === 0) return false;
  const d = domain.toLowerCase();
  return internalDomains.some((id) => {
    const normalized = id.toLowerCase().replace(/^@/, "");
    return d === normalized || d.endsWith(`.${normalized}`);
  });
}

export type AudienceType = "internal" | "external";

export function classifyByAddress(
  address: string,
  internalDomains: string[]
): AudienceType {
  const domain = domainFromAddress(address);
  return isInternalDomain(domain, internalDomains) ? "internal" : "external";
}
