/** Consistent number formatting for SSR + client (avoids hydration locale mismatch). */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
