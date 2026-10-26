'use client';

import * as React from 'react';
import LibraryPanel from './components/file-upload';
import ChatComponent from './components/chat';
import ProfileMenu from './components/profile-menu';
import GuidedTour from './components/guided-tour';
import {
  api,
  type ChatConversation,
  type DocumentSummary,
  type EmbeddingKeyMode,
  type JinaApiKeysState,
} from '@/lib/api';
import SignIn from './components/sign-in';
import { getSupabaseClient } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { CircleHelp } from 'lucide-react';

export default function Home() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [documents, setDocuments] = React.useState<DocumentSummary[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = React.useState(false);
  const [chats, setChats] = React.useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [chatsLoaded, setChatsLoaded] = React.useState(false);
  const [chatsError, setChatsError] = React.useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isGuidedTourOpen, setIsGuidedTourOpen] = React.useState(false);
  const [embeddingKeyMode, setEmbeddingKeyMode] = React.useState<EmbeddingKeyMode>('app');
  const [jinaApiKey, setJinaApiKey] = React.useState('');
  const [jinaApiKeys, setJinaApiKeys] = React.useState<JinaApiKeysState>({
    keys: [],
    activeKeyId: null,
    appDefaultJinaUsage: {
      indexingTokens: 0,
      searchTokens: 0,
      validationTokens: 0,
      totalTokens: 0,
    },
  });
  const [isJinaKeyStatusLoading, setIsJinaKeyStatusLoading] = React.useState(true);
  const [jinaKeyStatusError, setJinaKeyStatusError] = React.useState<string | null>(null);
  const handleDocumentsLoaded = React.useCallback(() => {
    setDocumentsLoaded(true);
  }, []);
  const chatBootstrapRef = React.useRef<{
    userId: string;
    promise: Promise<ChatConversation[]>;
  } | null>(null);
  const isCreatingChatRef = React.useRef(false);
  const locallyCreatedChatIdsRef = React.useRef(new Set<string>());
  const tourStorageKey = session?.user.id
    ? `pdf-rag-guided-tour-completed:${session.user.id}`
    : null;
  const sessionUserId = session?.user.id ?? null;
  const activeChatStorageKey = sessionUserId
    ? `pdf-rag-active-chat-id:${sessionUserId}`
    : null;

  React.useEffect(() => {
    let cancelled = false;
    let receivedAuthEvent = false;
    let subscription: { unsubscribe: () => void } | undefined;

    const initializeAuth = async () => {
      try {
        const supabase = getSupabaseClient();
        subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
          receivedAuthEvent = true;
          setSession(nextSession);
          setAuthError(null);
          setAuthLoading(false);
        }).data.subscription;
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!cancelled && !receivedAuthEvent) setSession(data.session);
      } catch (error) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : 'Could not initialize sign-in.');
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    void initializeAuth();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    setJinaApiKey('');
    setEmbeddingKeyMode('app');
    setJinaApiKeys({
      keys: [],
      activeKeyId: null,
      appDefaultJinaUsage: {
        indexingTokens: 0,
        searchTokens: 0,
        validationTokens: 0,
        totalTokens: 0,
      },
    });
    setJinaKeyStatusError(null);
    if (!sessionUserId) {
      setIsJinaKeyStatusLoading(false);
      return;
    }

    let cancelled = false;
    setIsJinaKeyStatusLoading(true);
    api.getJinaApiKeys()
      .then((state) => {
        if (cancelled) return;
        setJinaApiKeys(state);
        setEmbeddingKeyMode(state.activeKeyId ? 'custom' : 'app');
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setJinaKeyStatusError(
            error instanceof Error ? error.message : 'Could not load embedding key status.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsJinaKeyStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  const handleJinaApiKeysChange = React.useCallback((state: JinaApiKeysState) => {
    setJinaApiKeys(state);
    setEmbeddingKeyMode(state.activeKeyId ? 'custom' : 'app');
  }, []);

  const refreshJinaApiKeys = React.useCallback(async () => {
    try {
      handleJinaApiKeysChange(await api.getJinaApiKeys());
      setJinaKeyStatusError(null);
    } catch (error) {
      setJinaKeyStatusError(
        error instanceof Error ? error.message : 'Could not refresh Jina key usage.'
      );
    }
  }, [handleJinaApiKeysChange]);

  React.useEffect(() => {
    if (!sessionUserId) {
      setChatsLoaded(false);
      setChats([]);
      setDocuments([]);
      setDocumentsLoaded(false);
      setActiveChatId(null);
      chatBootstrapRef.current = null;
      return;
    }
    let cancelled = false;
    setChats([]);
    setActiveChatId(null);
    locallyCreatedChatIdsRef.current.clear();
    setChatsLoaded(false);
    setChatsError(null);

    let bootstrap = chatBootstrapRef.current;
    if (!bootstrap || bootstrap.userId !== sessionUserId) {
      const promise = (async () => {
        const { chats: savedChats } = await api.listChats();
        if (savedChats.length) return savedChats;
        const { chat } = await api.createChat();
        return [chat];
      })();
      bootstrap = { userId: sessionUserId, promise };
      chatBootstrapRef.current = bootstrap;
    }

    bootstrap.promise
      .then((savedChats) => {
        if (cancelled) return;
        setChats((current) => {
          const savedChatIds = new Set(savedChats.map((chat) => chat.conversationId));
          const localChats = current.filter(
            (chat) => chat.isPending ||
              !savedChatIds.has(chat.conversationId)
          );
          return [...localChats, ...savedChats];
        });
        const savedActiveId = activeChatStorageKey
          ? window.localStorage.getItem(activeChatStorageKey)
          : null;
        const pendingCreateIsActive =
          isCreatingChatRef.current && savedActiveId?.startsWith('pending:');
        const localChatIsActive = Boolean(
          savedActiveId && locallyCreatedChatIdsRef.current.has(savedActiveId)
        );
        const conversationsWithMessages = savedChats.filter((chat) => chat.hasMessages);
        const selectedChat = conversationsWithMessages.find(
          (chat) => chat.conversationId === savedActiveId
        ) || conversationsWithMessages[0] || savedChats[0];
        if (selectedChat && !pendingCreateIsActive && !localChatIsActive) {
          setActiveChatId(selectedChat.conversationId);
          if (activeChatStorageKey) {
            window.localStorage.setItem(activeChatStorageKey, selectedChat.conversationId);
          }
        }
        setChatsLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setChatsError(error instanceof Error ? error.message : 'Could not load chats.');
        setChatsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionUserId, activeChatStorageKey]);

  React.useEffect(() => {
    if (!tourStorageKey || !chatsLoaded || !documentsLoaded) return;
    try {
      if (!window.localStorage.getItem(tourStorageKey)) setIsGuidedTourOpen(true);
    } catch {
      setIsGuidedTourOpen(true);
    }
  }, [tourStorageKey, chatsLoaded, documentsLoaded]);

  const closeGuidedTour = React.useCallback(() => {
    if (tourStorageKey) {
      try {
        window.localStorage.setItem(tourStorageKey, 'true');
      } catch {
        // The walkthrough remains available from Help for this session.
      }
    }
    setIsGuidedTourOpen(false);
  }, [tourStorageKey]);

  const setTourSidebarOpen = React.useCallback((open: boolean) => {
    setIsSidebarOpen(open);
  }, []);

  const handleNewChat = async () => {
    if (isCreatingChatRef.current) return;
    isCreatingChatRef.current = true;
    setChatsError(null);
    const previousActiveChatId = activeChatId;
    const optimisticId = `pending:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimisticChat: ChatConversation = {
      conversationId: optimisticId,
      title: 'New chat',
      selectedSources: [],
      hasMessages: false,
      createdAt: now,
      updatedAt: now,
      isPending: true,
    };
    setChats((current) => [optimisticChat, ...current]);
    setActiveChatId(optimisticId);
    if (activeChatStorageKey) {
      window.localStorage.setItem(activeChatStorageKey, optimisticId);
    }

    try {
      const { chat } = await api.createChat();
      locallyCreatedChatIdsRef.current.add(chat.conversationId);
      setChats((current) => current.map((item) =>
        item.conversationId === optimisticId ? chat : item
      ));
      if (
        activeChatStorageKey &&
        window.localStorage.getItem(activeChatStorageKey) === optimisticId
      ) {
        setActiveChatId(chat.conversationId);
        window.localStorage.setItem(activeChatStorageKey, chat.conversationId);
      }
    } catch (error) {
      setChats((current) => current.filter((item) => item.conversationId !== optimisticId));
      if (
        activeChatStorageKey &&
        window.localStorage.getItem(activeChatStorageKey) === optimisticId
      ) {
        if (previousActiveChatId) {
          window.localStorage.setItem(activeChatStorageKey, previousActiveChatId);
        } else {
          window.localStorage.removeItem(activeChatStorageKey);
        }
        setActiveChatId(previousActiveChatId);
      }
      setChatsError(error instanceof Error ? error.message : 'Could not create a chat.');
    } finally {
      isCreatingChatRef.current = false;
    }
  };

  const handleSelectChat = (conversationId: string) => {
    setActiveChatId(conversationId);
    if (activeChatStorageKey) {
      window.localStorage.setItem(activeChatStorageKey, conversationId);
    }
  };

  const handleChatChange = (updatedChat: ChatConversation) => {
    setChats((current) =>
      current
        .map((chat) => chat.conversationId === updatedChat.conversationId ? updatedChat : chat)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
  };

  const handleDeleteChat = async (conversationId: string): Promise<boolean> => {
    setChatsError(null);
    try {
      await api.deleteChat(conversationId);
      const remainingChats = chats.filter((chat) => chat.conversationId !== conversationId);
      setChats(remainingChats);
      if (activeChatId === conversationId) {
        const nextChat = remainingChats.find((chat) => chat.hasMessages) || remainingChats[0] || null;
        setActiveChatId(nextChat?.conversationId || null);
        if (nextChat) {
          if (activeChatStorageKey) {
            window.localStorage.setItem(activeChatStorageKey, nextChat.conversationId);
          }
        } else {
          if (activeChatStorageKey) window.localStorage.removeItem(activeChatStorageKey);
          const { chat } = await api.createChat();
          setChats((current) => [chat, ...current]);
          setActiveChatId(chat.conversationId);
          if (activeChatStorageKey) {
            window.localStorage.setItem(activeChatStorageKey, chat.conversationId);
          }
        }
      }
      return true;
    } catch (error) {
      setChatsError(error instanceof Error ? error.message : 'Could not delete this chat.');
      return false;
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  if (authLoading) {
    return (
      <main
        aria-label="Loading your workspace"
        aria-busy="true"
        className="flex min-h-screen items-center justify-center px-6"
      >
        <div className="w-full max-w-sm space-y-4">
          <div className="h-5 w-36 animate-pulse rounded bg-secondary" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-10 animate-pulse rounded-lg bg-secondary/70" />
        </div>
      </main>
    );
  }

  if (!session) return <SignIn initialError={authError} />;

  const activeChat = chats.find((chat) => chat.conversationId === activeChatId) || null;
  const savedChats = chats.filter((chat) => chat.hasMessages || chat.isPending);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background">
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close library sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
        />
      )}
      <div
        className={`shrink-0 overflow-hidden transition-[width] duration-150 ease-in-out motion-reduce:transition-none ${
          isSidebarOpen
            ? 'fixed inset-y-0 left-0 z-40 w-[min(88vw,320px)] shadow-xl sm:relative sm:inset-auto sm:z-auto sm:w-[42vw] sm:max-w-[320px] sm:shadow-none'
            : 'fixed inset-y-0 left-0 z-40 w-0 sm:relative sm:inset-auto sm:z-auto sm:w-0 sm:max-w-0'
        }`}
        aria-hidden={!isSidebarOpen}
        inert={!isSidebarOpen}
      >
        <LibraryPanel
          documents={documents}
          onDocumentsChange={setDocuments}
          onDocumentsLoaded={handleDocumentsLoaded}
          embeddingKeyMode={embeddingKeyMode}
          onRefreshJinaApiKeys={refreshJinaApiKeys}
          chats={savedChats}
          isChatsLoaded={chatsLoaded}
          activeChatId={activeChatId}
          chatsError={chatsError}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onCloseSidebar={() => setIsSidebarOpen(false)}
        />
      </div>
      <ChatComponent
        documents={documents}
        documentsLoaded={documentsLoaded}
        embeddingKeyMode={embeddingKeyMode}
        onRefreshJinaApiKeys={refreshJinaApiKeys}
        conversation={activeChat}
        isChatsLoaded={chatsLoaded}
        onConversationChange={handleChatChange}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
        headerActions={
          <>
            <button
              type="button"
              onClick={() => setIsGuidedTourOpen(true)}
              aria-label="Open app walkthrough"
              title="App walkthrough"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2.5"
            >
              <CircleHelp className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Help</span>
            </button>
            <ProfileMenu
              userEmail={session.user.email || ''}
              authError={authError}
              onSignOut={handleSignOut}
              embeddingKeyMode={embeddingKeyMode}
              onEmbeddingKeyModeChange={setEmbeddingKeyMode}
              jinaApiKey={jinaApiKey}
              onJinaApiKeyChange={setJinaApiKey}
              jinaApiKeys={jinaApiKeys.keys}
              activeJinaKeyId={jinaApiKeys.activeKeyId}
              appDefaultJinaUsage={jinaApiKeys.appDefaultJinaUsage}
              onJinaApiKeysChange={handleJinaApiKeysChange}
              isJinaKeyStatusLoading={isJinaKeyStatusLoading}
              jinaKeyStatusError={jinaKeyStatusError}
              onJinaKeyStatusErrorChange={setJinaKeyStatusError}
            />
          </>
        }
      />
      <GuidedTour
        isOpen={isGuidedTourOpen}
        onClose={closeGuidedTour}
        onSidebarChange={setTourSidebarOpen}
      />
    </div>
  );
}
