'use client';

import * as React from 'react';
import { ArrowUp, FileSearch, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  api,
  ApiError,
  type ChatConversation,
  type ChatHistoryMessage,
  type ChatSource,
  type DocumentSummary,
} from '@/lib/api';
import { cn } from '@/lib/utils';

interface IMessage extends ChatHistoryMessage {
  isError?: boolean;
}

interface ChatComponentProps {
  documents: DocumentSummary[];
  conversation: ChatConversation | null;
  isChatsLoaded: boolean;
  onConversationChange: (chat: ChatConversation) => void;
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

const ChatComponent: React.FC<ChatComponentProps> = ({
  documents,
  conversation,
  isChatsLoaded,
  onConversationChange,
}) => {
  const [message, setMessage] = React.useState('');
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [selectedSources, setSelectedSources] = React.useState<string[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [isSavingScope, setIsSavingScope] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const conversationId = conversation?.conversationId || null;
  const activeConversationId = React.useRef(conversationId);
  activeConversationId.current = conversationId;
  const selectedSourcesKey = (conversation?.selectedSources || []).join('\u0000');

  React.useEffect(() => {
    setSelectedSources(conversation?.selectedSources || []);
    setMessages([]);
    setHistoryError(null);
    setIsHistoryLoaded(false);
    setMessage('');
    setIsSending(false);

    if (!conversationId) return;
    let cancelled = false;
    api.getChatHistory(conversationId)
      .then(({ messages: history }) => {
        if (!cancelled) {
          setMessages(history);
          setIsHistoryLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHistoryError(
            err instanceof ApiError
              ? `Could not load chat history: ${err.message}`
              : 'Could not load chat history.'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, selectedSourcesKey]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const updateSelectedSources = async (source: string, checked: boolean) => {
    if (!conversation || isSavingScope || isSending || conversation.hasMessages) return;
    const nextSources = checked
      ? [...selectedSources, source]
      : selectedSources.filter((item) => item !== source);
    setSelectedSources(nextSources);
    setIsSavingScope(true);
    setHistoryError(null);
    try {
      const { chat } = await api.updateChat(conversation.conversationId, nextSources);
      onConversationChange(chat);
    } catch (err) {
      setSelectedSources(conversation.selectedSources);
      setHistoryError(err instanceof ApiError ? err.message : 'Could not save this chat’s PDF scope.');
    } finally {
      setIsSavingScope(false);
    }
  };

  const handleSendChatMessage = async () => {
    const trimmed = message.trim();
    const currentConversation = conversation;
    if (
      !trimmed ||
      isSending ||
      !conversationId ||
      !currentConversation ||
      !isHistoryLoaded ||
      !selectedSources.length
    ) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setMessage('');
    setIsSending(true);
    try {
      const data = await api.chat(trimmed, conversationId);
      if (activeConversationId.current === conversationId) {
        onConversationChange({
          ...currentConversation,
          title: currentConversation.title === 'New chat'
            ? trimmed.replace(/\s+/g, ' ').slice(0, 60) || 'New chat'
            : currentConversation.title,
          hasMessages: true,
          updatedAt: new Date().toISOString(),
        });
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            sources: data.sources,
          },
        ]);
      }
    } catch (err) {
      if (activeConversationId.current === conversationId) {
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
      }
    } finally {
      if (activeConversationId.current === conversationId) setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {conversation?.title || 'PDF Chat'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {conversation
              ? 'This chat only searches its selected PDFs'
              : 'Create a chat and choose the PDFs it can use'}
          </p>
        </div>
        {conversation && (
          <details className="group relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
              <FileSearch className="size-4 text-primary" />
              <span>{selectedSources.length} PDFs selected</span>
              <span className="text-muted-foreground">▾</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
              <p className="mb-2 text-xs text-muted-foreground">
                Only selected PDFs are searched. The scope locks after the first message.
              </p>
              {documents.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Upload PDFs in the library first.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {documents.map((doc) => (
                    <li key={doc.source}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(doc.source)}
                          disabled={isSavingScope || isSending || conversation.hasMessages}
                          onChange={(event) =>
                            updateSelectedSources(doc.source, event.target.checked)
                          }
                          className="accent-primary"
                        />
                        <span className="min-w-0 flex-1 truncate" title={doc.source}>
                          {doc.source}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {!isChatsLoaded ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading chats…
          </div>
        ) : !conversation ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageCircle className="size-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Start a new chat</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Each conversation has its own history and searches only the PDFs you select.
              </p>
            </div>
          </div>
        ) : !isHistoryLoaded ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {historyError || 'Loading conversation…'}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageCircle className="size-8 text-muted-foreground/50" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {selectedSources.length
                ? conversation.hasMessages
                  ? 'Continue this conversation using its original PDF scope.'
                  : 'Ask a question about the PDFs selected for this chat.'
                : 'Select one or more PDFs using the menu above to begin.'}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((m, index) => (
              <div
                key={index}
                className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed',
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
                  <div className="flex max-w-[90%] flex-wrap gap-1.5">
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
                  Searching selected PDFs…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {conversation && (
        <div className="border-t border-border bg-card px-6 py-4">
          {historyError && (
            <p role="alert" className="mx-auto mb-2 max-w-3xl text-xs text-destructive">
              {historyError}
            </p>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedSources.length
                  ? 'Message about the selected PDFs…'
                  : 'Select PDFs for this chat first…'
              }
              disabled={!isHistoryLoaded || !selectedSources.length || isSavingScope}
              rows={1}
              className="max-h-40 flex-1"
            />
            <Button
              onClick={handleSendChatMessage}
              disabled={!message.trim() || isSending || !isHistoryLoaded || !selectedSources.length}
              size="icon"
              aria-label="Send message"
            >
              {isSending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
};

export default ChatComponent;
