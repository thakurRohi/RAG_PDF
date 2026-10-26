'use client';

import * as React from 'react';
import {
  ArrowUp,
  Check,
  Copy,
  FileSearch,
  Loader2,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from './toast-provider';
import {
  api,
  ApiError,
  type ChatConversation,
  type ChatHistoryMessage,
  type ChatSource,
  type DocumentSummary,
  type EmbeddingKeyMode,
} from '@/lib/api';
import { cn } from '@/lib/utils';

interface IMessage extends ChatHistoryMessage {
  isError?: boolean;
}

interface ChatComponentProps {
  documents: DocumentSummary[];
  embeddingKeyMode: EmbeddingKeyMode;
  onRefreshJinaApiKeys: () => Promise<void>;
  conversation: ChatConversation | null;
  isChatsLoaded: boolean;
  onConversationChange: (chat: ChatConversation) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  headerActions: React.ReactNode;
}

const SourceChip: React.FC<{ source: ChatSource }> = ({ source }) => (
  <details className="group/source max-w-full">
    <summary className="inline-flex max-w-full cursor-pointer list-none items-center gap-1.5 rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 font-mono text-[11px] text-primary transition-colors hover:border-primary/40 hover:bg-primary/15 [&::-webkit-details-marker]:hidden">
      <FileSearch className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate" title={source.source}>
        {source.source.length > 28 ? `${source.source.slice(0, 25)}…` : source.source}
      </span>
      <span className="shrink-0 text-primary/60">
        · chunk {source.chunkIndex}/{source.totalChunks}
      </span>
    </summary>
    <div className="mt-2 max-w-xl rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">{source.source}</p>
      <p>{source.snippet || 'No excerpt is available for this source.'}</p>
    </div>
  </details>
);

const SUGGESTED_QUESTIONS = [
  'Summarize the key points',
  'What are the main takeaways?',
  'What should I pay attention to?',
];

const renderInlineMarkdown = (text: string): React.ReactNode[] =>
  text.split(/(\*\*.+?\*\*|__.+?__|`.+?`|\*[^*\n]+\*|_[^_\n]+_)/g)
    .filter(Boolean)
    .map((part, index) => {
      if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }
      return part;
    });

