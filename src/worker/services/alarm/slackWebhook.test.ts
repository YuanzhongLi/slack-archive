import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAlarm } from './slackWebhook';

describe('sendAlarm', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeResponse(ok: boolean, body = 'ok'): Response {
    return {
      ok,
      status: ok ? 200 : 500,
      text: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  it('POSTs to the webhook URL with JSON content-type', async () => {
    fetchMock.mockResolvedValue(makeResponse(true));
    await sendAlarm('https://hooks.slack.com/test', {
      level: 'info',
      title: 'Test',
      message: 'Hello',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/test');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('includes :red_circle: icon for error level', async () => {
    fetchMock.mockResolvedValue(makeResponse(true));
    await sendAlarm('https://hooks.slack.com/test', {
      level: 'error',
      title: 'Sync failed',
      message: 'boom',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { text: string };
    expect(body.text).toContain(':red_circle:');
    expect(body.text).toContain('Sync failed');
  });

  it('includes :warning: icon for warn level', async () => {
    fetchMock.mockResolvedValue(makeResponse(true));
    await sendAlarm('https://hooks.slack.com/test', {
      level: 'warn',
      title: 'Warn',
      message: 'msg',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { text: string };
    expect(body.text).toContain(':warning:');
  });

  it('includes :information_source: icon for info level', async () => {
    fetchMock.mockResolvedValue(makeResponse(true));
    await sendAlarm('https://hooks.slack.com/test', {
      level: 'info',
      title: 'Info',
      message: 'msg',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { text: string };
    expect(body.text).toContain(':information_source:');
  });

  it('includes fields in the message text', async () => {
    fetchMock.mockResolvedValue(makeResponse(true));
    await sendAlarm('https://hooks.slack.com/test', {
      level: 'info',
      title: 'Size report',
      message: 'DB is fine',
      fields: { 'DB size': '0.1 MB', Threshold: '400 MB' },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { text: string };
    expect(body.text).toContain('DB size');
    expect(body.text).toContain('0.1 MB');
    expect(body.text).toContain('Threshold');
    expect(body.text).toContain('400 MB');
  });

  it('consumes the response body and throws on non-ok response', async () => {
    const textMock = vi.fn().mockResolvedValue('invalid_token');
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: textMock } as unknown as Response);
    await expect(
      sendAlarm('https://hooks.slack.com/test', { level: 'info', title: 'T', message: 'M' }),
    ).rejects.toThrow('Slack webhook failed: 403 - invalid_token');
    expect(textMock).toHaveBeenCalledOnce();
  });

  it('consumes the response body on success', async () => {
    const textMock = vi.fn().mockResolvedValue('ok');
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: textMock } as unknown as Response);
    await sendAlarm('https://hooks.slack.com/test', { level: 'info', title: 'T', message: 'M' });
    expect(textMock).toHaveBeenCalledOnce();
  });
});
