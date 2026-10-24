'use client';

import * as React from 'react';

export default function AuthCallback() {
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const completeSignIn = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code');
        if (!code) throw new Error('The sign-in callback did not include an authorization code.');

        const { getSupabaseClient } = await import('@/lib/supabase');
        const { error: exchangeError } = await getSupabaseClient().auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        window.location.replace('/');
      } catch (callbackError) {
        if (!cancelled) {
          setError(
            callbackError instanceof Error
              ? callbackError.message
              : 'Could not complete Google sign-in.'
          );
        }
      }
    };

    void completeSignIn();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-xl">
        <h1 className="text-xl font-semibold">Completing sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || 'Please wait while we securely sign you in.'}
        </p>
        {error && (
          <a href="/" className="mt-5 inline-flex text-sm font-medium text-primary hover:underline">
            Return to sign in
          </a>
        )}
      </section>
    </main>
  );
}
