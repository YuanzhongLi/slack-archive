import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasRole } from './auth';
import type { User } from './auth';

// ---------------------------------------------------------------------------
// hasRole helper
// ---------------------------------------------------------------------------

function makeUser(role: 'root' | 'admin' | 'viewer'): User {
  return {
    id: 'test-id',
    email: 'test@example.com',
    role,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('hasRole', () => {
  describe('viewer', () => {
    const user = makeUser('viewer');
    it('satisfies viewer', () => expect(hasRole(user, 'viewer')).toBe(true));
    it('does not satisfy admin', () => expect(hasRole(user, 'admin')).toBe(false));
    it('does not satisfy root', () => expect(hasRole(user, 'root')).toBe(false));
  });

  describe('admin', () => {
    const user = makeUser('admin');
    it('satisfies viewer', () => expect(hasRole(user, 'viewer')).toBe(true));
    it('satisfies admin', () => expect(hasRole(user, 'admin')).toBe(true));
    it('does not satisfy root', () => expect(hasRole(user, 'root')).toBe(false));
  });

  describe('root', () => {
    const user = makeUser('root');
    it('satisfies viewer', () => expect(hasRole(user, 'viewer')).toBe(true));
    it('satisfies admin', () => expect(hasRole(user, 'admin')).toBe(true));
    it('satisfies root', () => expect(hasRole(user, 'root')).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// authMiddleware via app.request()
// ---------------------------------------------------------------------------

vi.mock('../db/client', () => ({ createDb: vi.fn() }));
import { createDb } from '../db/client';
import { createTestDb, makeMockEnv, seedUsers, ROOT_EMAIL, VIEWER_EMAIL } from '../test/helpers';
import { app } from '../app';

const createDbMock = vi.mocked(createDb);

beforeEach(() => {
  const db = createTestDb();
  seedUsers(db);
  createDbMock.mockReturnValue(db);
});

describe('authMiddleware — DEV_USER_EMAIL bypass', () => {
  it('returns 200 for registered user', async () => {
    const res = await app.request('/api/me', {}, makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; role: string };
    expect(body.email).toBe(ROOT_EMAIL);
    expect(body.role).toBe('root');
  });

  it('returns 403 when DEV_USER_EMAIL is not registered', async () => {
    const res = await app.request(
      '/api/me',
      {},
      makeMockEnv({ DEV_USER_EMAIL: 'unknown@test.dev' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when DEV_USER_EMAIL is empty and no JWT', async () => {
    const res = await app.request(
      '/api/me',
      {},
      makeMockEnv({
        DEV_USER_EMAIL: '',
        CF_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
        CF_ACCESS_AUD: 'test-aud',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('skips DEV bypass when CF_ACCESS_TEAM_DOMAIN is set', async () => {
    // Even with DEV_USER_EMAIL set, production mode is enforced when team domain is set
    const res = await app.request(
      '/api/me',
      {},
      makeMockEnv({
        DEV_USER_EMAIL: ROOT_EMAIL,
        CF_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
        CF_ACCESS_AUD: 'test-aud',
      }),
    );
    // No JWT provided → 401 (bypass is disabled)
    expect(res.status).toBe(401);
  });

  it('viewer can access /api/me', async () => {
    const res = await app.request('/api/me', {}, makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe('viewer');
  });
});

describe('GET /api/health — unauthenticated', () => {
  it('returns 200 without any auth', async () => {
    const res = await app.request(
      '/api/health',
      {},
      makeMockEnv({ DEV_USER_EMAIL: '', CF_ACCESS_TEAM_DOMAIN: '', CF_ACCESS_AUD: '' }),
    );
    expect(res.status).toBe(200);
  });
});
