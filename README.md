# PDF RAG

PDF search uses hosted vector embeddings and a hosted vector database. It does
not download embedding models, run a local vector database, or save uploaded
PDFs/chunks to local files.

## Online setup

1. Create a project in [Supabase](https://supabase.com/), then enable Google in
   **Authentication → Sign In / Providers**. Configure Google's OAuth client
   with the callback URL shown by Supabase. In Supabase **Authentication → URL
   Configuration**, set the local site URL to `http://localhost:3000` and add
   `http://localhost:3000/auth/callback` to the allowed redirect URLs. Add the
   production app URL and its `/auth/callback` URL before deploying.
2. Create a Jina API key from [Jina](https://jina.ai/embeddings/), a Gemini API
   key in [Google AI Studio](https://aistudio.google.com/) for embedding
   fallback, a Groq API key in [Groq Console](https://console.groq.com/keys),
   and a free-tier cluster in [Qdrant Cloud](https://cloud.qdrant.io/). Free
   quotas and availability are controlled by those providers and can change.
3. Create a free Redis database in [Upstash](https://console.upstash.com/).
   Copy `server/.env.example` to `server/.env` and set `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` from the Supabase project's API settings, as well as
   the Jina and Gemini embedding keys (Gemini is optional but recommended as
   a fallback), Groq key, Qdrant cluster URL/API key, and Upstash REST
   URL/token. Set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the same Supabase project values in
   `client/.env.local.example` copied to `client/.env.local`. The anon/publishable
   key is intended for client use; never put a Supabase service-role key in the
   client. Jina is used for embeddings when `JINA_API_KEY` is configured;
   Gemini remains an automatic fallback when Jina requests fail.
   In Upstash, open the database's **Connect** page and copy the REST URL and
   REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
   `GROQ_MODEL` defaults to
   `openai/gpt-oss-120b`; choose a chat model enabled for your key from Groq's
   [Models page](https://console.groq.com/docs/models). `QDRANT_COLLECTION` can
   stay as `pdf_chunks`. The server creates the collection with 768-dimensional
   cosine vectors if it does not exist.
4. Configure `NEXT_PUBLIC_API_URL` in `client/.env.local` to point to the
   deployed server URL (or use `http://localhost:8000` when running the app
   locally). Start the server and client using their `npm run dev` scripts.
   Development uses Webpack and a separate `.next-dev` output directory so
   Windows dev manifests do not contend with the production build output.

## Deploying the client to Vercel and the server to Render

- In Render, configure the web service with the repository's `server` root
  directory, `npm install` as the build command, and `npm start` as the start
  command. Add the variables from `server/.env.example` in the Render
  dashboard, including `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the local
  `server/.env` file is not deployed. Use Render's assigned `PORT`.
- Deploy the latest backend revision. Check that `GET /chats` and
  `GET /health/cache` on the Render service no longer return 404; `/chats`
  should return JSON. A 404 on either route means the deployed server does not
  have the current API routes.
- In Vercel, set `NEXT_PUBLIC_API_URL` to the Render service's base URL only
  (for example, `https://your-service.onrender.com`, with no `/api` path).
  Also set `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` for each relevant environment. Add the
  Vercel app URL and its `/auth/callback` URL to the Supabase allowed redirect
  URLs, then redeploy the client after changing environment variables, since
  these values are included during the Next.js build.

The server parses each uploaded PDF in memory, sends its text chunks to Jina
for embeddings, and stores the text and vectors in Qdrant Cloud. Questions are
embedded by the same provider and searched in Qdrant; Gemini is retained as an
automatic fallback for embedding requests, and Groq generates a
natural-language answer using the retrieved passages. `JINA_API_KEY` or
`GEMINI_API_KEY` is required. PDF files are not retained by the server;
extracted text and questions are sent to the configured providers. The service
requires the cloud credentials above and intentionally does not fall back to
local storage.

Users sign in with Google through Supabase Auth. The server verifies Supabase
access tokens and scopes PDF chunks, chat records, searches, and deletions to
the authenticated user; a client-supplied user ID is never trusted. Existing
Qdrant records created before authentication have no owner association, so they
are not visible to signed-in accounts. Back them up or remove them from Qdrant
before enabling this version; assign legacy records only if you can establish
their rightful owner.

Gemini embedding requests are retried once when Google returns a short
rate-limit delay. Creating chats does not call an embedding provider; only PDF
indexing and user-question searches need embeddings. Existing Gemini-indexed
PDF chunks (including older chunks without provider metadata) remain searchable
with Gemini; re-upload them to index them with Jina. The server filters
retrieval by embedding provider to avoid comparing vectors from different
models.

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
currently selected conversation ID in a per-account browser-storage key.
Existing deployments create the required
collection and payload indexes automatically when the server restarts.
