import { randomUUID } from 'node:crypto';
import pdfParse from 'pdf-parse';
import { HttpError } from '../errors.js';

export const registerDocumentRoutes = (app, dependencies) => {
  const {
    asyncHandler,
    qdrantRequest,
    QDRANT_COLLECTION,
    upload,
    splitTextIntoChunks,
    getCustomJinaApiKey,
    embedTexts,
    invalidateDocumentCaches,
    getPointCount,
    deleteEmbeddingCacheForNamespace,
  } = dependencies;

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
            filter: { must: [{ key: 'ownerId', match: { value: req.userId } }] },
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
    const embeddingNamespace = `${req.userId}:${source}`;
    const customJinaApiKey = await getCustomJinaApiKey(req);

    try {
      const { vectors, provider } = await embedTexts(
        chunks,
        'RETRIEVAL_DOCUMENT',
        embeddingNamespace,
        undefined,
        customJinaApiKey,
        req.userId
      );
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
                ownerId: req.userId,
                embeddingProvider: provider,
                chunkIndex: index + 1,
                totalChunks: chunks.length,
                text,
                uploadedAt,
              },
            })),
          }),
        }
      );
      await invalidateDocumentCaches();
    } catch (error) {
      console.error('Failed to embed or index PDF:', error.message);
      throw error;
    }

    res.json({
      message: 'uploaded',
      source,
      chunks: chunks.length,
      totalDocuments: await getPointCount(req.userId),
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
          filter: {
            must: [
              { key: 'source', match: { value: source } },
              { key: 'ownerId', match: { value: req.userId } },
            ],
          },
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
          filter: {
            must: [
              { key: 'source', match: { value: source } },
              { key: 'ownerId', match: { value: req.userId } },
            ],
          },
        }),
      }
    );
    await deleteEmbeddingCacheForNamespace(`${req.userId}:${source}`);
    await invalidateDocumentCaches();

    res.json({
      message: 'deleted',
      source,
      remainingDocuments: await getPointCount(req.userId),
    });
  }));

};
