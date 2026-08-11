# What changed

## Setup
```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install
cp .env.local.example .env.local   # optional, defaults to localhost:8000 anyway
npm run dev
```
Open http://localhost:3000. The server runs on :8000.

## Bugs fixed

**Server (`server/index.js`)**
- Client/server field mismatch: server sent `text`/`source`/`chunkIndex`, client expected `pageContent`/`metdata` — answers and sources were silently broken. Aligned the types end to end.
- No file-type or size validation on upload — any file could be sent to the PDF parser and crash the request. Added a PDF-only filter and a 20MB limit, plus an error-handling middleware so failures return clean JSON instead of hanging/crashing.
- Corrupted/scanned PDFs (no extractable text) now return a clear 422 instead of silently indexing empty content.
- `/chat` was GET-only with an un-encoded query string, so messages with `&`, `#`, etc. broke. Added `POST /chat` with a JSON body (kept `GET` for compatibility).
- No way to see or remove what's indexed. Added `GET /documents` and `DELETE /documents/:source` (also removes the underlying uploaded file).
- Retrieval quality: scoring only checked "does this word appear at all," so stopwords like *what/is/does* dominated matches. Now filters stopwords, counts term frequency with length normalization, and de-duplicates repeated sentences in the composed answer. Chunking also keeps a small overlap across hard-wrapped boundaries so a fact sitting on a chunk boundary isn't cut in half.

**Client**
- Chat previously dumped raw `JSON.stringify` into a `<pre>` tag — replaced with real chat bubbles, loading state, auto-scroll, Enter-to-send, error messages, and citation chips (source PDF + chunk number) under each answer.
- Upload button had no feedback at all — replaced with a drag-and-drop panel showing upload progress, an indexed-document list, per-document delete, and inline error messages.
- Hardcoded `http://localhost:8000` scattered across components — centralized into `lib/api.ts` with proper error handling and an `NEXT_PUBLIC_API_URL` env var.
- Layout used `30vw`/`70vw` with a `fixed` composer, which could overflow/overlap on smaller viewports — rebuilt as a standard flex layout.

## Design
Minimal, single-accent palette (warm neutral background + one deep pine-ink accent used consistently for primary actions, the user's chat bubble, and citation chips). Reuses the Geist Sans/Mono fonts already wired into the project — sans for conversation, mono for document metadata (filenames, chunk indices) to visually separate "what the app says" from "what the document says."

## Note
This is still a *local, keyword-matching* retriever, not a real embeddings/LLM pipeline (no OpenAI/Anthropic key required, runs fully offline). If you want actual semantic RAG (embeddings + an LLM to generate answers), that's a bigger follow-up — happy to wire that in if you want it.
