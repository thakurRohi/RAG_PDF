'use client';

import * as React from 'react';
import { Check, ChevronDown, LogOut, Plus, Trash2, UserRound } from 'lucide-react';
import {
  api,
  ApiError,
  type EmbeddingKeyMode,
  type JinaApiKeySummary,
  type JinaApiKeysState,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import ThemeToggle from './theme-toggle';
import { useToast } from './toast-provider';

const JINA_INITIAL_TOKEN_BASELINE = 1_000_000;

interface ProfileMenuProps {
  userEmail: string;
  authError: string | null;
  onSignOut: () => void;
  embeddingKeyMode: EmbeddingKeyMode;
  onEmbeddingKeyModeChange: (mode: EmbeddingKeyMode) => void;
  jinaApiKey: string;
  onJinaApiKeyChange: (key: string) => void;
  jinaApiKeys: JinaApiKeySummary[];
  activeJinaKeyId: string | null;
  appDefaultJinaUsage: JinaApiKeysState['appDefaultJinaUsage'];
  onJinaApiKeysChange: (state: JinaApiKeysState) => void;
  isJinaKeyStatusLoading: boolean;
  jinaKeyStatusError: string | null;
  onJinaKeyStatusErrorChange: (error: string | null) => void;
}

export default function ProfileMenu({
  userEmail,
  authError,
  onSignOut,
  embeddingKeyMode,
  onEmbeddingKeyModeChange,
  jinaApiKey,
  onJinaApiKeyChange,
  jinaApiKeys,
  activeJinaKeyId,
  appDefaultJinaUsage,
  onJinaApiKeysChange,
  isJinaKeyStatusLoading,
  jinaKeyStatusError,
  onJinaKeyStatusErrorChange,
}: ProfileMenuProps) {
  const { toast } = useToast();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const deleteDialogRef = React.useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isKeyDropdownOpen, setIsKeyDropdownOpen] = React.useState(false);
  const [showAddKeyForm, setShowAddKeyForm] = React.useState(false);
  const [keyToDelete, setKeyToDelete] = React.useState<JinaApiKeySummary | null>(null);
  const [keyLabel, setKeyLabel] = React.useState('');
  const [message, setMessage] = React.useState<{ text: string; isError: boolean } | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const baselineLabel = JINA_INITIAL_TOKEN_BASELINE.toLocaleString();

  React.useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (keyToDelete && !dialog.open) dialog.showModal();
    else if (!keyToDelete && dialog.open) dialog.close();
  }, [keyToDelete]);

  React.useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const selectAppKey = async () => {
    setIsBusy(true);
    setMessage(null);
    onJinaKeyStatusErrorChange(null);
    try {
      const state = await api.setActiveJinaApiKey(null);
      onJinaApiKeysChange(state);
      onEmbeddingKeyModeChange('app');
      toast({ title: 'Using the app embedding key', variant: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : 'Could not select the app’s key.',
        isError: true,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const selectJinaKey = async (keyId: string) => {
    setIsBusy(true);
    setMessage(null);
    onJinaKeyStatusErrorChange(null);
    try {
      const state = await api.setActiveJinaApiKey(keyId);
      onJinaApiKeysChange(state);
      onEmbeddingKeyModeChange('custom');
      toast({ title: 'Embedding key updated', variant: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : 'Could not select this Jina key.',
        isError: true,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const selectCustomMode = async () => {
    onJinaKeyStatusErrorChange(null);
    setMessage(null);
    if (activeJinaKeyId) {
      onEmbeddingKeyModeChange('custom');
      return;
    }
    if (jinaApiKeys.length) {
      await selectJinaKey(jinaApiKeys[0].id);
      return;
    }
    onEmbeddingKeyModeChange('custom');
  };

  const saveJinaKey = async () => {
    const key = jinaApiKey.trim();
    const label = keyLabel.trim();
    if (!key || !label || isBusy) return;
    setIsBusy(true);
    setMessage(null);
    onJinaKeyStatusErrorChange(null);
    try {
      const state = await api.saveJinaApiKey(label, key);
      onJinaApiKeysChange(state);
      onEmbeddingKeyModeChange('custom');
      onJinaApiKeyChange('');
      setKeyLabel('');
      setShowAddKeyForm(false);
      setMessage(null);
      toast({
        title: 'API key saved and verified',
        description: `“${label}” is ready to use.`,
        variant: 'success',
      });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : 'Could not save this Jina API key.',
        isError: true,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const deleteJinaKey = async () => {
    if (!keyToDelete || isBusy) return;
    const key = keyToDelete;
    setIsBusy(true);
    setMessage(null);
    try {
      const state = await api.deleteJinaApiKey(key.id);
      onJinaApiKeysChange(state);
      onEmbeddingKeyModeChange(state.activeKeyId ? 'custom' : 'app');
      setKeyToDelete(null);
      setMessage(null);
      toast({
        title: 'API key deleted',
        description: `“${key.label}” and its tracked usage were removed.`,
        variant: 'success',
      });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : 'Could not delete this Jina key.',
        isError: true,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const requestDeleteJinaKey = (key: JinaApiKeySummary) => {
    setIsKeyDropdownOpen(false);
    setKeyToDelete(key);
    setMessage(null);
  };

  const initials = userEmail.trim().charAt(0).toUpperCase();

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        data-tour="profile"
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {initials || <UserRound className="size-4" aria-hidden="true" />}
      </button>
      {isOpen && (
        <section
          role="dialog"
          aria-label="Profile and settings"
          className="absolute right-0 z-30 mt-2 max-h-[min(80vh,42rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Profile</p>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={userEmail}>
                {userEmail}
              </p>
            </div>
            <ThemeToggle />
          </header>

          {(authError || jinaKeyStatusError) && (
            <div className="space-y-1 py-3">
              {authError && <p role="alert" className="text-xs text-destructive">{authError}</p>}
              {jinaKeyStatusError && (
                <p role="alert" className="text-xs text-destructive">{jinaKeyStatusError}</p>
              )}
            </div>
          )}

          <fieldset disabled={isJinaKeyStatusLoading} className="space-y-3 py-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Embedding API key
            </legend>
            {isJinaKeyStatusLoading && (
              <p className="text-xs text-muted-foreground">Checking saved key…</p>
            )}
            <div className="relative">
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={isKeyDropdownOpen}
                disabled={isBusy || isJinaKeyStatusLoading}
                onClick={() => setIsKeyDropdownOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
              >
                <span className="min-w-0 truncate">
                  {embeddingKeyMode === 'app'
                    ? 'Use the app’s key'
                    : jinaApiKeys.find((key) => key.id === activeJinaKeyId)?.label
                      || 'Use my own API key'}
                </span>
                <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
              </button>
              {isKeyDropdownOpen && (
                <div
                  role="group"
                  aria-label="Embedding API keys"
                  className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"
                >
                  <button
                    type="button"
                    aria-pressed={embeddingKeyMode === 'app'}
                    disabled={isBusy}
                    onClick={() => {
                      setIsKeyDropdownOpen(false);
                      setShowAddKeyForm(false);
                      void selectAppKey();
                    }}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">Use the app’s key</span>
                      <span className="block text-xs text-muted-foreground">
                        Configured provider and fallback
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {appDefaultJinaUsage.totalTokens.toLocaleString()} tokens used through Jina
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {appDefaultJinaUsage.totalTokens.toLocaleString()} / {baselineLabel} initial tokens
                      </span>
                      <span
                        role="progressbar"
                        aria-label="App-key Jina token usage against the initial token baseline"
                        aria-valuemin={0}
                        aria-valuemax={JINA_INITIAL_TOKEN_BASELINE}
                        aria-valuenow={Math.min(
                          appDefaultJinaUsage.totalTokens,
                          JINA_INITIAL_TOKEN_BASELINE
                        )}
                        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(
                              (appDefaultJinaUsage.totalTokens / JINA_INITIAL_TOKEN_BASELINE) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {appDefaultJinaUsage.indexingTokens.toLocaleString()} indexing ·{' '}
                        {appDefaultJinaUsage.searchTokens.toLocaleString()} search
                      </span>
                    </span>
                    {embeddingKeyMode === 'app' && <Check className="mt-0.5 size-4 shrink-0" />}
                  </button>
                  {jinaApiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-secondary"
                    >
                      <button
                        type="button"
                        aria-pressed={activeJinaKeyId === key.id && embeddingKeyMode === 'custom'}
                        disabled={isBusy}
                        onClick={() => {
                          setIsKeyDropdownOpen(false);
                          setShowAddKeyForm(false);
                          void selectJinaKey(key.id);
                        }}
                        className="flex min-w-0 flex-1 items-start gap-2 text-left text-sm disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{key.label}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {key.maskedKey}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {key.usage.totalTokens.toLocaleString()} tokens used
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {key.usage.totalTokens.toLocaleString()} / {baselineLabel} initial tokens
                          </span>
                          <span
                            role="progressbar"
                            aria-label={`${key.label} app-tracked token usage against the initial Jina token baseline`}
                            aria-valuemin={0}
                            aria-valuemax={JINA_INITIAL_TOKEN_BASELINE}
                            aria-valuenow={Math.min(
                              key.usage.totalTokens,
                              JINA_INITIAL_TOKEN_BASELINE
                            )}
                            className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.min(
                                  (key.usage.totalTokens / JINA_INITIAL_TOKEN_BASELINE) * 100,
                                  100
                                )}%`,
                              }}
                            />
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {key.usage.indexingTokens.toLocaleString()} indexing ·{' '}
                            {key.usage.searchTokens.toLocaleString()} search ·{' '}
                            {key.usage.validationTokens.toLocaleString()} validation
                          </span>
                        </span>
                        {activeJinaKeyId === key.id && embeddingKeyMode === 'custom' && (
                          <Check className="mt-0.5 size-4 shrink-0" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteJinaKey(key)}
                        disabled={isBusy}
                        className="shrink-0 px-1 py-0.5 text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsKeyDropdownOpen(false);
                      setShowAddKeyForm(true);
                      onJinaKeyStatusErrorChange(null);
                      setMessage(null);
                      void selectCustomMode();
                    }}
                    className="flex w-full items-center gap-2 rounded-md border-t border-border px-2 py-2 text-left text-sm text-primary hover:bg-secondary"
                  >
                    <Plus className="size-4" />
                    Use my own API key
                  </button>
                </div>
              )}
            </div>

            {embeddingKeyMode === 'app' && (
              <p className="text-xs text-muted-foreground">
                Uses the app’s configured embedding provider and fallback. App-key usage counts
                Jina tokens reported for your requests; Gemini usage is not included.
              </p>
            )}
            {embeddingKeyMode === 'custom' && (
              <p className="text-xs text-muted-foreground">
                Jina usage is billed to your account. Your key is encrypted on the server until you delete it.
              </p>
            )}

            {embeddingKeyMode === 'custom' && (showAddKeyForm || jinaApiKeys.length === 0) && (
              <div className="space-y-2 border-t border-border pt-3">
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Key label
                  <input
                    type="text"
                    maxLength={50}
                    value={keyLabel}
                    disabled={isBusy}
                    onChange={(event) => setKeyLabel(event.target.value)}
                    placeholder="e.g. Personal, Work"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={jinaApiKey}
                  disabled={isBusy}
                  onChange={(event) => {
                    onJinaApiKeyChange(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="Add a Jina API key"
                  aria-label="Jina API key"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={saveJinaKey}
                  disabled={!jinaApiKey.trim() || !keyLabel.trim() || isBusy}
                  className="w-full rounded-md border border-border px-3 py-2 text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBusy ? 'Saving…' : 'Save and verify key'}
                </button>
              </div>
            )}
            {(embeddingKeyMode === 'custom' || message) && (
              <div className="space-y-3 border-t border-border pt-3">
                {message && (
                  <p
                    role={message.isError ? 'alert' : 'status'}
                    className={cn(
                      'text-xs',
                      message.isError ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {message.text}
                  </p>
                )}
                {embeddingKeyMode === 'custom' && <p className="text-xs text-muted-foreground">
                  The count is tracked by this app against an initial 1,000,000-token baseline,
                  not your live Jina balance. Usage outside this app and top-ups are not included.
                  {' '}
                  <a
                    href="https://jina.ai/api-dashboard/key-manager"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    View Jina dashboard
                  </a>
                </p>}
              </div>
            )}
          </fieldset>

          <footer className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Account settings</span>
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Sign out
              <LogOut className="size-3.5" aria-hidden="true" />
            </button>
          </footer>
        </section>
      )}
      <dialog
        ref={deleteDialogRef}
        aria-labelledby="delete-jina-key-title"
        aria-describedby="delete-jina-key-description"
        onCancel={(event) => {
          event.preventDefault();
          if (!isBusy) setKeyToDelete(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !isBusy) setKeyToDelete(null);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="delete-jina-key-title" className="text-base font-semibold">
                Delete this API key?
              </h2>
              <p id="delete-jina-key-description" className="mt-1 text-sm text-muted-foreground">
                “{keyToDelete?.label}” and its tracked token usage will be permanently deleted.
                {keyToDelete?.id === activeJinaKeyId
                  ? ' The app key will be selected unless another saved Jina key is available.'
                  : ''}
              </p>
            </div>
          </div>
          {message?.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {message.text}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setKeyToDelete(null)}
              disabled={isBusy}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void deleteJinaKey()}
              disabled={isBusy || !keyToDelete}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {isBusy && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
              Delete API key
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
