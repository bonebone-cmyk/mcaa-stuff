import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <div className="font-display text-7xl font-black text-accent">404</div>
      <h1 className="font-display text-2xl font-bold uppercase">Flag on the play</h1>
      <p className="mt-2 text-muted">That page isn’t in the universe.</p>
      <Link href="/" className="btn-primary mt-6">Back to home</Link>
    </div>
  );
}
