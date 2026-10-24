const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(
      'Could not reach the server. Is it running on port 8000?',
      0
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status);
  }

  return body as T;
}

export interface DocumentSummary {
  source: string;
  chunks: number;
  uploadedAt: string | null;
}

export interface ChatSource {
  source: string;
  chunkIndex: number;
  totalChunks: number;
  snippet: string;
}

export interface ChatResponse {
  message: string;
  excerpt?: string | null;
  sources: ChatSource[];
}

export interface ChatHistoryMessage {
  role: 'assistant' | 'user';
  content: string;
  sources?: ChatSource[];
}

export interface ChatConversation {
  conversationId: string;
  title: string;
  selectedSources: string[];
  hasMessages: boolean;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  listDocuments: () => request<{ documents: DocumentSummary[] }>('/documents'),

  uploadPdf: async (file: File) => {
    const formData = new FormData();
    formData.append('pdf', file);
    return request<{ message: string; source: string; chunks: number; totalDocuments: number }>(
      '/upload/pdf',
      { method: 'POST', body: formData }
    );
  },

  deleteDocument: (source: string) =>
    request<{ message: string; source: string; remainingDocuments: number }>(
      `/documents/${encodeURIComponent(source)}`,
      { method: 'DELETE' }
    ),

  getChatHistory: (conversationId: string) =>
    request<{ messages: ChatHistoryMessage[] }>(
      `/chat/history/${encodeURIComponent(conversationId)}`
    ),

  listChats: () => request<{ chats: ChatConversation[] }>('/chats'),

  createChat: () =>
    request<{ chat: ChatConversation }>('/chats', { method: 'POST' }),

  updateChat: (conversationId: string, selectedSources: string[]) =>
    request<{ chat: ChatConversation }>(`/chats/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedSources }),
    }),

  deleteChat: (conversationId: string) =>
    request<{ message: string; conversationId: string }>(
      `/chats/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' }
    ),

  chat: (message: string, conversationId: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId }),
    }),
};
