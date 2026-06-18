import { describe, expect, it, vi } from 'vitest';
import { getD1SizeMb } from './d1SizeCheck';

function makeD1(sizeBytes: number): D1Database {
  return {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({
        results: [],
        success: true,
        meta: {
          size_after: sizeBytes,
          duration: 0,
          rows_read: 0,
          rows_written: 0,
          last_row_id: 0,
          changed_db: false,
          changes: 0,
        },
      }),
    }),
  } as unknown as D1Database;
}

describe('getD1SizeMb', () => {
  it('converts size_after bytes to MB', async () => {
    const db = makeD1(10 * 1024 * 1024); // 10 MB
    const result = await getD1SizeMb(db);
    expect(result).toBe(10);
  });

  it('returns 0 when size_after is 0', async () => {
    const db = makeD1(0);
    expect(await getD1SizeMb(db)).toBe(0);
  });

  it('handles sub-MB sizes accurately', async () => {
    const db = makeD1(512 * 1024); // 0.5 MB
    expect(await getD1SizeMb(db)).toBe(0.5);
  });

  it('uses SELECT 1 as the query', async () => {
    const db = makeD1(0);
    await getD1SizeMb(db);
    expect(vi.mocked(db.prepare)).toHaveBeenCalledWith('SELECT 1');
  });

  it('propagates errors from db.prepare().run()', async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('D1_ERROR: SQLITE_AUTH')),
      }),
    } as unknown as D1Database;
    await expect(getD1SizeMb(db)).rejects.toThrow('D1_ERROR: SQLITE_AUTH');
  });
});
