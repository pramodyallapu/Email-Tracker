import { getOrgMembership } from "@/lib/org/context";

/** Resolved data scope for mail queries and sync. */
export type MailScope =
  | { mode: "organization"; organizationId: string; userId: string }
  | { mode: "personal"; userId: string };

export async function resolveMailScope(userId: string): Promise<MailScope> {
  const membership = await getOrgMembership(userId);
  if (membership) {
    return {
      mode: "organization",
      organizationId: membership.organizationId,
      userId,
    };
  }
  return { mode: "personal", userId };
}

export function scopeEmailsFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  scope: MailScope
): T {
  if (scope.mode === "organization") {
    return query.eq("organization_id", scope.organizationId);
  }
  return query.eq("user_id", scope.userId);
}

export function scopeThreadsFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  scope: MailScope
): T {
  if (scope.mode === "organization") {
    return query.eq("organization_id", scope.organizationId);
  }
  return query.eq("user_id", scope.userId);
}

export function scopeMetricsFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  scope: MailScope
): T {
  if (scope.mode === "organization") {
    return query.eq("organization_id", scope.organizationId);
  }
  return query.eq("user_id", scope.userId);
}

export function emailUpsertConflict(scope: MailScope): string {
  return scope.mode === "organization"
    ? "organization_id,provider,gmail_message_id"
    : "user_id,provider,gmail_message_id";
}

export function threadUpsertConflict(scope: MailScope): string {
  return scope.mode === "organization"
    ? "organization_id,provider,gmail_thread_id"
    : "user_id,provider,gmail_thread_id";
}

export function configScopeColumn(scope: MailScope): {
  column: "organization_id" | "user_id";
  value: string;
} {
  if (scope.mode === "organization") {
    return { column: "organization_id", value: scope.organizationId };
  }
  return { column: "user_id", value: scope.userId };
}

export function configInsertRow<T extends Record<string, unknown>>(
  scope: MailScope,
  row: T
): T & { user_id: string; organization_id: string | null } {
  if (scope.mode === "organization") {
    return {
      ...row,
      organization_id: scope.organizationId,
      user_id: scope.userId,
    };
  }
  return { ...row, user_id: scope.userId, organization_id: null };
}
