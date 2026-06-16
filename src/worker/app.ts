import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth';
import type { User } from './middleware/auth';
import usersRouter from './routes/users';
import syncRouter from './routes/sync';

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// Health check (unauthenticated)
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// All /api/* routes require authentication
app.use('/api/*', authMiddleware);

// GET /api/me
app.get('/api/me', (c) => {
  const user = c.get('user');
  return c.json({ id: user.id, email: user.email, role: user.role });
});

// User management
app.route('/api/users', usersRouter);

// Sync
app.route('/api/sync', syncRouter);

export { app };
