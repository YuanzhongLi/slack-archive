export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
};

type LoggerOptions = {
  pretty?: boolean;
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

function formatPretty(level: LogLevel, msg: string, fields: Record<string, unknown>): string {
  const { requestId, ...rest } = fields;
  const reqId = typeof requestId === 'string' ? ` [${requestId.slice(0, 8)}]` : '';
  const extras = Object.keys(rest).length > 0 ? `\n${JSON.stringify(rest, null, 2)}` : '';
  return `${LEVEL_LABEL[level]}${reqId} ${msg}${extras}`;
}

export function createLogger(
  bindings: Record<string, unknown> = {},
  opts: LoggerOptions = {},
): Logger {
  const pretty = opts.pretty ?? false;

  const emit = (level: LogLevel, msg: string, ctx?: Record<string, unknown>) => {
    const allFields = { ...bindings, ...ctx };
    const entry = pretty
      ? formatPretty(level, msg, allFields)
      : JSON.stringify({ level, msg, ...allFields });

    if (level === 'error') {
      console.error(entry);
    } else if (level === 'warn') {
      console.warn(entry);
    } else {
      console.log(entry);
    }
  };

  return {
    debug: (msg, ctx) => emit('debug', msg, ctx),
    info: (msg, ctx) => emit('info', msg, ctx),
    warn: (msg, ctx) => emit('warn', msg, ctx),
    error: (msg, ctx) => emit('error', msg, ctx),
    child: (newBindings) => createLogger({ ...bindings, ...newBindings }, opts),
  };
}