const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => {
  const blocks: React.ReactNode[] = [];
  const lines = content.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="mb-3 last:mb-0">
        {renderInlineMarkdown(paragraph.join(' '))}
      </p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const List = listType;
    blocks.push(
      <List
        key={`list-${blocks.length}`}
        className={cn(
          'mb-3 space-y-1.5 pl-5 last:mb-0',
          listType === 'ul' ? 'list-disc' : 'list-decimal'
        )}
      >
        {listItems.map((item, index) => (
          <li key={index} className="pl-1">
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </List>
    );
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const listItem = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const className = level === 1
        ? 'mb-2 mt-4 text-lg font-semibold first:mt-0'
        : level === 2
          ? 'mb-2 mt-4 text-base font-semibold first:mt-0'
          : 'mb-1.5 mt-3 text-sm font-semibold first:mt-0';
      const headingContent = renderInlineMarkdown(heading[2]);
      blocks.push(
        level === 1
          ? <h2 key={`h-${blocks.length}`} className={className}>{headingContent}</h2>
          : level === 2
            ? <h3 key={`h-${blocks.length}`} className={className}>{headingContent}</h3>
            : <h4 key={`h-${blocks.length}`} className={className}>{headingContent}</h4>
      );
    } else if (listItem) {
      flushParagraph();
      const nextListType = listItem[2] ? 'ol' : 'ul';
      if (listType && listType !== nextListType) flushList();
      listType = nextListType;
      listItems.push(listItem[3]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();

  return <div className="break-words leading-7">{blocks}</div>;
};

const ChatComponent: React.FC<ChatComponentProps> = ({
  documents,
  embeddingKeyMode,
  onRefreshJinaApiKeys,
  conversation,
  isChatsLoaded,
  onConversationChange,
  isSidebarOpen,
  onToggleSidebar,
  headerActions,
}) => {
  const { toast } = useToast();
  const [message, setMessage] = React.useState('');
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [selectedSources, setSelectedSources] = React.useState<string[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [isSavingScope, setIsSavingScope] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = React.useState<number | null>(null);
  const [copyErrorIndex, setCopyErrorIndex] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const conversationId = conversation?.conversationId || null;
  const activeConversationId = React.useRef(conversationId);
  activeConversationId.current = conversationId;
  const selectedSourcesKey = (conversation?.selectedSources || []).join('\u0000');

  React.useEffect(() => {
    setSelectedSources(selectedSourcesKey ? selectedSourcesKey.split('\u0000') : []);
    setMessages([]);
    setHistoryError(null);
    setIsHistoryLoaded(false);
    setMessage('');
    setIsSending(false);
    setCopiedMessageIndex(null);
    setCopyErrorIndex(null);

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
      const message = err instanceof ApiError ? err.message : 'Could not save this chat’s PDF scope.';
      setHistoryError(message);
      toast({ title: 'Could not update PDF selection', description: message, variant: 'error' });
    } finally {
      setIsSavingScope(false);
    }
  };

  const handleSendChatMessage = async (
    prompt = message,
    appendUserMessage = true,
    retryErrorIndex?: number
  ) => {
    const trimmed = prompt.trim();
    const currentConversation = conversation;
    if (
      !trimmed ||
      isSending ||
      !conversationId ||
      !currentConversation ||
      !isHistoryLoaded ||
      !selectedSources.length
    ) return;

    if (appendUserMessage) {
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      setMessage('');
    } else if (retryErrorIndex !== undefined) {
      setMessages((prev) => prev.filter((_, index) => index !== retryErrorIndex));
    }
    setIsSending(true);
    try {
      const data = await api.chat(trimmed, conversationId, {
        mode: embeddingKeyMode,
      });
      await onRefreshJinaApiKeys();
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
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : 'Something went wrong reaching the server.';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: errorMessage,
            isError: true,
          },
        ]);
        toast({
          title: 'Could not get an answer',
          description: errorMessage,
          variant: 'error',
        });
      }
    } finally {
      if (activeConversationId.current === conversationId) setIsSending(false);
    }
  };

  const copyAnswer = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(index);
      setCopyErrorIndex(null);
      toast({ title: 'Answer copied', variant: 'success' });
      window.setTimeout(() => {
        setCopiedMessageIndex((current) => current === index ? null : current);
      }, 1800);
    } catch {
      setCopyErrorIndex(index);
      setCopiedMessageIndex(null);
      toast({
        title: 'Could not copy answer',
        description: 'Your browser may block clipboard access on this page.',
        variant: 'error',
      });
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
      <header className="z-10 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2 sm:min-h-16 sm:gap-4 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar and PDF upload'}
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar and PDF upload'}
            aria-expanded={isSidebarOpen}
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-1.5"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            )}
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {conversation?.title || 'PDF Chat'}
            </h2>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {conversation
                ? 'Uses selected PDFs when relevant, plus general knowledge'
                : 'Create a chat and choose the PDFs it can use'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {conversation && (
            <details className="group relative">
              <summary className="flex max-w-32 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-card px-2 py-2 text-xs hover:bg-secondary sm:max-w-none sm:gap-2 sm:px-3 sm:text-sm">
                <FileSearch className="size-4 text-primary" />
                <span className="truncate">{selectedSources.length} PDFs</span>
                <span className="text-muted-foreground">▾</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 max-h-[min(70dvh,18rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg sm:max-h-72 sm:w-72">
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
          {headerActions}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        {!isChatsLoaded ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading chats…
          </div>
        ) : !conversation ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <MessageCircle className="size-8 text-primary/60" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Your next good question starts here</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Open the library to choose a PDF and start a chat grounded in what you&apos;re reading.
              </p>
            </div>
            {!isSidebarOpen && (
              <Button variant="outline" size="sm" onClick={onToggleSidebar}>
                Open your library
              </Button>
            )}
          </div>
        ) : !isHistoryLoaded ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {historyError || 'Loading conversation…'}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {selectedSources.length
                ? <Sparkles className="size-5" aria-hidden="true" />
                : <MessageCircle className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {selectedSources.length
                  ? conversation.hasMessages
                    ? 'Ready when you are'
                    : 'What would you like to know?'
                  : documents.length
                    ? 'Choose PDFs for this chat'
                    : 'Add your first PDF'}
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {selectedSources.length
                  ? 'Try a question below, or write your own.'
                  : documents.length
                    ? 'Select one or more documents from the PDF menu above to get started.'
                    : 'Upload a PDF to your library, then select it here to start asking questions.'}
              </p>
            </div>
            {!selectedSources.length && !isSidebarOpen ? (
              <Button variant="outline" size="sm" onClick={onToggleSidebar}>
                {documents.length ? 'Open library and choose PDFs' : 'Open library to upload a PDF'}
              </Button>
            ) : selectedSources.length ? (
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void handleSendChatMessage(question)}
                    disabled={isSending || !isHistoryLoaded}
                    className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-6">
            {messages.map((m, index) => (
              <div
                key={index}
                className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[94%] rounded-2xl px-3 py-2.5 text-sm sm:max-w-[90%] sm:px-4 sm:py-3',
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : m.isError
                        ? 'rounded-bl-sm border border-destructive/30 bg-destructive-foreground text-destructive'
                        : 'rounded-bl-sm border border-border bg-card'
                  )}
                >
                  {m.role === 'assistant' && !m.isError
                    ? <MarkdownMessage content={m.content} />
                    : m.content}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="flex max-w-[90%] flex-wrap gap-1.5">
                    {m.sources.map((s, i) => (
                      <SourceChip key={`${s.source}-${s.chunkIndex}-${i}`} source={s} />
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && !m.isError && (
                  <button
                    type="button"
                    onClick={() => void copyAnswer(m.content, index)}
                    aria-label={copiedMessageIndex === index ? 'Answer copied' : 'Copy answer'}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copiedMessageIndex === index
                      ? <Check className="size-3.5 text-primary" aria-hidden="true" />
                      : <Copy className="size-3.5" aria-hidden="true" />}
                    {copiedMessageIndex === index ? 'Copied' : 'Copy'}
                  </button>
                )}
                {m.isError && (() => {
                  const previousUserMessage = messages
                    .slice(0, index)
                    .reverse()
                    .find((previousMessage) => previousMessage.role === 'user');
                  return previousUserMessage ? (
                    <button
                      type="button"
                      onClick={() => void handleSendChatMessage(previousUserMessage.content, false, index)}
                      disabled={isSending}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <RotateCw className="size-3.5" aria-hidden="true" />
                      Try again
                    </button>
                  ) : null;
                })()}
                {copyErrorIndex === index && (
                  <p role="status" className="text-xs text-destructive">
                    Could not copy. Please select and copy the answer.
                  </p>
                )}
              </div>
            ))}
            {isSending && (
              <div className="flex items-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground sm:px-4 sm:text-sm">
                  <Loader2 className="size-3.5 animate-spin" />
                  Thinking through your question…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {conversation && (
        <div className="border-t border-border bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
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
              onClick={() => void handleSendChatMessage()}
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
