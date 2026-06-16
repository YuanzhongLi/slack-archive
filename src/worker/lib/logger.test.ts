import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

describe('createLogger — JSON mode (default)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON with level and msg', () => {
    const logger = createLogger();
    logger.info('hello');
    expect(logSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: 'info', msg: 'hello' });
  });

  it('includes bindings in output', () => {
    const logger = createLogger({ service: 'sync' });
    logger.info('started');
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: 'info', msg: 'started', service: 'sync' });
  });

  it('merges per-call ctx into output', () => {
    const logger = createLogger({ service: 'sync' });
    logger.info('done', { channelCount: 3 });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: 'info', msg: 'done', service: 'sync', channelCount: 3 });
  });

  it('per-call ctx keys overwrite bindings keys', () => {
    const logger = createLogger({ service: 'sync' });
    logger.info('override', { service: 'other' });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.service).toBe('other');
  });

  describe('level routing', () => {
    it('debug uses console.log', () => {
      createLogger().debug('d');
      expect(logSpy).toHaveBeenCalledOnce();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('info uses console.log', () => {
      createLogger().info('i');
      expect(logSpy).toHaveBeenCalledOnce();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('warn uses console.warn', () => {
      createLogger().warn('w');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('error uses console.error', () => {
      createLogger().error('e');
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('level field is correct for each level', () => {
      const logger = createLogger();
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(JSON.parse(logSpy.mock.calls[0][0] as string).level).toBe('debug');
      expect(JSON.parse(logSpy.mock.calls[1][0] as string).level).toBe('info');
      expect(JSON.parse(warnSpy.mock.calls[0][0] as string).level).toBe('warn');
      expect(JSON.parse(errorSpy.mock.calls[0][0] as string).level).toBe('error');
    });
  });
});

describe('createLogger — child()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('child inherits parent bindings', () => {
    const logger = createLogger({ requestId: 'abc' });
    const child = logger.child({ service: 'sync' });
    child.info('msg');
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ requestId: 'abc', service: 'sync', msg: 'msg' });
  });

  it('child bindings overwrite parent bindings on key collision', () => {
    const logger = createLogger({ service: 'parent' });
    const child = logger.child({ service: 'child' });
    child.info('msg');
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.service).toBe('child');
  });

  it('parent is unaffected by child bindings', () => {
    const logger = createLogger({ service: 'parent' });
    const child = logger.child({ service: 'child' });
    child.info('from child');
    logSpy.mockClear();
    logger.info('from parent');
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.service).toBe('parent');
  });

  it('child inherits pretty option from parent', () => {
    const logger = createLogger({ requestId: '12345678-abcd' }, { pretty: true });
    const child = logger.child({ service: 'sync' });
    child.info('msg');
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('INF');
    expect(output).toContain('[12345678]');
  });
});

describe('createLogger — pretty mode', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses level label instead of JSON', () => {
    const logger = createLogger({}, { pretty: true });
    logger.info('hello');
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('INF');
    expect(output).toContain('hello');
    expect(() => JSON.parse(output)).toThrow();
  });

  it('shows truncated requestId (8 chars) when present', () => {
    const logger = createLogger({ requestId: 'abcdef12-xxxx-yyyy-zzzz-000000000000' }, { pretty: true });
    logger.info('msg');
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('[abcdef12]');
    expect(output).not.toContain('xxxx');
  });

  it('omits requestId bracket when requestId is absent', () => {
    const logger = createLogger({}, { pretty: true });
    logger.info('msg');
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('[');
  });

  it('appends extra fields as indented JSON', () => {
    const logger = createLogger({ service: 'sync' }, { pretty: true });
    logger.info('done', { channelCount: 5 });
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('"service"');
    expect(output).toContain('"channelCount"');
    expect(output).toContain('5');
  });

  it('omits extras block when no fields beyond requestId', () => {
    const logger = createLogger({ requestId: 'abc' }, { pretty: true });
    logger.info('msg');
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toBe('INF [abc] msg');
  });

  it('level labels are correct', () => {
    const logger = createLogger({}, { pretty: true });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(logSpy.mock.calls[0][0]).toContain('DBG');
    expect(logSpy.mock.calls[1][0]).toContain('INF');
    expect(warnSpy.mock.calls[0][0]).toContain('WRN');
    expect(errorSpy.mock.calls[0][0]).toContain('ERR');
  });
});
