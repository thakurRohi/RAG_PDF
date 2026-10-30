import { getSupabaseClient } from './supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type EmbeddingKeyMode = 'app' | 'custom';

export interface EmbeddingCredentials {
  mode: EmbeddingKeyMode;
}

export interface JinaApiKeySummary {
  id: string;
  label: string;
  maskedKey: string;
  createdAt: string;
  usage: {
    indexingTokens: number;
    searchTokens: number;
    validationTokens: number;
    totalTokens: number;
  };
}

export interface JinaApiKeysState {
  keys: JinaApiKeySummary[];
  activeKeyId: string | null;
  appDefaultJinaUsage: {
    indexingTokens: number;
    searchTokens: number;
    validationTokens: number;
    totalTokens: number;
  };
}

async function request<T>(
  path: string,
  init?: RequestInit,
  embeddingCredentials?: EmbeddingCredentials
): Promise<T> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw new ApiError(`Could not read your sign-in session: ${error.message}`, 401);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new ApiError('Sign in to continue.', 401);

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (embeddingCredentials) {
    headers.set('X-Embedding-Key-Mode', embeddingCredentials.mode);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
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

export type ChatAnswerMode = 'grounded' | 'full';

export interface ChatResponse {
  message: string;
  excerpt?: string | null;
  sources: ChatSource[];
  needsFullLlmSearch: boolean;
  answerMode: ChatAnswerMode;
}

export interface ChatHistoryMessage {
  role: 'assistant' | 'user';
  content: string;
  sources?: ChatSource[];
  needsFullLlmSearch?: boolean;
  answerMode?: ChatAnswerMode;
}

export interface ChatConversation {
  conversationId: string;
  title: string;
  selectedSources: string[];
  hasMessages: boolean;
  createdAt: string;
  updatedAt: string;
  isPending?: boolean;
}

export const api = {
  listDocuments: () => request<{ documents: DocumentSummary[] }>('/documents'),

  getJinaApiKeys: () => request<JinaApiKeysState>('/embedding-keys'),

  saveJinaApiKey: (label: string, jinaApiKey: string) =>
    request<JinaApiKeysState>('/embedding-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, jinaApiKey }),
    }),

  setActiveJinaApiKey: (keyId: string | null) =>
    request<JinaApiKeysState>('/embedding-keys/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId }),
    }),

  deleteJinaApiKey: (keyId: string) =>
    request<JinaApiKeysState>(`/embedding-keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
    }),

  uploadPdf: async (file: File, credentials: EmbeddingCredentials) => {
    const formData = new FormData();
    formData.append('pdf', file);
    return request<{ message: string; source: string; chunks: number; totalDocuments: number }>(
      '/upload/pdf',
      { method: 'POST', body: formData },
      credentials
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

  chat: (
    message: string,
    conversationId: string,
    credentials: EmbeddingCredentials,
    answerMode: ChatAnswerMode = 'grounded'
  ) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId, answerMode }),
    }, credentials),
};
