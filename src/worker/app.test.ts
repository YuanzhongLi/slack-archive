import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { makeMockEnv } from './test/helpers';

// DEV_USER_EMAIL: '' disables pretty mode so logger outputs JSON
const noAuthEnv = () =>
  makeMockEnv({ DEV_USER_EMAIL: '', CF_ACCESS_TEAM_DOMAIN: '', CF_ACCESS_AUD: '' });

describe('logging middleware', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits request and response log entries for GET /api/health', async () => {
    await app.request('/api/health', { method: 'GET' }, noAuthEnv());

    const entries = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
    const reqLog = entries.find((e) => e.msg === 'GET /api/health' && !('durationMs' in e));
    const resLog = entries.find((e) => e.msg === 'GET /api/health 200');

    expect(reqLog).toMatchObject({ level: 'info', msg: 'GET /api/health' });
    expect(resLog).toMatchObject({ level: 'info', msg: 'GET /api/health 200' });
    expect(typeof resLog?.durationMs).toBe('number');
  });

  it('request and response logs share the same requestId', async () => {
    await app.request('/api/health', {}, noAuthEnv());

    const entries = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
    const reqLog = entries.find((e) => e.msg === 'GET /api/health');
    const resLog = entries.find((e) => e.msg === 'GET /api/health 200');

    expect(reqLog?.requestId).toBeTruthy();
    expect(reqLog?.requestId).toBe(resLog?.requestId);
  });

  it('logs 404 status for unknown route', async () => {
    // Use a non-/api/ path to bypass authMiddleware and get a true 404 from Hono
    await app.request('/nonexistent', { method: 'GET' }, noAuthEnv());

    const entries = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
    // Distinguish response log from request log by presence of durationMs
    const resLog = entries.find(
      (e) => (e.msg as string).startsWith('GET /nonexistent') && 'durationMs' in e,
    );

    expect(resLog?.msg).toBe('GET /nonexistent 404');
    expect(typeof resLog?.durationMs).toBe('number');
  });
});
