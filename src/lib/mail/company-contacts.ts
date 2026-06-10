import { isOwnMailbox, normalizeEmail } from "@/lib/mail/addresses";
import type { ThreadEmail } from "@/lib/mail/classify-audience";
import { DomainConflictError, findOverlappingDomains } from "@/lib/mail/domain-conflicts";
import { domainFromAddress } from "@/lib/mail/internal";
import {
  configInsertRow,
  configScopeColumn,
  resolveMailScope,
} from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";

export type CompanyContact = {
  companyName: string;
  email: string;
};

export type CompanyGroup = {
  companyName: string;
  emails: string[];
};

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function normalizeContactEmail(raw: string): string | null {
  const normalized = normalizeEmail(raw);
  if (!EMAIL_RE.test(normalized)) return null;
  return normalized;
}

export async function getCompanyGroups(userId: string): Promise<CompanyGroup[]> {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("company_contacts")
    .select("company_name, email")
    .eq(column, value)
    .order("company_name", { ascending: true });

  const byCompany = new Map<string, string[]>();
  for (const row of data ?? []) {
    const list = byCompany.get(row.company_name) ?? [];
    list.push(row.email);
    byCompany.set(row.company_name, list);
  }

  return Array.from(byCompany.entries())
    .map(([companyName, emails]) => ({
      companyName,
      emails: emails.sort(),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export async function getCompanyContacts(
  userId: string
): Promise<CompanyContact[]> {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("company_contacts")
    .select("company_name, email")
    .eq(column, value)
    .order("company_name", { ascending: true });

  return (data ?? []).map((r) => ({
    companyName: r.company_name.trim(),
    email: normalizeEmail(r.email),
  }));
}

export async function saveCompanyGroups(
  userId: string,
  groups: CompanyGroup[]
): Promise<{ companies: CompanyGroup[]; invalid: string[] }> {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();
  const byEmail = new Map<string, string>();
  const invalid: string[] = [];

  for (const group of groups) {
    const companyName = group.companyName.trim();
    if (!companyName) {
      for (const raw of group.emails) {
        if (raw.trim()) invalid.push(raw.trim());
      }
      continue;
    }

    for (const raw of group.emails) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const email = normalizeContactEmail(trimmed);
      if (email) byEmail.set(email, companyName);
      else invalid.push(trimmed);
    }
  }

  const contacts: CompanyContact[] = Array.from(byEmail.entries())
    .map(([email, companyName]) => ({ email, companyName }))
    .sort((a, b) =>
      a.companyName.localeCompare(b.companyName) || a.email.localeCompare(b.email)
    );

  const contactDomains = contacts
    .map((c) => domainFromAddress(c.email))
    .filter((d): d is string => Boolean(d));

  const { data: internalRows } = await supabase
    .from("internal_domains")
    .select("domain")
    .eq(column, value);
  const internalDomains = (internalRows ?? []).map((r) => r.domain);
  const conflicts = findOverlappingDomains(contactDomains, internalDomains);
  if (conflicts.length > 0) {
    throw new DomainConflictError(conflicts, "internal");
  }

  await supabase.from("company_contacts").delete().eq(column, value);

  if (contacts.length > 0) {
    const { error } = await supabase.from("company_contacts").insert(
      contacts.map((c) =>
        configInsertRow(scope, {
          company_name: c.companyName,
          email: c.email,
        })
      )
    );
    if (error) {
      throw new Error(
        error.message.includes("company_contacts")
          ? "Run sql/company-contacts.sql in Supabase first."
          : error.message
      );
    }
  }

  const companies = await getCompanyGroups(userId);
  return { companies, invalid };
}

export function buildContactIndex(
  contacts: CompanyContact[]
): Map<string, CompanyContact> {
  const index = new Map<string, CompanyContact>();
  for (const contact of contacts) {
    index.set(normalizeEmail(contact.email), contact);
  }
  return index;
}

export function resolveCompanyForAddress(
  address: string,
  contacts: CompanyContact[]
): CompanyContact | null {
  if (!contacts.length) return null;
  const normalized = normalizeEmail(address);
  return contacts.find((c) => normalizeEmail(c.email) === normalized) ?? null;
}

/** Match a configured contact anywhere in the thread (from / to / cc / participants). */
export function resolveCompanyInThread(
  threadEmails: ThreadEmail[],
  participants: string[] | null | undefined,
  mailboxEmails: string[],
  contactIndex: Map<string, CompanyContact>
): CompanyContact | null {
  const lookup = (raw: string): CompanyContact | null => {
    if (!raw?.trim() || isOwnMailbox(raw, mailboxEmails)) return null;
    return contactIndex.get(normalizeEmail(raw)) ?? null;
  };

  for (const email of threadEmails) {
    const fromMatch = lookup(email.from_address);
    if (fromMatch) return fromMatch;

    for (const to of email.to_addresses ?? []) {
      const match = lookup(to);
      if (match) return match;
    }

    for (const cc of email.cc_addresses ?? []) {
      const match = lookup(cc);
      if (match) return match;
    }
  }

  for (const participant of participants ?? []) {
    const match = lookup(participant);
    if (match) return match;
  }

  return null;
}

export async function getCompanyContactDomains(userId: string): Promise<string[]> {
  const contacts = await getCompanyContacts(userId);
  const domains = new Set<string>();
  for (const c of contacts) {
    const domain = domainFromAddress(c.email);
    if (domain) domains.add(domain);
  }
  return Array.from(domains).sort();
}
