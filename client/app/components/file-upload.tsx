'use client';

import * as React from 'react';
import { FileText, Loader2, MessageSquare, MessageSquarePlus, Trash2, UploadCloud } from 'lucide-react';
import { api, ApiError, type ChatConversation, type DocumentSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

interface LibraryPanelProps {
  documents: DocumentSummary[];
  onDocumentsChange: (docs: DocumentSummary[]) => void;
  chats: ChatConversation[];
  activeChatId: string | null;
  chatsError: string | null;
  onSelectChat: (conversationId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (conversationId: string) => void;
}

const formatBytesFriendlyName = (name: string) => {
  // Uploaded filenames are shown as-is; just guard against absurd length.
  return name.length > 42 ? `${name.slice(0, 39)}…` : name;
};

const LibraryPanel: React.FC<LibraryPanelProps> = ({
  documents,
  onDocumentsChange,
  chats,
  activeChatId,
  chatsError,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [deletingSource, setDeletingSource] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refreshDocuments = React.useCallback(async () => {
    try {
      const { documents: docs } = await api.listDocuments();
      onDocumentsChange(docs);
    } catch {
      // Silent — the panel simply keeps its last known list.
    }
  }, [onDocumentsChange]);

  React.useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const uploadFile = async (file: File) => {
    setError(null);

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.');
      return;
    }

    setIsUploading(true);
    try {
      await api.uploadPdf(file);
      await refreshDocuments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (source: string) => {
    setDeletingSource(source);
    setError(null);
    try {
      await api.deleteDocument(source);
      onDocumentsChange(documents.filter((d) => d.source !== source));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this document.');
    } finally {
      setDeletingSource(null);
    }
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-card">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-base font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload PDFs, then ask questions about them.
        </p>
      </div>

      <div className="px-5">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
            isDragging
              ? 'border-primary bg-primary-soft'
              : 'border-border hover:border-primary/50 hover:bg-secondary'
          )}
        >
          {isUploading ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <UploadCloud className="size-5 text-muted-foreground" />
          )}
          <div className="text-sm font-medium">
            {isUploading ? 'Uploading…' : 'Drop a PDF here or click to browse'}
          </div>
          <p className="text-xs text-muted-foreground">PDF only, up to 20MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <section className="mt-5 px-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chats
          </h2>
          <button
            onClick={onNewChat}
            aria-label="New chat"
            title="New chat"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <MessageSquarePlus className="size-4" />
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              Start a new chat to ask about selected PDFs.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {chats.map((chat) => (
                <li key={chat.conversationId} className="group flex items-center">
                  <button
                    onClick={() => onSelectChat(chat.conversationId)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                      activeChatId === chat.conversationId
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                    )}
                  >
                    <MessageSquare className="size-4 shrink-0" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <button
                    onClick={() => onDeleteChat(chat.conversationId)}
                    aria-label={`Delete chat ${chat.title}`}
                    title="Delete chat"
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {chatsError && (
          <p role="alert" className="mt-2 px-1 text-xs text-destructive">
            {chatsError}
          </p>
        )}
      </section>

      <section className="mt-4 flex min-h-0 flex-1 flex-col border-t border-border px-5 pb-5">
        <h2 className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          PDF library
        </h2>
        <div className="mt-1 flex-1 overflow-y-auto">
          {documents.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              No documents yet. Upload one to get started.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1.5">
              {documents.map((doc) => (
                <li
                  key={doc.source}
                  className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-secondary"
                >
                  <FileText className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={doc.source}>
                      {formatBytesFriendlyName(doc.source)}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {doc.chunks} {doc.chunks === 1 ? 'chunk' : 'chunks'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.source)}
                    disabled={deletingSource === doc.source}
                    aria-label={`Remove ${doc.source}`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                  >
                    {deletingSource === doc.source ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </aside>
  );
};

export default LibraryPanel;
