import { PermissionError } from './auth/permissions';

export interface ActionState {
  ok: boolean | null;
  message: string;
  data?: Record<string, unknown>;
}
export const initialActionState: ActionState = { ok: null, message: '' };

const KNOWN = new Set(['PermissionError', 'GameStateError', 'RecruitingError', 'SeasonError', 'ZodError', 'Error']);

/** Runs a server action body and converts failures into a user-facing message. */
export async function runAction(fn: () => Promise<string | ActionState | void>): Promise<ActionState> {
  try {
    const r = await fn();
    if (typeof r === 'string') return { ok: true, message: r };
    return r ?? { ok: true, message: 'Saved.' };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
    const err = e as Error & { code?: string };
    if (err instanceof PermissionError) return { ok: false, message: err.message };
    if (err?.code === '23505') return { ok: false, message: 'That record already exists.' };
    if (err?.code === '23503') return { ok: false, message: 'That record is referenced elsewhere and cannot be changed this way.' };
    console.error(err);
    return { ok: false, message: KNOWN.has(err?.name) && err.message ? err.message : 'Something went wrong.' };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
export const num = (fd: FormData, k: string, fallback?: number) => {
  const v = Number(str(fd, k));
  if (Number.isFinite(v) && str(fd, k) !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`${k} must be a number`);
};
export const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
