import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { Db } from '../db/client';
import * as schema from '../db/schema';

export const ROOT_EMAIL = 'root@test.dev';
export const ADMIN_EMAIL = 'admin@test.dev';
export const VIEWER_EMAIL = 'viewer@test.dev';

const MIGRATION_FILES = [
  '0000_pale_hellcat.sql',
  '0001_whole_gateway.sql',
  '0002_cuddly_swarm.sql',
];

export function createTestDb(): Db {
  const sqlite = new Database(':memory:');
  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(join(process.cwd(), 'migrations', file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }
  return drizzle(sqlite, { schema }) as unknown as Db;
}

export function seedUsers(db: Db) {
  db.insert(schema.users)
    .values([
      {
        id: 'root-id',
        email: ROOT_EMAIL,
        role: 'root',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'admin-id',
        email: ADMIN_EMAIL,
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'viewer-id',
        email: VIEWER_EMAIL,
        role: 'viewer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    .run();
}

type LooseEnv = Omit<Env, 'DEV_USER_EMAIL'> & { DEV_USER_EMAIL: string };

export function makeMockEnv(overrides: Partial<LooseEnv> = {}): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    DEV_USER_EMAIL: ROOT_EMAIL,
    CF_ACCESS_TEAM_DOMAIN: '',
    CF_ACCESS_AUD: '',
    SLACK_BOT_TOKEN: '',
    ...overrides,
  } as unknown as Env;
}
