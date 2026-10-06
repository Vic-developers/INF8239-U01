/**
 * Exception filter.
 *
 * The single exit point for every error. Its job is to guarantee two properties:
 *
 *   1. The client receives the documented `ApiErrorBody` and nothing else. No
 *      stack traces, no upstream Moodle payloads, no SQL.
 *   2. The log receives the full technical detail, correlated by request id, so
 *      an operator can debug without the response having leaked anything.
 *
 * The distinction matters most for the Moodle errors: upstream exceptions carry
 * the whole request, sometimes including the token in a URL.
 */

import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError, REQUEST_ID_HEADER } from '@mcc/shared';
import type { RequestWithContext } from './request-context.js';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();

    const requestId = request.requestId ?? 'unknown';
    const error = this.normalise(exception);

    if (error.httpStatus >= 500) {
      // Server-side faults are logged with context; 4xx are not, because they are
      // a client's business and logging them buries the real failures.
      //
      // Written directly to stderr rather than through Nest's Logger: the app
      // is created with `logger: false` so the framework does not interleave
      // its own format, and a server fault must never be silently swallowed
      // for want of a configured logger.
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          method: request.method,
          url: request.url,
          code: error.code,
          message: error.message,
          ...(exception instanceof Error && exception.stack !== undefined
            ? { stack: exception.stack }
            : {}),
          ...(error.context !== undefined ? { context: error.context } : {}),
        }),
      );
    }

    if (response.headersSent) {
      // The response is already streaming, so the status line cannot be changed.
      // Closing the connection is the only honest signal left.
      response.end();
      return;
    }

    response
      .status(error.httpStatus)
      .set(REQUEST_ID_HEADER, requestId)
      .json(error.toBody(requestId));
  }

  /**
   * Collapses everything that can arrive here into an `AppError`.
   *
   * A Nest `HttpException` keeps its status but is re-wrapped: its body is
   * Nest's shape, not ours, and a client should never see two error formats.
   */
  private normalise(exception: unknown): AppError {
    if (AppError.is(exception)) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      const message =
        typeof payload === 'string'
          ? payload
          : this.extractNestMessage(payload) ?? 'La solicitud no pudo procesarse.';

      return new AppError({
        code: status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : 'VALIDATION_FAILED',
        message,
        httpStatus: status,
        context: { nestStatus: status, nestPayload: payload },
      });
    }

    if (exception instanceof Error) {
      // A programming error, not a client mistake. The message shown is generic on
      // purpose; the original goes to the log with the request id.
      return new AppError({
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado.',
        context: { original: exception.message, name: exception.name },
      });
    }

    return new AppError({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado.',
      context: { thrown: String(exception) },
    });
  }

  /** Nest validation errors arrive as `{ message: string[] }`. */
  private extractNestMessage(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) return null;

    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join('. ');
    }
    return null;
  }
}
