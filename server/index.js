import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as config from './config.js';
import { HttpError } from './errors.js';
import { createInfrastructure } from './infrastructure.js';
import { createAiServices } from './services/ai.js';
import { registerRoutes } from './routes/index.js';

const {
  MAX_UPLOAD_BYTES,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  QDRANT_COLLECTION,
  QDRANT_CHAT_COLLECTION,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  JINA_API_KEY,
  GEMINI_API_KEY,
  GROQ_API_KEY,
  CREDENTIAL_ENCRYPTION_KEY,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
} = config;
const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const app = express();
app.use(cors());
app.use(express.json());

const infrastructure = createInfrastructure(config);
const {
  getCredentialEncryptionKey,
  qdrantRequest,
  redisPipeline,
  ensureCollection,
  ensurePayloadIndex,
} = infrastructure;

const aiServices = createAiServices({ ...config, ...infrastructure });

const getPointCount = async (ownerId) => {
  const result = await qdrantRequest(
    `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/count`,
    {
      method: 'POST',
      body: JSON.stringify({
        exact: true,
        filter: { must: [{ key: 'ownerId', match: { value: ownerId } }] },
      }),
    }
  );
  return result?.count ?? 0;
};

const isConversationId = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const persistChatTurn = async (
  conversationId,
  queryVector,
  userMessage,
  response,
  conversation,
  previousTurns,
  ownerId
) => {
  const content = response.excerpt
    ? `${response.message}\n\n${response.excerpt}`
    : response.message;

  const createdAt = new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const title = conversation.title === 'New chat'
    ? userMessage.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat'
    : conversation.title;
  const turn = {
    userMessage,
    assistantMessage: content,
    createdAt,
    needsFullLlmSearch: response.needsFullLlmSearch,
    answerMode: response.answerMode,
  };
  const recentTurns = [...previousTurns, turn].slice(-6);
  await Promise.all([
    qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points`,
      {
        method: 'PUT',
        body: JSON.stringify({
          wait: true,
          points: [{
            id: randomUUID(),
            vector: queryVector,
            payload: {
              recordType: 'turn',
              conversationId,
              ownerId,
              ...turn,
              sources: response.sources,
            },
          }],
        }),
      }
    ),
    qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/payload?wait=true`,
      {
        method: 'POST',
        body: JSON.stringify({
          points: [conversationId],
          payload: { ownerId, title, updatedAt, hasMessages: true, recentTurns },
        }),
      }
    ),
  ]);
};

// ---------- Chunking ----------
const splitTextIntoChunks = (text) => {
  const rawBlocks = text.split(/\n\s*\n/);
  const chunks = [];

  for (const block of rawBlocks) {
    const trimmed = block.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;

    if (trimmed.length <= CHUNK_SIZE) {
      chunks.push(trimmed);
      continue;
    }

    let start = 0;
    while (start < trimmed.length) {
      const end = Math.min(start + CHUNK_SIZE, trimmed.length);
      chunks.push(trimmed.slice(start, end));
      if (end === trimmed.length) break;
      start = end - CHUNK_OVERLAP;
    }
  }

  return chunks;
};

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error('Only PDF files are supported.'));
    cb(null, true);
  },
});

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const requireAuth = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  if (!supabaseAuth) throw new HttpError(503, 'Authentication is not configured.');

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session is invalid or expired. Sign in again.');
  req.userId = data.user.id;
  next();
});

registerRoutes(app, {
  ...config,
  ...infrastructure,
  ...aiServices,
  asyncHandler,
  requireAuth,
  supabaseAuth,
  upload,
  getPointCount,
  isConversationId,
  persistChatTurn,
  splitTextIntoChunks,
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof multer.MulterError ? 400 : (err.statusCode || 500);
  if (status >= 500) console.error('Request failed:', err.message);
  res.status(status).json({ error: err.message || 'Request failed.' });
});

const PORT = process.env.PORT || 8000;

const bootstrap = async () => {
  const missing = [
    !JINA_API_KEY && !GEMINI_API_KEY && 'JINA_API_KEY or GEMINI_API_KEY',
    !SUPABASE_URL && 'SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'SUPABASE_ANON_KEY',
    !CREDENTIAL_ENCRYPTION_KEY && 'CREDENTIAL_ENCRYPTION_KEY',
    !GROQ_API_KEY && 'GROQ_API_KEY',
    !QDRANT_URL && 'QDRANT_URL',
    !QDRANT_API_KEY && 'QDRANT_API_KEY',
    !UPSTASH_REDIS_REST_URL && 'UPSTASH_REDIS_REST_URL',
    !UPSTASH_REDIS_REST_TOKEN && 'UPSTASH_REDIS_REST_TOKEN',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing required online service configuration: ${missing.join(', ')}`);
  }
  getCredentialEncryptionKey();

  await ensureCollection(QDRANT_COLLECTION);
  await ensureCollection(QDRANT_CHAT_COLLECTION);
  await ensurePayloadIndex(QDRANT_COLLECTION, 'source');
  await ensurePayloadIndex(QDRANT_COLLECTION, 'embeddingProvider');
  await ensurePayloadIndex(QDRANT_COLLECTION, 'ownerId');
  await ensurePayloadIndex(QDRANT_CHAT_COLLECTION, 'conversationId');
  await ensurePayloadIndex(QDRANT_CHAT_COLLECTION, 'recordType');
  await ensurePayloadIndex(QDRANT_CHAT_COLLECTION, 'ownerId');
  const [cacheStatus] = await redisPipeline([['PING']]);
  if (cacheStatus !== 'PONG') {
    throw new Error('Upstash Redis did not respond to PING.');
  }
  console.log('Upstash Redis cache connected.');
  app.listen(PORT, () => console.log(`Server started on PORT:${PORT}`));
};

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
