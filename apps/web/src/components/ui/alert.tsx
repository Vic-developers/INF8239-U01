import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

const alertVariants = cva('relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:size-4', {
  variants: {
    variant: {
      default: 'bg-background text-foreground',
      destructive: 'border-destructive/50 text-destructive [&>svg]:text-destructive',
      success: 'border-success/50 text-success [&>svg]:text-success',
      warning: 'border-warning/50 text-warning [&>svg]:text-warning',
      info: 'border-info/50 text-info [&>svg]:text-info',
    },
  },
  defaultVariants: { variant: 'default' },
});

const ICONS = {
  destructive: AlertCircle,
  success: CheckCircle2,
  warning: TriangleAlert,
  info: Info,
  default: Info,
} as const;

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Overrides the variant's icon; pass `null` to show none. */
  readonly icon?: React.ReactNode | null;
}

export function Alert({ className, variant = 'default', icon, children, ...props }: AlertProps) {
  const Icon = variant === null || variant === undefined ? null : ICONS[variant];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {icon === null ? null : (icon ?? (Icon ? <Icon aria-hidden /> : null))}
      <div className="[&:not(:first-child)]:mt-1.5">{children}</div>
    </div>
  );
}
