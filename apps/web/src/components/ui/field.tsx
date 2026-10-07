/**
 * Field wrapper.
 *
 * Binds a label, a control and an error message together so the three can
 * never disagree. The association is explicit (`htmlFor`/`id`) rather than
 * implicit nesting, because screen readers announce the label of a control
 * by id, and an input whose error text is only visually beneath it is an
 * input whose failure is invisible to a non-visual user.
 *
 * The server's field errors are accepted alongside the local ones: a 422
 * from the API names the same fields the client validates, and showing
 * only the first one to fail would hide the rest.
 */

import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui/label';

export interface FieldProps {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly required?: boolean | undefined;
  readonly children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = error !== undefined && error.length > 0;

  const describedBy =
    [invalid ? errorId : null, hint !== undefined ? hintId : null]
      .filter((value): value is string => value !== null)
      .join(' ') || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required === true ? (
          <span className="ml-1 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children({ id, describedBy, invalid })}
      {hint !== undefined ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {invalid ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A read-only row of label and value, for detail views. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm sm:col-span-2')}>{children}</dd>
    </div>
  );
}
