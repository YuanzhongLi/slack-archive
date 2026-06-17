import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth';
import type { User } from './middleware/auth';
import { createLogger } from './lib/logger';
import type { Logger } from './lib/logger';
import channelsRouter from './routes/channels';
import searchRouter from './routes/search';
import syncRouter from './routes/sync';
import usersRouter from './routes/users';

const app = new Hono<{ Bindings: Env; Variables: { user: User; logger: Logger } }>();

// Attach a request-scoped logger to every request
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const pretty = Boolean(c.env.DEV_USER_EMAIL) && !c.env.CF_ACCESS_TEAM_DOMAIN;
  c.set('logger', createLogger({ requestId }, { pretty }));
  await next();
});

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

// Channels
app.route('/api/channels', channelsRouter);

// Search
app.route('/api/search', searchRouter);

// Sync
app.route('/api/sync', syncRouter);

export { app };
