# PDF RAG

PDF search uses hosted vector embeddings and a hosted vector database. It does
not download embedding models, run a local vector database, or save uploaded
PDFs/chunks to local files.

## Online setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/),
   a Groq API key in [Groq Console](https://console.groq.com/keys), and a
   free-tier cluster in [Qdrant Cloud](https://cloud.qdrant.io/). Free quotas
   and availability are controlled by those providers and can change.
2. Create a free Redis database in [Upstash](https://console.upstash.com/).
   Copy `server/.env.example` to `server/.env` and fill in the Gemini and Groq
   API keys, Qdrant cluster URL/API key, and Upstash REST URL/token.
   In Upstash, open the database's **Connect** page and copy the REST URL and
   REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
   `GROQ_MODEL` defaults to
   `openai/gpt-oss-120b`; choose a chat model enabled for your key from Groq's
   [Models page](https://console.groq.com/docs/models). `QDRANT_COLLECTION` can
   stay as `pdf_chunks`. The server creates the collection with 768-dimensional
   cosine vectors if it does not exist.
3. Configure `NEXT_PUBLIC_API_URL` in `client/.env.local` to point to the
   deployed server URL (or use `http://localhost:8000` when running the app
   locally). Start the server and client using their `npm run dev` scripts.
   Development uses Webpack and a separate `.next-dev` output directory so
   Windows dev manifests do not contend with the production build output.

The server parses each uploaded PDF in memory, sends its text chunks to Gemini
for embeddings, and stores the text and vectors in Qdrant Cloud. Questions are
embedded by Gemini and searched in Qdrant; Groq generates a natural-language
answer using the retrieved passages. Groq is used for answer generation, not
embeddings, so the Gemini key is still required. PDF files are not retained by
the server; extracted text and questions are sent to the configured providers.
The service requires the cloud credentials above and intentionally does not
fall back to local storage.

Gemini embedding requests are retried once when Google returns a short
rate-limit delay. Creating chats does not call Gemini; only PDF indexing and
user-question searches need embeddings. The free-tier quota still applies, so
large PDFs or repeated uploads may need to wait for the provider's quota window
to reset.

Upstash Redis caches embeddings (keyed by model, task, and text hash),
retrieval results (keyed by query vector, selected PDFs, and document
generation), and generated answers (keyed by retrieved passages and chat
context). PDF uploads/deletions advance the document generation so stale
retrieval and answer entries are not reused. Cached embedding vectors and
retrieved PDF text are stored by Upstash; use documents appropriate for your
provider's data-handling terms. Embedding cache entries for a PDF are removed
from Upstash when that PDF is deleted; remaining entries expire after 30 days.
The server checks the cache connection at startup and surfaces cache errors
instead of silently bypassing it.

Check cache connectivity and current-process cache hit/miss/write counters at
`http://localhost:8000/health/cache`. The counters reset whenever the server
restarts. In the Upstash database **Data Browser**, search keys beginning with
`pdf-rag:v1:` to inspect stored entries; keys are hashed and values include
embedding vectors, retrieved PDF passages, and generated answers. Do not share
the database URL/token or expose them in browser/client code.

Chats appear in a conversation sidebar and each has its own saved history.
Choose one or more PDFs for a chat before its first message; that scope is then
locked so follow-up questions cannot pull context from a different PDF set.
Vector searches are filtered to only those selected PDFs. Chat turns and chat
metadata are stored in a separate Qdrant collection
(`pdf_chunks_chat_history` by default), while the browser stores only the
currently selected conversation ID. Existing deployments create the required
collection and payload indexes automatically when the server restarts.
