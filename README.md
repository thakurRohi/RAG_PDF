# PDF RAG

PDF search uses hosted vector embeddings and a hosted vector database. It does
not download embedding models, run a local vector database, or save uploaded
PDFs/chunks to local files.

## Online setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/),
   a Groq API key in [Groq Console](https://console.groq.com/keys), and a
   free-tier cluster in [Qdrant Cloud](https://cloud.qdrant.io/). Free quotas
   and availability are controlled by those providers and can change.
2. Copy `server/.env.example` to `server/.env` and fill in the Gemini and Groq
   API keys, Qdrant cluster URL, and Qdrant API key. `GROQ_MODEL` defaults to
   `openai/gpt-oss-120b`; choose a chat model enabled for your key from Groq's
   [Models page](https://console.groq.com/docs/models). `QDRANT_COLLECTION` can
   stay as `pdf_chunks`. The server creates the collection with 768-dimensional
   cosine vectors if it does not exist.
3. Configure `NEXT_PUBLIC_API_URL` in `client/.env.local` to point to the
   deployed server URL (or use `http://localhost:8000` when running the app
   locally). Start the server and client using their `npm run dev` scripts.

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

Chats appear in a conversation sidebar and each has its own saved history.
Choose one or more PDFs for a chat before its first message; that scope is then
locked so follow-up questions cannot pull context from a different PDF set.
Vector searches are filtered to only those selected PDFs. Chat turns and chat
metadata are stored in a separate Qdrant collection
(`pdf_chunks_chat_history` by default), while the browser stores only the
currently selected conversation ID. Existing deployments create the required
collection and payload indexes automatically when the server restarts.
