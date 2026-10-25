'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Loader2,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import ThemeToggle from './theme-toggle';

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
    <main className="relative flex min-h-screen flex-col overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link href="/" className="group inline-flex items-center gap-3" aria-label="Reading Room home">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/15 transition-transform group-hover:-rotate-6">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">Reading Room</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-14">
        <section className="mx-auto w-full max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            A little more insight in every PDF
          </div>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Make your PDFs
            <span className="block text-primary">make sense.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground sm:text-lg">
            Your personal reading space for asking questions, finding answers, and keeping the
            important details close.
          </p>

          <div className="mt-8 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:gap-6">
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-primary" aria-hidden="true" />
              Answers grounded in your files
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-primary" aria-hidden="true" />
              Pick up where you left off
            </span>
          </div>

          <div
            aria-hidden="true"
            className="relative mt-12 hidden max-w-md -rotate-1 rounded-3xl border border-border/80 bg-card/80 p-5 shadow-2xl shadow-black/10 backdrop-blur sm:block"
          >
            <div className="flex items-center gap-3 border-b border-border/70 pb-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="h-2.5 w-32 rounded-full bg-foreground/15" />
                <div className="mt-2 h-2 w-20 rounded-full bg-muted-foreground/20" />
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                READY TO EXPLORE
              </span>
            </div>
            <div className="space-y-2.5 py-5">
              <div className="h-2 w-full rounded-full bg-foreground/10" />
              <div className="h-2 w-11/12 rounded-full bg-foreground/10" />
              <div className="h-2 w-4/5 rounded-full bg-foreground/10" />
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-primary/10 p-4">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="space-y-2">
                <div className="h-2 w-28 rounded-full bg-primary/40" />
                <div className="h-2 w-48 max-w-full rounded-full bg-primary/20" />
              </div>
            </div>
            <div className="absolute -bottom-5 -right-5 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs font-medium shadow-lg">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LockKeyhole className="size-3.5" />
              </span>
              Your space, just for you
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-9">
            <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="size-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-primary">Welcome to your Reading Room</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Let&apos;s get reading.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Sign in to bring your documents and conversations together in one calm, private space.
            </p>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={isSigningIn}
              aria-busy={isSigningIn}
              className="group mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Connecting securely…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
                    <path
                      fill="#FFC107"
                      d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
                    />
                    <path
                      fill="#FF3D00"
                      d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
                    />
                    <path
                      fill="#4CAF50"
                      d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z"
                    />
                    <path
                      fill="#1976D2"
                      d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"
                    />
                  </svg>
                  Continue with Google
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </>
              )}
            </button>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm leading-5 text-destructive"
              >
                {error}
              </p>
            )}

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">A quieter way to work with PDFs</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted-foreground">
              <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
              Your files and chats are only available after you sign in.
            </p>
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            New here? You can create an account with Google in one step.
          </p>
        </section>
      </div>
    </main>
  );
};

export default SignIn;
