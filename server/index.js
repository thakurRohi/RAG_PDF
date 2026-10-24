import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_BATCH_SIZE = 100;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'pdf_chunks';
const QDRANT_URL = process.env.QDRANT_URL?.replace(/\/+$/, '');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const qdrantRequest = async (endpoint, options = {}) => {
  const response = await fetch(`${QDRANT_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'api-key': QDRANT_API_KEY,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.status?.error || body?.status || response.statusText;
    throw new HttpError(503, `Qdrant request failed (${response.status}): ${detail}`);
  }

  return body?.result;
};

const ensureCollection = async () => {
  const endpoint = `/collections/${encodeURIComponent(QDRANT_COLLECTION)}`;
  const response = await fetch(`${QDRANT_URL}${endpoint}`, {
    headers: { 'api-key': QDRANT_API_KEY },
  });

  if (response.status === 404) {
    await qdrantRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
      }),
    });
    console.log(`Created Qdrant collection: ${QDRANT_COLLECTION}`);
    return;
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.status?.error || body?.status || response.statusText;
    throw new Error(`Could not inspect Qdrant collection (${response.status}): ${detail}`);
  }

  const size = body?.result?.config?.params?.vectors?.size;
  if (size !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Qdrant collection "${QDRANT_COLLECTION}" must use ${EMBEDDING_DIMENSIONS}-dimension vectors; found ${size ?? 'an incompatible vector configuration'}.`
    );
  }
};

const embedTexts = async (texts, taskType) => {
  const embeddings = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
      }
    );
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = result?.error?.message || response.statusText;
      throw new HttpError(502, `Gemini embedding request failed (${response.status}): ${detail}`);
    }

    const batchEmbeddings = result?.embeddings?.map((item) => item.values);
    if (
      !Array.isArray(batchEmbeddings) ||
      batchEmbeddings.length !== batch.length ||
      batchEmbeddings.some(
        (vector) =>
          !Array.isArray(vector) ||
          vector.length !== EMBEDDING_DIMENSIONS ||
          vector.some((value) => !Number.isFinite(value))
      )
    ) {
      throw new HttpError(502, 'Gemini returned invalid embedding vectors.');
    }

    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
};

const getPointCount = async () => {
  const result = await qdrantRequest(
    `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/count`,
    { method: 'POST', body: JSON.stringify({ exact: true }) }
  );
  return result?.count ?? 0;
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

// ---------- Retrieval ----------
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but',
  'what', 'when', 'where', 'who', 'whom', 'why', 'how', 'which', 'this',
  'that', 'these', 'those', 'it', 'its', 'with', 'as', 'at', 'by', 'from',
  'about', 'into', 'can', 'could', 'will', 'would', 'should', 'i', 'you',
  'me', 'my', 'your', 'please', 'tell', 'explain', 'give', 'show'
]);

const getQueryTerms = (message) => {
  const allTerms = String(message).toLowerCase().match(/\b\w+\b/g) || [];
  const meaningful = allTerms.filter((word) => word.length > 1 && !STOPWORDS.has(word));
  return meaningful.length ? meaningful : allTerms;
};

const composeAnswer = (query, topDocs) => {
  const queryTerms = getQueryTerms(query);
  const seen = new Set();
  const answers = [];

  for (const doc of topDocs) {
    const sentences = doc.text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (!clean || seen.has(clean)) continue;
      const lower = clean.toLowerCase();
      if (queryTerms.some((term) => lower.includes(term))) {
        answers.push({ text: clean });
        seen.add(clean);
        if (answers.length >= 5) break;
      }
    }
    if (answers.length >= 5) break;
  }

  if (answers.length === 0) {
    const fallback = topDocs[0];
    return {
      message: "I couldn't extract a precise answer, but here's the most relevant passage I found.",
      excerpt: fallback ? fallback.text.slice(0, 600) : null,
    };
  }

  return {
    message: answers.map((answer) => answer.text).join(' '),
    excerpt: null,
  };
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

// ---------- Routes ----------
app.get('/', asyncHandler(async (req, res) => {
  res.json({ status: 'All Good!', uploadedDocuments: await getPointCount() });
}));

