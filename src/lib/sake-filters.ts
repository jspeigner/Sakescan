import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;
const PARALLEL = 8;

/**
 * PostgREST defaults to max 1000 rows, so a single `.select("type")` only sees
 * the first page (live: Awamori/Daiginjo) and hides Junmai/Ginjo/etc.
 * Page the column and unique client-side. Callers should cache aggressively.
 */
export async function fetchDistinctSakeColumn(
  column: "type" | "region"
): Promise<string[]> {
  const { count, error: countError } = await supabase
    .from("sake")
    .select(column, { count: "exact", head: true })
    .not(column, "is", null);
  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return [];

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const values = new Set<string>();

  for (let start = 0; start < pageCount; start += PARALLEL) {
    const batch = Array.from(
      { length: Math.min(PARALLEL, pageCount - start) },
      (_, i) => {
        const from = (start + i) * PAGE_SIZE;
        return supabase
          .from("sake")
          .select(column)
          .not(column, "is", null)
          .range(from, from + PAGE_SIZE - 1);
      }
    );
    const results = await Promise.all(batch);
    for (const res of results) {
      if (res.error) throw res.error;
      for (const row of res.data ?? []) {
        const value = (row as Record<string, unknown>)[column];
        if (typeof value === "string" && value.trim()) {
          values.add(value);
        }
      }
    }
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}
