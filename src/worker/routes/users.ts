import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db/client';
import { type User, users } from '../db/schema';
import { hasRole } from '../middleware/auth';

const transferRootSchema = z.object({
  newRootId: z.string().min(1),
});

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']),
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'viewer']),
});

const router = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// GET /api/users
router.get('/', async (c) => {
  const currentUser = c.get('user');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  const db = createDb(c.env.DB);
  const rows = await db.select().from(users).all();
  return c.json(rows);
});

// DELETE /api/users/:id
router.delete('/:id', async (c) => {
  const currentUser = c.get('user');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');

  if (currentUser.id === id) {
    return c.json({ status: 'error', message: 'Cannot delete yourself' }, 403);
  }

  const db = createDb(c.env.DB);
  const target = await db.select().from(users).where(eq(users.id, id)).get();

  if (!target) {
    return c.json({ status: 'error', message: 'User not found' }, 404);
  }
  if (target.role === 'root') {
    return c.json({ status: 'error', message: 'Cannot delete root user' }, 403);
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ status: 'done' });
});

// POST /api/users
router.post(
  '/',
  zValidator('json', createUserSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { status: 'error', message: result.error.issues.map((i) => i.message).join(', ') },
        400,
      );
    }
  }),
  async (c) => {
    const currentUser = c.get('user');
    if (!hasRole(currentUser, 'admin')) {
      return c.json({ status: 'error', message: 'Forbidden' }, 403);
    }

    const { email, role } = c.req.valid('json');
    const db = createDb(c.env.DB);

    try {
      const existing = await db.select().from(users).where(eq(users.email, email)).get();
      if (existing) {
        return c.json({ status: 'error', message: 'Email already exists' }, 409);
      }

      const now = new Date().toISOString();
      const newUser = {
        id: crypto.randomUUID(),
        email,
        role,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(users).values(newUser);
      return c.json(newUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ status: 'error', message: msg }, 500);
    }
  },
);

// PATCH /api/users/:id
router.patch(
  '/:id',
  zValidator('json', updateUserSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { status: 'error', message: result.error.issues.map((i) => i.message).join(', ') },
        400,
      );
    }
  }),
  async (c) => {
    const currentUser = c.get('user');
    if (!hasRole(currentUser, 'admin')) {
      return c.json({ status: 'error', message: 'Forbidden' }, 403);
    }

    const id = c.req.param('id');
    const { role } = c.req.valid('json');
    const db = createDb(c.env.DB);

    try {
      const target = await db.select().from(users).where(eq(users.id, id)).get();
      if (!target) {
        return c.json({ status: 'error', message: 'User not found' }, 404);
      }
      if (target.role === 'root') {
        return c.json(
          { status: 'error', message: 'Cannot change root role. Use transfer-root instead' },
          403,
        );
      }

      const now = new Date().toISOString();
      await db.update(users).set({ role, updatedAt: now }).where(eq(users.id, id));
      const updated = await db.select().from(users).where(eq(users.id, id)).get();
      return c.json(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ status: 'error', message: msg }, 500);
    }
  },
);

// POST /api/users/transfer-root
router.post(
  '/transfer-root',
  zValidator('json', transferRootSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { status: 'error', message: result.error.issues.map((i) => i.message).join(', ') },
        400,
      );
    }
  }),
  async (c) => {
    const currentUser = c.get('user');
    if (currentUser.role !== 'root') {
      return c.json({ status: 'error', message: 'Only root can transfer root role' }, 403);
    }

    const { newRootId } = c.req.valid('json');
    const db = createDb(c.env.DB);
    const target = await db.select().from(users).where(eq(users.id, newRootId)).get();

    if (!target) {
      return c.json({ status: 'error', message: 'Target user not found' }, 404);
    }
    if (target.role === 'root') {
      return c.json({ status: 'error', message: 'Target user is already root' }, 400);
    }

    const now = new Date().toISOString();
    const d1 = c.env.DB;
    await d1.batch([
      // Demote current root by ID (not by role) to avoid unintended side effects
      // if DB somehow has multiple root users
      d1
        .prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ? AND role = ?')
        .bind('admin', now, currentUser.id, 'root'),
      d1
        .prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
        .bind('root', now, newRootId),
    ]);

    return c.json({ status: 'done' });
  },
);

export default router;
