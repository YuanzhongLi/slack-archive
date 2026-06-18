import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { makeMockEnv } from '../test/helpers';

describe('securityHeaders middleware', () => {
  const env = makeMockEnv({ DEV_USER_EMAIL: '', CF_ACCESS_TEAM_DOMAIN: '', CF_ACCESS_AUD: '' });

  async function getHeaders(): Promise<Headers> {
    const res = await app.request('/api/health', { method: 'GET' }, env);
    return res.headers;
  }

  it('sets X-Content-Type-Options: nosniff', async () => {
    expect((await getHeaders()).get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    expect((await getHeaders()).get('X-Frame-Options')).toBe('DENY');
  });

  it('sets X-XSS-Protection: 0', async () => {
    expect((await getHeaders()).get('X-XSS-Protection')).toBe('0');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    expect((await getHeaders()).get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Content-Security-Policy', async () => {
    const csp = (await getHeaders()).get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('sets Permissions-Policy disabling camera, microphone, geolocation', async () => {
    const pp = (await getHeaders()).get('Permissions-Policy');
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
  });
});
