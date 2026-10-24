# PDF RAG

PDF search uses hosted vector embeddings and a hosted vector database. It does
not download embedding models, run a local vector database, or save uploaded
PDFs/chunks to local files.

## Online setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/)
   and a free-tier cluster in [Qdrant Cloud](https://cloud.qdrant.io/). Free
   quotas and availability are controlled by those providers and can change.
2. Copy `server/.env.example` to `server/.env` and fill in the Gemini API key,
   Qdrant cluster URL, and Qdrant API key. `QDRANT_COLLECTION` can stay as
   `pdf_chunks`. The server creates that collection with 768-dimensional cosine
   vectors if it does not exist.
3. Configure `NEXT_PUBLIC_API_URL` in `client/.env.local` to point to the
   deployed server URL (or use `http://localhost:8000` when running the app
   locally). Start the server and client using their `npm run dev` scripts.

The server parses each uploaded PDF in memory, sends its text chunks to Gemini
for embeddings, and stores the text and vectors in Qdrant Cloud. Questions are
embedded by Gemini and searched in Qdrant. PDF files are not retained by the
server; extracted text and questions are sent to the configured providers.
The service requires the cloud credentials above and intentionally does not
fall back to local storage.
