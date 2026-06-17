import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ createDb: vi.fn() }));
import { createDb } from '../db/client';
import { app } from '../app';
import * as schema from '../db/schema';
import {
  ADMIN_EMAIL,
  ROOT_EMAIL,
  VIEWER_EMAIL,
  createTestDb,
  makeMockEnv,
  seedUsers,
} from '../test/helpers';
import type { Db } from '../db/client';

const createDbMock = vi.mocked(createDb);

let db: Db;

beforeEach(() => {
  db = createTestDb();
  seedUsers(db);
  createDbMock.mockReturnValue(db);
});

function req(method: string, path: string, body?: unknown, env?: Env): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return Promise.resolve(app.request(path, init, env ?? makeMockEnv()));
}

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users', () => {
  it('root can list users', async () => {
    const res = await req(
      'GET',
      '/api/users',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(3);
  });

  it('admin can list users', async () => {
    const res = await req(
      'GET',
      '/api/users',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
  });

  it('viewer cannot list users', async () => {
    const res = await req(
      'GET',
      '/api/users',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/users/:id', () => {
  it('admin can delete a viewer', async () => {
    const res = await req(
      'DELETE',
      '/api/users/viewer-id',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
    const remaining = await db.select().from(schema.users).all();
    expect(remaining.find((u) => u.id === 'viewer-id')).toBeUndefined();
  });

  it('cannot delete root user', async () => {
    const res = await req(
      'DELETE',
      '/api/users/root-id',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/root/i);
  });

  it('cannot delete yourself', async () => {
    const res = await req(
      'DELETE',
      '/api/users/admin-id',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/yourself/i);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await req(
      'DELETE',
      '/api/users/does-not-exist',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(404);
  });

  it('viewer cannot delete users', async () => {
    const res = await req(
      'DELETE',
      '/api/users/admin-id',
      undefined,
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------

describe('POST /api/users', () => {
  it('admin can create a viewer', async () => {
    const res = await req(
      'POST',
      '/api/users',
      { email: 'new@test.dev', role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; role: string };
    expect(body.email).toBe('new@test.dev');
    expect(body.role).toBe('viewer');
  });

  it('admin can create an admin', async () => {
    const res = await req(
      'POST',
      '/api/users',
      { email: 'new-admin@test.dev', role: 'admin' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
  });

  it('viewer cannot create users', async () => {
    const res = await req(
      'POST',
      '/api/users',
      { email: 'new@test.dev', role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 409 on duplicate email', async () => {
    const res = await req(
      'POST',
      '/api/users',
      { email: VIEWER_EMAIL, role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 400 on invalid email', async () => {
    const res = await req(
      'POST',
      '/api/users',
      { email: 'not-an-email', role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is root', async () => {
    const res = await req(
      'POST',
      '/api/users',
      { email: 'new@test.dev', role: 'root' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/users/:id', () => {
  it('admin can change viewer role to admin', async () => {
    const res = await req(
      'PATCH',
      '/api/users/viewer-id',
      { role: 'admin' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe('admin');
  });

  it('admin can change admin role to viewer', async () => {
    const res = await req(
      'PATCH',
      '/api/users/admin-id',
      { role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe('viewer');
  });

  it('cannot change role of root user', async () => {
    const res = await req(
      'PATCH',
      '/api/users/root-id',
      { role: 'admin' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await req(
      'PATCH',
      '/api/users/does-not-exist',
      { role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(404);
  });

  it('viewer cannot change roles', async () => {
    const res = await req(
      'PATCH',
      '/api/users/admin-id',
      { role: 'viewer' },
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when role is root', async () => {
    const res = await req(
      'PATCH',
      '/api/users/viewer-id',
      { role: 'root' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/transfer-root
// ---------------------------------------------------------------------------

describe('POST /api/users/transfer-root', () => {
  // transfer-root uses d1.batch() — mock the raw D1 binding
  function makeEnvWithD1Mock(
    callerEmail: string,
    batchImpl?: (stmts: D1PreparedStatement[]) => Promise<D1Result[]>,
  ): Env {
    const batchFn =
      batchImpl ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((async () => [{ results: [], success: true, meta: {} as unknown }]) as unknown as (
        stmts: D1PreparedStatement[],
      ) => Promise<D1Result[]>);

    const d1Mock = {
      batch: vi.fn(batchFn),
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({ sql })),
      })),
    } as unknown as D1Database;

    return makeMockEnv({ DEV_USER_EMAIL: callerEmail, DB: d1Mock });
  }

  it('root can transfer root to an admin', async () => {
    const env = makeEnvWithD1Mock(ROOT_EMAIL);
    const res = await req('POST', '/api/users/transfer-root', { newRootId: 'admin-id' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('done');
  });

  it('non-root cannot transfer root', async () => {
    const res = await req(
      'POST',
      '/api/users/transfer-root',
      { newRootId: 'viewer-id' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when target user does not exist', async () => {
    const res = await req(
      'POST',
      '/api/users/transfer-root',
      { newRootId: 'does-not-exist' },
      makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when target is already root', async () => {
    const res = await req(
      'POST',
      '/api/users/transfer-root',
      { newRootId: 'root-id' },
      makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/already root/i);
  });

  it('returns 400 when newRootId is missing', async () => {
    const res = await req(
      'POST',
      '/api/users/transfer-root',
      {},
      makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }),
    );
    expect(res.status).toBe(400);
  });
});
