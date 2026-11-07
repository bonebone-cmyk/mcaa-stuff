import { AuthForm } from '@/components/auth-form';

export const metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm pt-8">
      <div className="card card-pad">
        <h1 className="mb-1 font-display text-3xl font-black uppercase">Join the Universe</h1>
        <p className="mb-5 text-sm text-muted">New accounts start as fans. The commissioner can assign you a program to coach.</p>
        <AuthForm mode="signup" />
      </div>
    </div>
  );
}
