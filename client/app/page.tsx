'use client';

import * as React from 'react';
import LibraryPanel from './components/file-upload';
import ChatComponent from './components/chat';
import { api, type ChatConversation, type DocumentSummary } from '@/lib/api';

export default function Home() {
  const [documents, setDocuments] = React.useState<DocumentSummary[]>([]);
  const [chats, setChats] = React.useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [chatsLoaded, setChatsLoaded] = React.useState(false);
  const [chatsError, setChatsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api.listChats()
      .then(({ chats: savedChats }) => {
        if (cancelled) return;
        setChats(savedChats);
        const savedActiveId = window.localStorage.getItem('pdf-rag-active-chat-id');
        const selectedChat = savedChats.find((chat) => chat.conversationId === savedActiveId)
          || savedChats[0];
        if (selectedChat) {
          setActiveChatId(selectedChat.conversationId);
          window.localStorage.setItem('pdf-rag-active-chat-id', selectedChat.conversationId);
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
  }, []);

  const handleNewChat = async () => {
    setChatsError(null);
    try {
      const { chat } = await api.createChat();
      setChats((current) => [chat, ...current]);
      setActiveChatId(chat.conversationId);
      window.localStorage.setItem('pdf-rag-active-chat-id', chat.conversationId);
    } catch (error) {
      setChatsError(error instanceof Error ? error.message : 'Could not create a chat.');
    }
  };

  const handleSelectChat = (conversationId: string) => {
    setActiveChatId(conversationId);
    window.localStorage.setItem('pdf-rag-active-chat-id', conversationId);
  };

  const handleChatChange = (updatedChat: ChatConversation) => {
    setChats((current) =>
      current
        .map((chat) => chat.conversationId === updatedChat.conversationId ? updatedChat : chat)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
  };

  const handleDeleteChat = async (conversationId: string) => {
    setChatsError(null);
    try {
      await api.deleteChat(conversationId);
      const remainingChats = chats.filter((chat) => chat.conversationId !== conversationId);
      setChats(remainingChats);
      if (activeChatId === conversationId) {
        const nextChat = remainingChats[0] || null;
        setActiveChatId(nextChat?.conversationId || null);
        if (nextChat) {
          window.localStorage.setItem('pdf-rag-active-chat-id', nextChat.conversationId);
        } else {
          window.localStorage.removeItem('pdf-rag-active-chat-id');
        }
      }
    } catch (error) {
      setChatsError(error instanceof Error ? error.message : 'Could not delete this chat.');
    }
  };

  const activeChat = chats.find((chat) => chat.conversationId === activeChatId) || null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="w-[320px] shrink-0">
        <LibraryPanel
          documents={documents}
          onDocumentsChange={setDocuments}
          chats={chats}
          activeChatId={activeChatId}
          chatsError={chatsError}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
        />
      </div>
      <ChatComponent
        documents={documents}
        conversation={activeChat}
        isChatsLoaded={chatsLoaded}
        onConversationChange={handleChatChange}
      />
    </div>
  );
}
