import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const STORE_FILE = path.join(UPLOAD_DIR, 'documents.json');
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

let documents = [];
if (fs.existsSync(STORE_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    documents = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read document store, starting fresh:', error.message);
    documents = [];
  }
}

const saveDocuments = () => {
  fs.writeFileSync(STORE_FILE, JSON.stringify(documents, null, 2), 'utf-8');
};

// ---------- Chunking ----------
// Splits on paragraph breaks, then hard-wraps anything still too long.
// A small overlap is kept between adjacent hard-wrapped slices so a fact
// sitting on a chunk boundary isn't silently cut in half.
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
  const meaningful = allTerms.filter((w) => w.length > 1 && !STOPWORDS.has(w));
  // If the query is entirely stopwords (e.g. "what is this"), fall back to
  // the raw terms rather than returning zero matches.
  return meaningful.length ? meaningful : allTerms;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const scoreDocument = (queryTerms, docText) => {
  const text = docText.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    const matches = text.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g'));
    if (matches) score += matches.length;
  }
  // Slight length normalization so one giant chunk doesn't win purely on size.
  return score / Math.sqrt(docText.length / 500 + 1);
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
        answers.push({ text: clean, source: doc.source, chunkIndex: doc.chunkIndex });
        seen.add(clean);
        if (answers.length >= 5) break;
      }
    }
    if (answers.length >= 5) break;
  }

  if (answers.length === 0) {
    const fallback = topDocs[0];
    return {
      message: `I couldn't extract a precise answer, but here's the most relevant passage I found.`,
      excerpt: fallback ? fallback.text.slice(0, 600) : null,
    };
  }

  return {
    message: answers.map((a) => a.text).join(' '),
    excerpt: null,
  };
};

// ---------- Uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) {
      return cb(new Error('Only PDF files are supported.'));
    }
    cb(null, true);
  },
});

// ---------- Routes ----------
app.get('/', (req, res) => {
  res.json({ status: 'All Good!', uploadedDocuments: documents.length });
});

app.get('/documents', (req, res) => {
  const bySource = new Map();
  for (const doc of documents) {
    if (!bySource.has(doc.source)) {
      bySource.set(doc.source, { source: doc.source, chunks: 0, uploadedAt: doc.uploadedAt || null });
    }
    bySource.get(doc.source).chunks += 1;
  }
  res.json({ documents: Array.from(bySource.values()) });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(fileBuffer);

    if (!data.text || !data.text.trim()) {
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({
        error: 'No extractable text found in this PDF. It may be a scanned image without OCR text.',
      });
    }

    const chunks = splitTextIntoChunks(data.text);
    const source = req.file.originalname;
    const uploadedAt = new Date().toISOString();

    const newDocs = chunks.map((text, index) => ({
      id: `${req.file.filename}-${index}`,
      source,
      storedFilename: req.file.filename,
      chunkIndex: index + 1,
      totalChunks: chunks.length,
      text,
      uploadedAt,
    }));

    documents = [...documents, ...newDocs];
    saveDocuments();

    res.json({
      message: 'uploaded',
      source,
      chunks: newDocs.length,
      totalDocuments: documents.length,
    });
  } catch (error) {
    console.error('Failed to process PDF:', error.message);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to parse this PDF. It may be corrupted or password-protected.' });
  }
});

app.delete('/documents/:source', (req, res) => {
  const source = decodeURIComponent(req.params.source);
  const toRemove = documents.filter((doc) => doc.source === source);

  if (!toRemove.length) {
    return res.status(404).json({ error: 'No document found with that name.' });
  }

  const filenames = new Set(toRemove.map((doc) => doc.storedFilename).filter(Boolean));
  for (const filename of filenames) {
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') console.error('Failed to delete file:', err.message);
    });
  }

  documents = documents.filter((doc) => doc.source !== source);
  saveDocuments();

  res.json({ message: 'deleted', source, remainingDocuments: documents.length });
});

const handleChat = (req, res) => {
  const userQuery = String(req.body?.message ?? req.query?.message ?? '').trim();
  if (!userQuery) {
    return res.status(400).json({ error: 'Query message is required.' });
  }

  if (!documents.length) {
    return res.json({
      message: 'No PDFs are loaded yet. Upload one to start asking questions.',
      sources: [],
    });
  }

  const queryTerms = getQueryTerms(userQuery);
  const scored = documents
    .map((doc) => ({ ...doc, score: scoreDocument(queryTerms, doc.text) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!scored.length) {
    return res.json({
      message: "I couldn't find anything in the uploaded PDFs that matches that question. Try rephrasing it.",
      sources: [],
    });
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
};

app.post('/chat', handleChat);
app.get('/chat', handleChat); // kept for backward compatibility

// Multer / generic error handler — without this, upload errors (bad file
// type, oversize file) crash with an unhandled response instead of JSON.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  }
  next();
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server started on PORT:${PORT}`));