app.get('/documents', asyncHandler(async (req, res) => {
  const documents = new Map();
  let offset;

  do {
    const result = await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit: 1000,
          with_payload: ['source', 'uploadedAt'],
          with_vectors: false,
          ...(offset !== undefined ? { offset } : {}),
        }),
      }
    );

    for (const point of result?.points || []) {
      const { source, uploadedAt } = point.payload || {};
      if (!source) continue;
      const existing = documents.get(source);
      if (existing) {
        existing.chunks += 1;
      } else {
        documents.set(source, { source, chunks: 1, uploadedAt: uploadedAt || null });
      }
    }

    offset = result?.next_page_offset;
  } while (offset !== null && offset !== undefined);

  res.json({ documents: Array.from(documents.values()) });
}));

app.post('/upload/pdf', upload.single('pdf'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'No PDF file uploaded.');
  }

  let data;
  try {
    data = await pdfParse(req.file.buffer);
  } catch (error) {
    console.error('Failed to parse PDF:', error.message);
    throw new HttpError(422, 'Failed to parse this PDF. It may be corrupted or password-protected.');
  }

  if (!data.text || !data.text.trim()) {
    throw new HttpError(
      422,
      'No extractable text found in this PDF. It may be a scanned image without OCR text.'
    );
  }

  const chunks = splitTextIntoChunks(data.text);
  const source = req.file.originalname;
  const uploadedAt = new Date().toISOString();

  try {
    const vectors = await embedTexts(chunks, 'RETRIEVAL_DOCUMENT');
    await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points`,
      {
        method: 'PUT',
        body: JSON.stringify({
          wait: true,
          points: chunks.map((text, index) => ({
            id: randomUUID(),
            vector: vectors[index],
            payload: {
              source,
              chunkIndex: index + 1,
              totalChunks: chunks.length,
              text,
              uploadedAt,
            },
          })),
        }),
      }
    );
  } catch (error) {
    console.error('Failed to embed or index PDF:', error.message);
    throw error;
  }

  res.json({
    message: 'uploaded',
    source,
    chunks: chunks.length,
    totalDocuments: await getPointCount(),
  });
}));

app.delete('/documents/:source', asyncHandler(async (req, res) => {
  const source = req.params.source;
  const count = await qdrantRequest(
    `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/count`,
    {
      method: 'POST',
      body: JSON.stringify({
        exact: true,
        filter: { must: [{ key: 'source', match: { value: source } }] },
      }),
    }
  );

  if (!count?.count) {
    throw new HttpError(404, 'No document found with that name.');
  }

  await qdrantRequest(
    `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/delete`,
    {
      method: 'POST',
      body: JSON.stringify({
        wait: true,
        filter: { must: [{ key: 'source', match: { value: source } }] },
      }),
    }
  );

  res.json({
    message: 'deleted',
    source,
    remainingDocuments: await getPointCount(),
  });
}));

const handleChat = asyncHandler(async (req, res) => {
  const userQuery = String(req.body?.message ?? req.query?.message ?? '').trim();
  if (!userQuery) {
    throw new HttpError(400, 'Query message is required.');
  }

  if (!(await getPointCount())) {
    res.json({
      message: 'No PDFs are loaded yet. Upload one to start asking questions.',
      sources: [],
    });
    return;
  }

  const [queryVector] = await embedTexts([userQuery], 'RETRIEVAL_QUERY');
  const result = await qdrantRequest(
    `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        vector: queryVector,
        limit: 3,
        with_payload: true,
      }),
    }
  );

  const scored = (result || []).map((point) => ({
    ...point.payload,
    score: point.score,
  }));

  if (!scored.length) {
    res.json({
      message: "I couldn't find anything in the uploaded PDFs that matches that question. Try rephrasing it.",
      sources: [],
    });
    return;
  }

  const { message, excerpt } = composeAnswer(userQuery, scored);
  res.json({
    message,
    excerpt,
    sources: scored.map((doc) => ({
      source: doc.source,
      chunkIndex: doc.chunkIndex,
      totalChunks: doc.totalChunks,
      snippet: doc.text.slice(0, 220),
    })),
  });
});

app.post('/chat', handleChat);
app.get('/chat', handleChat);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof multer.MulterError ? 400 : (err.statusCode || 500);
  if (status >= 500) console.error('Request failed:', err.message);
  res.status(status).json({ error: err.message || 'Request failed.' });
});

const PORT = process.env.PORT || 8000;

const bootstrap = async () => {
  const missing = [
    !GEMINI_API_KEY && 'GEMINI_API_KEY',
    !QDRANT_URL && 'QDRANT_URL',
    !QDRANT_API_KEY && 'QDRANT_API_KEY',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing required online service configuration: ${missing.join(', ')}`);
  }

  await ensureCollection();
  app.listen(PORT, () => console.log(`Server started on PORT:${PORT}`));
};

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
