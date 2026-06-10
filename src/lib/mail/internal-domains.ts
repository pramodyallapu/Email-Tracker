import { DomainConflictError, findOverlappingDomains } from "@/lib/mail/domain-conflicts";
import { getCompanyContactDomains } from "@/lib/mail/company-contacts";
import { normalizeDomainInput } from "@/lib/mail/internal";
import {
  configInsertRow,
  configScopeColumn,
  resolveMailScope,
} from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getInternalDomains(userId: string): Promise<string[]> {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("internal_domains")
    .select("domain")
    .eq(column, value)
    .order("domain", { ascending: true });

  return (data ?? []).map((r) => r.domain);
}

export async function saveInternalDomains(
  userId: string,
  rawDomains: string[]
): Promise<{ domains: string[]; invalid: string[] }> {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();
  const valid = new Set<string>();
  const invalid: string[] = [];

  for (const raw of rawDomains) {
    const normalized = normalizeDomainInput(raw);
    if (normalized) valid.add(normalized);
    else if (raw.trim()) invalid.push(raw.trim());
  }

  const domains = Array.from(valid).sort();

  const companyDomains = await getCompanyContactDomains(userId);
  const conflicts = findOverlappingDomains(domains, companyDomains);
  if (conflicts.length > 0) {
    throw new DomainConflictError(conflicts, "company");
  }

  await supabase.from("internal_domains").delete().eq(column, value);

  if (domains.length > 0) {
    const { error } = await supabase.from("internal_domains").insert(
      domains.map((domain) =>
        configInsertRow(scope, { domain })
      )
    );
    if (error) {
      throw new Error(
        error.message.includes("internal_domains")
          ? "Run sql/internal-domains.sql in Supabase first."
          : error.message
      );
    }
  }

  return { domains, invalid };
}
