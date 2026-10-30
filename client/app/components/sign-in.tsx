'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileSearch,
  FileText,
  Loader2,
  LockKeyhole,
  MessageSquareText,
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
    <main className="relative flex min-h-screen flex-col overflow-hidden px-5 py-5 sm:px-8 sm:py-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-1/4 size-[28rem] rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 bottom-0 size-[32rem] rounded-full bg-primary/5 blur-3xl"
      />

      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between">
        <Link href="/" className="group inline-flex items-center gap-3" aria-label="Reading Room home">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform group-hover:-rotate-6">
            <BookOpen className="size-[1.15rem]" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight sm:text-base">Reading Room</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
              A workspace for what you read
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <LockKeyhole className="size-3.5 text-primary" aria-hidden="true" />
            Private by design
          </span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <ThemeToggle />
        </div>
      </header>

      <div className="relative mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:gap-16 lg:py-14">
        <section className="mx-auto w-full max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Your documents, easier to understand
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[4.25rem]">
            Read less around.
            <span className="block bg-gradient-to-r from-primary to-primary/60 bg-clip-text pb-1 text-transparent">
              Understand more.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Bring your PDFs into one calm workspace. Ask questions in plain language and get
            answers grounded in the documents you choose.
          </p>

          <div
            aria-label="Preview of the Reading Room workspace"
            className="relative mt-10 hidden sm:block"
          >
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/10 via-transparent to-primary/5 blur-xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 shadow-2xl shadow-black/15 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold">Your reading room</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">A workspace for your PDFs</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Ready to explore
                </span>
              </div>

              <div className="grid min-h-56 grid-cols-[150px_minmax(0,1fr)]">
                <div className="border-r border-border/70 bg-secondary/30 p-4">
                  <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Your library
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-2 py-2">
                      <FileText className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate text-[10px] font-medium">Research paper.pdf</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-muted-foreground">
                      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate text-[10px]">Course notes.pdf</span>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <FileSearch className="size-3.5 text-primary/80" aria-hidden="true" />
                    Ask across selected PDFs
                  </div>
                </div>

                <div className="flex flex-col justify-between p-4 sm:p-5">
                  <div>
                    <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      A conversation with your documents
                    </p>
                    <div className="ml-auto mb-3 max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-3 py-2 text-[10px] leading-relaxed">
                      What are the main findings?
                    </div>
                    <div className="flex max-w-[94%] items-start gap-2.5 rounded-2xl rounded-bl-sm border border-border/80 bg-background/70 p-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Sparkles className="size-3" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-medium">A clear answer, grounded in your reading.</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                          Explore key ideas and follow up with questions in your own words.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-border/80 bg-background/60 px-3 py-2.5">
                    <span className="text-[10px] text-muted-foreground">Ask about your PDFs…</span>
                    <span className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card/70 text-primary">
                <FileSearch className="size-4" aria-hidden="true" />
              </span>
              Answers from your PDFs
            </div>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card/70 text-primary">
                <MessageSquareText className="size-4" aria-hidden="true" />
              </span>
              Conversations that stay
            </div>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card/70 text-primary">
                <LockKeyhole className="size-4" aria-hidden="true" />
              </span>
              Your own private space
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/95 p-6 shadow-2xl shadow-black/15 backdrop-blur-xl sm:p-8">
            <div className="absolute right-0 top-0 size-40 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <div className="mb-7 flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <BookOpen className="size-5" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">
                  <LockKeyhole className="size-3 text-primary" aria-hidden="true" />
                  Secure sign-in
                </span>
              </div>
              <p className="text-sm font-medium text-primary">Welcome to Reading Room</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Make room for better reading.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Sign in to collect your PDFs, ask questions, and return to your conversations.
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
                    <ArrowUpRight
                      className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
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
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  One step to get started
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-2.5 text-xs leading-5 text-muted-foreground">
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Create your account with Google in one step
                </p>
                <p className="flex items-center gap-2.5 text-xs leading-5 text-muted-foreground">
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Your library and chats are waiting when you return
                </p>
              </div>
            </div>
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <LockKeyhole className="size-3 shrink-0" aria-hidden="true" />
            Secure authentication powered by Google
          </p>
        </section>
      </div>
      <footer className="relative mx-auto flex w-full max-w-7xl items-center justify-between border-t border-border/60 pt-4 text-[10px] text-muted-foreground">
        <span>Make space for focused reading.</span>
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-primary" />
          Your documents. Your questions. Your pace.
        </span>
      </footer>
    </main>
  );
};

export default SignIn;
