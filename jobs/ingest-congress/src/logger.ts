export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export function createLogger(minLevel: LogLevel = 'info') {
  const minValue = LEVEL_VALUES[minLevel];

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LEVEL_VALUES[level] < minValue) return;
    const entry: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      msg,
      ...data,
    };
    const line = JSON.stringify(entry) + '\n';
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  return {
    trace: (msg: string, data?: Record<string, unknown>) => log('trace', msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
    fatal: (msg: string, data?: Record<string, unknown>) => log('fatal', msg, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;
