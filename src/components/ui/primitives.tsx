import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * The shared surface, form and layout primitives.
 *
 * Kept in one file on purpose: they are small, they change together, and a
 * component-per-file tree of twelve 15-line files makes the design system
 * harder to keep consistent, not easier.
 */

// --- Surfaces ---------------------------------------------------------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4 border-b px-5 py-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  // No tracking override: the type scale already pairs tracking with each size,
  // and a local `tracking-tight` here would silently disagree with it.
  return <h2 className={cn("text-sm font-semibold", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

// --- Form controls ----------------------------------------------------------

const controlBase =
  "w-full rounded-[var(--radius-control)] border border-[var(--color-line-control)] " +
  "bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] " +
  "placeholder:text-[var(--color-ink-subtle)] " +
  "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] " +
  "hover:border-[var(--color-ink-subtle)] " +
  "focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--color-focus-ring)] disabled:opacity-60 " +
  "aria-[invalid=true]:border-[var(--color-danger)]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlBase, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlBase, "min-h-20 py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(controlBase, "h-10 pr-8", className)} {...props} />
));
Select.displayName = "Select";

/** Money input: right-aligned tabular figures, so a column of them lines up. */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    inputMode="decimal"
    // `text` rather than `number`: number inputs silently drop trailing zeros,
    // reject commas, and behave differently across locales. Validation is done
    // in Decimal space anyway.
    type="text"
    className={cn(controlBase, "tabular h-10 text-right", className)}
    {...props}
  />
));
MoneyInput.displayName = "MoneyInput";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("block text-xs font-medium text-[var(--color-ink-muted)]", className)}
      {...props}
    >
      {children}
      {required ? <span className="ml-0.5 text-[var(--color-danger)]">*</span> : null}
    </label>
  );
}

/** Label + control + hint/error, so spacing never varies between forms. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-ink-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}

// --- Feedback ---------------------------------------------------------------

export function Alert({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger-ink)]",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning-ink)]",
    success: "bg-[var(--color-success-soft)] text-[var(--color-success-ink)]",
    info: "bg-[var(--color-info-soft)] text-[var(--color-info-ink)]",
  } as const;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-[var(--radius-control)] px-4 py-3 text-sm", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-ink-subtle)]">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-ink-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Skeleton block for loading.tsx files. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-[var(--color-surface-muted)]", className)}
      {...props}
    />
  );
}

// --- Layout -----------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Table wrapper. The overflow container is part of the primitive so no table in
 * the app can push the page into horizontal scroll on a phone.
 *
 * `minWidth` is the width below which the table starts scrolling inside its own
 * container. It is a prop rather than a constant because a six-column invoice
 * list and a three-column dashboard summary need very different thresholds --
 * one value for both either cramps the wide table or puts a needless scrollbar
 * under the narrow one.
 */
export function TableWrap({
  className,
  minWidth = "38rem",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { minWidth?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table
        className="table-rows w-full border-collapse text-sm"
        style={{ minWidth }}
        {...props}
      />
    </div>
  );
}

export function Th({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b px-4 py-2.5 text-xs font-medium text-[var(--color-ink-subtle)]",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn("border-b px-4 py-3 align-middle", numeric && "tabular text-right", className)}
      {...props}
    />
  );
}
