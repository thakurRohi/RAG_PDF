'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

const SignIn: React.FC<{ initialError?: string | null }> = ({ initialError = null }) => {
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError);

  const signInWithGoogle = async () => {
    setIsSigningIn(true);
    setError(null);
    try {
      const { error: signInError } = await getSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signInError) throw signInError;
    } catch (signInError) {
      setError(
        signInError instanceof Error ? signInError.message : 'Could not start Google sign-in.'
      );
      setIsSigningIn(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Reading Room
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Sign in with Google to securely access your PDFs and conversations.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={isSigningIn}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {isSigningIn && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSigningIn ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </main>
  );
};

export default SignIn;
