/** Read beyond PostgREST's response cap without replacing good data with partial totals. */
export async function readAnalyticsPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  cancelled: () => boolean = () => false,
) {
  const rows: T[] = [];
  for (let offset = 0; !cancelled(); offset += 1000) {
    const result = await fetchPage(offset, offset + 999);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) break;
  }
  return { data: rows, error: null };
}