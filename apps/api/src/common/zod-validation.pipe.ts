/**
 * Turns a Zod schema failure into the documented `ApiErrorBody`.
 *
 * Written here rather than pulled from a Nest integration package for two
 * reasons: the third-party validators emit their own error shape, which would
 * mean the UI handles two formats, and the version of any such package is coupled
 * to a Nest major. The contract this product publishes is `AppError`, and this is
 * the only place that has to change to keep it.
 */

import { ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError, type FieldIssue } from '@mcc/shared';

/** Query and param values arrive as strings; bodies arrive as parsed JSON. */
type RawBody = unknown;

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<RawBody, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: RawBody, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    // Flattened to one issue per path so the UI can attach each message to its own
    // field, and a top-level problem is reported at the body rather than dropped.
    const details: FieldIssue[] = result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : '(body)',
      issue: issue.message,
      ...(issue.code === 'unrecognized_keys' ? { code: 'unknown_key' } : {}),
    }));

    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Los datos enviados no son válidos.',
      details,
      remediation: {
        action: 'Revisa los campos marcados e inténtalo de nuevo',
      },
    });
  }
}

/** Binds a schema at the decorator site: `@Body(zodPipe(schema))`. */
export function zodPipe<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
