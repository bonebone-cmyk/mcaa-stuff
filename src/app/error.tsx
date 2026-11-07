'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h1 className="font-display text-3xl font-black uppercase">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">{error.digest ? `Error reference: ${error.digest}` : 'Please try again.'}</p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
