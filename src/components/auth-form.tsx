'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createSupabaseBrowser();
  if (!supabase) {
    return <p className="text-sm text-muted">Authentication isn’t configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see README).</p>;
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      router.push('/my-team');
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: name || email.split('@')[0] }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error.message });
      if (data.session) { router.push('/'); router.refresh(); return; }
      setMsg({ ok: true, text: 'Check your email to confirm your account, then sign in.' });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === 'signup' && <label className="block"><span className="label">Display name</span><input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={40} /></label>}
      <label className="block"><span className="label">Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" /></label>
      <label className="block"><span className="label">Password</span><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      {msg && <p className={`text-sm ${msg.ok ? 'text-win' : 'text-loss'}`}>{msg.text}</p>}
      <p className="text-center text-sm text-muted">
        {mode === 'login' ? <>New here? <Link href="/signup" className="font-semibold text-accent">Create an account</Link></> : <>Have an account? <Link href="/login" className="font-semibold text-accent">Sign in</Link></>}
      </p>
    </form>
  );
}
