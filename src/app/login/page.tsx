import { AuthForm } from '@/components/auth-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm pt-8">
      <div className="card card-pad">
        <h1 className="mb-1 font-display text-3xl font-black uppercase">Sign in</h1>
        <p className="mb-5 text-sm text-muted">Coaches manage their programs; fans follow teams and comment.</p>
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
