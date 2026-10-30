import dotenv from 'dotenv';

dotenv.config();

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;
export const EMBEDDING_DIMENSIONS = 768;
export const JINA_EMBEDDING_MODEL = 'jina-embeddings-v3';
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_BATCH_SIZE = 100;
export const MAX_EMBEDDING_RETRIES = 1;
export const MAX_AUTOMATIC_RETRY_MS = 60_000;
export const EMBEDDING_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const RETRIEVAL_CACHE_TTL_SECONDS = 5 * 60;
export const ANSWER_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const ANSWER_PROMPT_VERSION = 'grounded-v3';
export const INSUFFICIENT_CONTEXT_MARKER = '[[INSUFFICIENT_PDF_CONTEXT]]';
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
export const METADATA_VECTOR = Array.from(
  { length: EMBEDDING_DIMENSIONS },
  (_, index) => (index === 0 ? 1 : 0)
);
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'pdf_chunks';
export const QDRANT_CHAT_COLLECTION =
  process.env.QDRANT_CHAT_COLLECTION || `${QDRANT_COLLECTION}_chat_history`;
export const QDRANT_URL = process.env.QDRANT_URL?.replace(/\/+$/, '');
export const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
export const JINA_API_KEY = process.env.JINA_API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GROQ_API_KEY = process.env.GROQ_API_KEY;
export const CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
export const CACHE_PREFIX = 'pdf-rag:v1';
export const CREDENTIAL_ENCRYPTION_ALGORITHM = 'aes-256-gcm';
export const JINA_KEY_USAGE_CATEGORIES = ['indexing', 'search', 'validation'];
export const APP_DEFAULT_JINA_KEY_ID = 'app-default';
