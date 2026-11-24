"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  className,
  submitLabel,
  submitClass = "btn-primary",
  confirm,
}: {
  action: Action;
  children?: ReactNode;
  className?: string;
  submitLabel?: string;
  submitClass?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className ?? "space-y-4"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.fieldErrors && (
        <ul className="list-inside list-disc text-sm text-red-700">
          {Object.entries(state.fieldErrors).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
      )}
      {state?.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.ok}
        </p>
      )}
      {submitLabel && <SubmitButton className={submitClass}>{submitLabel}</SubmitButton>}
    </form>
  );
}

export function SubmitButton({ children, className = "btn-primary" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? "Traitement…" : children}
    </button>
  );
}

export function Field({
  label,
  name,
  hint,
  ...props
}: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input id={name} name={name} className="input" {...props} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <textarea id={name} name={name} className="input min-h-24" {...props} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
