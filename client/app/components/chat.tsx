'use client';

import * as React from 'react';
import { ArrowUp, FileSearch, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type ChatSource, type DocumentSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

interface IMessage {
  role: 'assistant' | 'user';
  content: string;
  sources?: ChatSource[];
  isError?: boolean;
}

interface ChatComponentProps {
  hasDocuments: boolean;
  documentCount: number;
}

const SourceChip: React.FC<{ source: ChatSource }> = ({ source }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 font-mono text-[11px] text-primary"
    title={source.snippet}
  >
    <FileSearch className="size-3" />
    {source.source.length > 28 ? `${source.source.slice(0, 25)}…` : source.source}
    <span className="text-primary/60">· chunk {source.chunkIndex}/{source.totalChunks}</span>
  </span>
);

const ChatComponent: React.FC<ChatComponentProps> = ({ hasDocuments, documentCount }) => {
  const [message, setMessage] = React.useState('');
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendChatMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setMessage('');
    setIsSending(true);

    try {
      const data = await api.chat(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.excerpt ? `${data.message}\n\n${data.excerpt}` : data.message,
          sources: data.sources,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            err instanceof ApiError
              ? err.message
              : 'Something went wrong reaching the server.',
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Reading Room</h2>
          <p className="text-xs text-muted-foreground">Ask questions about your uploaded PDFs</p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
          {documentCount} {documentCount === 1 ? 'document' : 'documents'} indexed
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageCircle className="size-8 text-muted-foreground/50" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {hasDocuments
                ? 'Ask a question about the documents in your library.'
                : 'Upload a PDF in the Library panel, then ask a question about it here.'}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {messages.map((m, index) => (
              <div
                key={index}
                className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : m.isError
                        ? 'rounded-bl-sm border border-destructive/30 bg-destructive-foreground text-destructive'
                        : 'rounded-bl-sm border border-border bg-card'
                  )}
                >
                  {m.content}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap gap-1.5">
                    {m.sources.map((s, i) => (
                      <SourceChip key={`${s.source}-${s.chunkIndex}-${i}`} source={s} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="flex items-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching your documents…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasDocuments ? 'Ask something about your PDFs…' : 'Upload a PDF first…'}
            rows={1}
            className="max-h-40 flex-1"
          />
          <Button
            onClick={handleSendChatMessage}
            disabled={!message.trim() || isSending}
            size="icon"
            aria-label="Send message"
          >
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
export default ChatComponent;
