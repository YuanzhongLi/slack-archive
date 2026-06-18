// D1Result.meta.size_after is the official way to get DB size in D1.
// PRAGMA page_count / dbstat are not available in D1 (SQLITE_AUTH).
// See: https://developers.cloudflare.com/d1/worker-api/return-object/
export async function getD1SizeMb(db: D1Database): Promise<number> {
  const result = await db.prepare('SELECT 1').run();
  return result.meta.size_after / (1024 * 1024);
}
