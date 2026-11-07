'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/lib/actions';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Form bound to a server action. Shows pending state and the action's result,
 * and asks for confirmation first when `confirm` is set (destructive actions).
 */
export function ActionForm({ action, children, className = '', confirm, resetOnSuccess = false, redirectTo }: {
  action: Action; children: ReactNode; className?: string; confirm?: string; resetOnSuccess?: boolean; redirectTo?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: null, message: '' });
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.ok && (redirectTo || typeof state.data?.redirect === 'string')) router.push((state.data?.redirect as string) ?? redirectTo!);
  }, [state, resetOnSuccess, redirectTo, router]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {children}
      {state.message && (
        <p role="status" className={`mt-2 text-sm font-medium ${state.ok ? 'text-win' : 'text-loss'}`}>{state.message}</p>
      )}
    </form>
  );
}

export function Submit({ children, className = 'btn-primary', pendingText = 'Working…', name, value }: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}
