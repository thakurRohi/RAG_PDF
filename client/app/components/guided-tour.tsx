'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, X } from 'lucide-react';

interface TourStep {
  target?: string;
  title: string;
  description: string;
  sidebar?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to your Reading Room',
    description:
      'This short guide shows you how to add a PDF, choose what to ask about, and find your way around. You can close it at any time and reopen it from Help.',
  },
  {
    target: 'upload',
    sidebar: true,
    title: '1. Add a PDF',
    description:
      'Choose a PDF from your device or drag it into this box. The app reads it so you can ask questions about its contents. PDFs can be up to 20 MB.',
  },
  {
    target: 'chat-history',
    sidebar: true,
    title: '2. Find your conversations',
    description:
      'Your saved conversations appear here. Select one to continue, or use the plus button to start a fresh conversation.',
  },
  {
    target: 'pdf-scope',
    title: '3. Choose which PDFs to use',
    description:
      'Open this menu and check the PDFs you want to use for your questions. You can change this selection later; it affects future questions, not earlier answers.',
  },
  {
    target: 'chat-composer',
    sidebar: false,
    title: '4. Ask a question',
    description:
      'Type a question about the selected PDFs and press Enter or the send button. Use Shift+Enter to start a new line.',
  },
  {
    target: 'profile',
    title: '5. Personalize your space',
    description:
      'Open your profile for theme settings, embedding-key options, usage details, and sign out. Select Help in the header whenever you want this walkthrough again.',
  },
];

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  onSidebarChange: (open: boolean) => void;
}

export default function GuidedTour({
  isOpen,
  onClose,
  onSidebarChange,
}: GuidedTourProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState<DOMRect | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const wasOpenRef = React.useRef(false);
  const step = TOUR_STEPS[stepIndex];

  React.useEffect(() => {
    if (!isOpen) return;
    if (!wasOpenRef.current) setStepIndex(0);
    wasOpenRef.current = true;
    const currentStep = TOUR_STEPS[stepIndex];
    if (currentStep.sidebar !== undefined) {
      onSidebarChange(currentStep.sidebar);
    }

    let frame = 0;
    const updateTarget = () => {
      const target = currentStep.target
        ? document.querySelector<HTMLElement>(`[data-tour="${currentStep.target}"]`)
        : null;
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.top < 12 || rect.bottom > window.innerHeight - 180) {
        target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
      setTargetRect(target.getBoundingClientRect());
    };

    frame = window.requestAnimationFrame(updateTarget);
    const delayedUpdate = window.setTimeout(updateTarget, 180);
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayedUpdate);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [isOpen, onSidebarChange, stepIndex]);

  React.useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      previouslyFocusedRef.current?.focus();
      return;
    }
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') {
        setStepIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
      }
      if (event.key === 'ArrowLeft') {
        setStepIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const finishTour = () => {
    onClose();
  };

  if (!isOpen) return null;

  const focusX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
  const focusY = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2;
  const radius = targetRect
    ? Math.max(targetRect.width, targetRect.height) / 2 + 18
    : 0;

  return (
    <div className="fixed inset-0 z-[90]" role="presentation">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: targetRect
            ? `radial-gradient(circle at ${focusX}px ${focusY}px, transparent ${radius}px, rgb(0 0 0 / 74%) ${radius + 20}px)`
            : 'rgb(0 0 0 / 74%)',
        }}
      />
      {targetRect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg border-2 border-primary shadow-[0_0_0_3px_rgb(255_255_255_/_0.9),0_0_30px_rgb(45_212_191_/_0.35)]"
          style={{
            left: targetRect.left - 4,
            top: targetRect.top - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-description"
        className="absolute inset-x-4 bottom-4 mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:bottom-8 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <CircleHelp className="size-4" aria-hidden="true" />
            <span>Reading Room guide</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={finishTour}
            aria-label="Close walkthrough"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          {stepIndex === 0 ? 'A quick start' : `Step ${stepIndex} of ${TOUR_STEPS.length - 1}`}
        </p>
        <h2 id="guided-tour-title" className="mt-1 text-lg font-semibold tracking-tight">
          {step.title}
        </h2>
        <p id="guided-tour-description" className="mt-2 text-sm leading-6 text-muted-foreground">
          {step.description}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={stepIndex === 0 ? finishTour : () => setStepIndex((current) => current - 1)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {stepIndex === 0 ? (
              'Skip'
            ) : (
              <>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </>
            )}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
            <button
              type="button"
              onClick={() => {
                if (stepIndex === TOUR_STEPS.length - 1) finishTour();
                else setStepIndex((current) => current + 1);
              }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {stepIndex === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
              {stepIndex < TOUR_STEPS.length - 1 && (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
