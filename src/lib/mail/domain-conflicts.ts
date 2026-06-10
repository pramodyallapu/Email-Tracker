/** True when two domains are the same or one is a subdomain of the other. */
export function domainsOverlap(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

export function findOverlappingDomains(
  candidates: string[],
  blocked: string[]
): string[] {
  if (blocked.length === 0) return [];

  const conflicts: string[] = [];
  for (const candidate of candidates) {
    if (blocked.some((b) => domainsOverlap(candidate, b))) {
      conflicts.push(candidate);
    }
  }

  return Array.from(new Set(conflicts));
}

export class DomainConflictError extends Error {
  readonly conflicts: string[];
  readonly otherList: "internal" | "company";

  constructor(conflicts: string[], otherList: "internal" | "company") {
    const label = otherList === "internal" ? "Internal domains" : "Companies";
    super(
      `${conflicts.map((d) => `@${d}`).join(", ")} already listed under ${label}. Remove it there first, or use only one list per domain.`
    );
    this.name = "DomainConflictError";
    this.conflicts = conflicts;
    this.otherList = otherList;
  }
}
