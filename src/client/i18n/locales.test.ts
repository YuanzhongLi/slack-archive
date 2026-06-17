import { describe, expect, it } from 'vitest';
import en from './locales/en';
import ja from './locales/ja';

type NestedRecord = { [key: string]: string | NestedRecord };

function collectKeys(obj: NestedRecord, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' ? collectKeys(v, full) : [full];
  });
}

function resolveKey(obj: NestedRecord, dotPath: string): string | NestedRecord | undefined {
  return dotPath.split('.').reduce<string | NestedRecord | undefined>((node, part) => {
    if (typeof node === 'object' && node !== null) return node[part];
    return undefined;
  }, obj);
}

describe('locale key consistency', () => {
  const jaKeys = collectKeys(ja as unknown as NestedRecord).sort();
  const enKeys = collectKeys(en as unknown as NestedRecord).sort();

  it('ja and en have the same set of keys', () => {
    expect(jaKeys).toEqual(enKeys);
  });

  it('no key has an empty string value in ja', () => {
    const empty = jaKeys.filter((k) => resolveKey(ja as unknown as NestedRecord, k) === '');
    expect(empty).toEqual([]);
  });

  it('no key has an empty string value in en', () => {
    const empty = enKeys.filter((k) => resolveKey(en as unknown as NestedRecord, k) === '');
    expect(empty).toEqual([]);
  });

  it('interpolation variables match between ja and en', () => {
    const extractVars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

    for (const key of jaKeys) {
      const jaVal = resolveKey(ja as unknown as NestedRecord, key);
      const enVal = resolveKey(en as unknown as NestedRecord, key);
      if (typeof jaVal !== 'string' || typeof enVal !== 'string') continue;
      expect(extractVars(jaVal), `key "${key}" interpolation mismatch`).toEqual(extractVars(enVal));
    }
  });
});
