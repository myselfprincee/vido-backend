/**
 * Simple logger for production use
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLogLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
const currentLogLevelNum = LOG_LEVELS[currentLogLevel];

const formatTime = () => new Date().toISOString();

const formatMessage = (level: LogLevel, message: string, meta?: unknown) => {
  const time = formatTime();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${time}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

export const logger = {
  error: (message: string, meta?: unknown) => {
    if (LOG_LEVELS.error <= currentLogLevelNum) {
      console.error(formatMessage('error', message, meta));
    }
  },

  warn: (message: string, meta?: unknown) => {
    if (LOG_LEVELS.warn <= currentLogLevelNum) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  info: (message: string, meta?: unknown) => {
    if (LOG_LEVELS.info <= currentLogLevelNum) {
      console.log(formatMessage('info', message, meta));
    }
  },

  debug: (message: string, meta?: unknown) => {
    if (LOG_LEVELS.debug <= currentLogLevelNum) {
      console.log(formatMessage('debug', message, meta));
    }
  },
};
