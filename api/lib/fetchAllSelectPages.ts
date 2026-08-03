/**
 * PostgREST (and Supabase) silently cap select responses — this project’s
 * effective max-rows is ~1000 (see Explore filters / prerender paging).
 * Requesting a larger `.range()` still returns at most that many rows, so
 * loops that stop when `data.length < requestedPageSize` truncate early and
 * skip the rest of the table.
 */
export const POSTGREST_PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Exhaustively page a PostgREST select using ranges of {@link POSTGREST_PAGE_SIZE}.
 */
export async function fetchAllSelectPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += POSTGREST_PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, offset + POSTGREST_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < POSTGREST_PAGE_SIZE) break;
  }
  return rows;
}
