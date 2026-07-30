/** Strip PostgREST filter metacharacters so user search cannot rewrite `.or()` clauses. */
export function sanitizePostgrestSearch(raw: string): string {
  return raw
    .replace(/[%_,.()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
