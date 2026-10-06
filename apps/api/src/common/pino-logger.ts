/**
 * Structured logger.
 *
 * Wraps pino behind Nest's LoggerService so every
 * line the framework and the modules emit is one
 * JSON object. In development the stream is routed
 * through pino-pretty; in production it stays JSON
 * for the log pipeline to collect.
 *
 * `redact` masks the fields a log call could
 * accidentally carry — a token in an authorization
 * header, a password in a body — at the sink, so a
 * secret is censored before it leaves the process
 * even when the caller never noticed it was there.
 */

import type { LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';

/**
 * Emits one line. A string message stays the
 * message; an object becomes the fields, so a
 * caller that logs a structured value does not
 * have it stringified away.
 */
function line(
  logger: Logger,
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug',
  message: unknown,
  trace?: string,
): void {
  const fields: Record<string, unknown> = {};
  if (trace !== undefined) fields.err = trace;

  if (typeof message === 'string') {
    switch (level) {
      case 'fatal':
        logger.fatal(fields, message);
        break;
      case 'error':
        logger.error(fields, message);
        break;
      case 'warn':
        logger.warn(fields, message);
        break;
      case 'info':
        logger.info(fields, message);
        break;
      case 'debug':
        logger.debug(fields, message);
        break;
    }
    return;
  }

  const merged = { ...fields, ...(message as Record<string, unknown>) };
  switch (level) {
    case 'fatal':
      logger.fatal(merged);
      break;
    case 'error':
      logger.error(merged);
      break;
    case 'warn':
      logger.warn(merged);
      break;
    case 'info':
      logger.info(merged);
      break;
    case 'debug':
      logger.debug(merged);
      break;
  }
}

export function createPinoLogger(name: string): LoggerService {
  const logger: Logger = pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'authorization',
        'req.headers.authorization',
        'req.body.token',
      ],
      censor: '[redacted]',
    },
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }),
  });

  return {
    log(message: unknown) {
      line(logger, 'info', message);
    },
    error(message: unknown, trace?: string) {
      line(logger, 'error', message, trace);
    },
    warn(message: unknown) {
      line(logger, 'warn', message);
    },
    debug(message: unknown) {
      line(logger, 'debug', message);
    },
    verbose(message: unknown) {
      line(logger, 'debug', message);
    },
    fatal(message: unknown) {
      line(logger, 'fatal', message);
    },
  };
}
