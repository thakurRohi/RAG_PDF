'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
};

const ToastItem: React.FC<{
  message: ToastMessage;
  onDismiss: (id: number) => void;
}> = ({ message, onDismiss }) => {
  React.useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(message.id), 5000);
    return () => window.clearTimeout(timeout);
  }, [message.id, onDismiss]);

  const Icon =
    message.variant === 'success'
      ? CheckCircle2
      : message.variant === 'error'
        ? AlertCircle
        : Info;

  return (
    <li
      role={message.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xl shadow-black/10',
        message.variant === 'success' && 'border-primary/30',
        message.variant === 'error' && 'border-destructive/35',
        message.variant === 'info' && 'border-border'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          message.variant === 'success' && 'text-primary',
          message.variant === 'error' && 'text-destructive',
          message.variant === 'info' && 'text-muted-foreground'
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{message.title}</p>
        {message.description && (
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {message.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(message.id)}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </li>
  );
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const toast = React.useCallback((message: Omit<ToastMessage, 'id'>) => {
    const id = nextId.current++;
    setMessages((current) => [...current.slice(-3), { ...message, id }]);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-4 sm:justify-end sm:px-6">
        <ul
          aria-label="Notifications"
          className="flex w-full max-w-sm flex-col gap-2"
          aria-live="polite"
          aria-relevant="additions removals"
        >
          {messages.map((message) => (
            <ToastItem key={message.id} message={message} onDismiss={dismiss} />
          ))}
        </ul>
      </div>
    </ToastContext.Provider>
  );
}
