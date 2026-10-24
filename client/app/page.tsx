'use client';

import * as React from 'react';
import LibraryPanel from './components/file-upload';
import ChatComponent from './components/chat';
import { api, type ChatConversation, type DocumentSummary } from '@/lib/api';
import SignIn from './components/sign-in';
import { getSupabaseClient } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export default function Home() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [documents, setDocuments] = React.useState<DocumentSummary[]>([]);
  const [chats, setChats] = React.useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [chatsLoaded, setChatsLoaded] = React.useState(false);
  const [chatsError, setChatsError] = React.useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const activeChatStorageKey = session
    ? `pdf-rag-active-chat-id:${session.user.id}`
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
    if (!session) {
      setChatsLoaded(false);
      setChats([]);
      setDocuments([]);
      setActiveChatId(null);
      return;
    }
    let cancelled = false;
    api.listChats()
      .then(({ chats: savedChats }) => {
        if (cancelled) return;
        setChats(savedChats);
        const savedActiveId = activeChatStorageKey
          ? window.localStorage.getItem(activeChatStorageKey)
          : null;
        const selectedChat = savedChats.find((chat) => chat.conversationId === savedActiveId)
          || savedChats[0];
        if (selectedChat) {
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
  }, [session?.user.id, activeChatStorageKey]);

  const handleNewChat = async () => {
    setChatsError(null);
    try {
      const { chat } = await api.createChat();
      setChats((current) => [chat, ...current]);
      setActiveChatId(chat.conversationId);
      if (activeChatStorageKey) {
        window.localStorage.setItem(activeChatStorageKey, chat.conversationId);
      }
    } catch (error) {
      setChatsError(error instanceof Error ? error.message : 'Could not create a chat.');
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
        const nextChat = remainingChats[0] || null;
        setActiveChatId(nextChat?.conversationId || null);
        if (nextChat) {
          if (activeChatStorageKey) {
            window.localStorage.setItem(activeChatStorageKey, nextChat.conversationId);
          }
        } else {
          if (activeChatStorageKey) window.localStorage.removeItem(activeChatStorageKey);
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
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking your sign-in…
      </main>
    );
  }

  if (!session) return <SignIn initialError={authError} />;

  const activeChat = chats.find((chat) => chat.conversationId === activeChatId) || null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div
        className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
          isSidebarOpen ? 'w-[42vw] max-w-[320px]' : 'w-0 max-w-0'
        }`}
        aria-hidden={!isSidebarOpen}
        inert={!isSidebarOpen}
      >
        <LibraryPanel
          documents={documents}
          onDocumentsChange={setDocuments}
          chats={chats}
          userEmail={session.user.email || ''}
          authError={authError}
          activeChatId={activeChatId}
          chatsError={chatsError}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onSignOut={handleSignOut}
        />
      </div>
      <ChatComponent
        documents={documents}
        conversation={activeChat}
        isChatsLoaded={chatsLoaded}
        onConversationChange={handleChatChange}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
    </div>
  );
}
