import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors.js';

export const registerChatRoutes = (app, dependencies) => {
  const {
    asyncHandler,
    qdrantRequest,
    QDRANT_CHAT_COLLECTION,
    QDRANT_COLLECTION,
    METADATA_VECTOR,
    isConversationId,
    persistChatTurn,
    getCustomJinaApiKey,
    embedTexts,
    getDocumentGeneration,
    cacheDigest,
    CACHE_PREFIX,
    cacheGetMany,
    RETRIEVAL_CACHE_TTL_SECONDS,
    cacheSetMany,
    generateAnswer,
  } = dependencies;

  const getConversation = async (conversationId, userId) => {
    const result = await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/scroll`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          with_vectors: false,
          filter: {
            must: [
              { key: 'recordType', match: { value: 'conversation' } },
              { key: 'conversationId', match: { value: conversationId } },
              { key: 'ownerId', match: { value: userId } },
            ],
          },
        }),
      }
    );
    const point = result?.points?.[0];
    if (!point) throw new HttpError(404, 'Chat not found.');
    return point.payload;
  };

  app.get('/chats', asyncHandler(async (req, res) => {
    const chats = [];
    let offset;
    do {
      const result = await qdrantRequest(
        `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/scroll`,
        {
          method: 'POST',
          body: JSON.stringify({
            limit: 1000,
            with_payload: true,
            with_vectors: false,
            filter: {
              must: [
                { key: 'recordType', match: { value: 'conversation' } },
                { key: 'ownerId', match: { value: req.userId } },
              ],
            },
            ...(offset !== undefined ? { offset } : {}),
          }),
        }
      );
      chats.push(...(result?.points || []).map((point) => point.payload));
      offset = result?.next_page_offset;
    } while (offset !== null && offset !== undefined);

    chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ chats });
  }));

  app.post('/chats', asyncHandler(async (req, res) => {
    const conversationId = randomUUID();
    const now = new Date().toISOString();
    const chat = {
      conversationId,
      ownerId: req.userId,
      recordType: 'conversation',
      title: 'New chat',
      selectedSources: [],
      hasMessages: false,
      createdAt: now,
      updatedAt: now,
    };

    await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points`,
      {
        method: 'PUT',
        body: JSON.stringify({
          wait: true,
          points: [{ id: conversationId, vector: METADATA_VECTOR, payload: chat }],
        }),
      }
    );
    res.status(201).json({ chat });
  }));

  app.patch('/chats/:conversationId', asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    if (!isConversationId(conversationId)) {
      throw new HttpError(400, 'Invalid conversation ID.');
    }

    const conversation = await getConversation(conversationId, req.userId);
    const selectedSources = req.body?.selectedSources;
    if (
      !Array.isArray(selectedSources) ||
      selectedSources.some((source) => typeof source !== 'string' || !source.trim()) ||
      new Set(selectedSources).size !== selectedSources.length
    ) {
      throw new HttpError(400, 'selectedSources must be an array of unique document names.');
    }
    for (const source of selectedSources) {
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
        throw new HttpError(400, `Selected PDF "${source}" is not available.`);
      }
    }

    const updatedAt = new Date().toISOString();
    await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/payload?wait=true`,
      {
        method: 'POST',
        body: JSON.stringify({
          points: [conversationId],
          payload: { selectedSources, updatedAt },
        }),
      }
    );
    res.json({
      chat: { ...conversation, selectedSources, updatedAt },
    });
  }));

  app.delete('/chats/:conversationId', asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    if (!isConversationId(conversationId)) {
      throw new HttpError(400, 'Invalid conversation ID.');
    }
    await getConversation(conversationId, req.userId);
    await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/delete`,
      {
        method: 'POST',
        body: JSON.stringify({
          wait: true,
          filter: {
            must: [
              { key: 'conversationId', match: { value: conversationId } },
              { key: 'ownerId', match: { value: req.userId } },
            ],
          },
        }),
      }
    );
    res.json({ message: 'deleted', conversationId });
  }));

  app.get('/chat/history/:conversationId', asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    if (!isConversationId(conversationId)) {
      throw new HttpError(400, 'Invalid conversation ID.');
    }
    await getConversation(conversationId, req.userId);

    const turns = [];
    let offset;
    do {
      const result = await qdrantRequest(
        `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/scroll`,
        {
          method: 'POST',
          body: JSON.stringify({
            limit: 1000,
            with_payload: [
              'userMessage',
              'assistantMessage',
              'sources',
              'createdAt',
              'needsFullLlmSearch',
              'answerMode',
            ],
            with_vectors: false,
            filter: {
              must: [
                { key: 'conversationId', match: { value: conversationId } },
                { key: 'ownerId', match: { value: req.userId } },
              ],
            },
            ...(offset !== undefined ? { offset } : {}),
          }),
        }
      );

      turns.push(...(result?.points || [])
        .filter((point) => point.payload?.recordType === 'turn' || point.payload?.userMessage)
        .map((point) => ({
        id: point.id,
        ...point.payload,
        })));
      offset = result?.next_page_offset;
    } while (offset !== null && offset !== undefined);

    turns.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) || String(a.id).localeCompare(String(b.id))
    );
    res.json({
      messages: turns.flatMap((turn) => [
        { role: 'user', content: turn.userMessage },
        {
          role: 'assistant',
          content: turn.assistantMessage,
          sources: turn.sources || [],
          needsFullLlmSearch: turn.needsFullLlmSearch === true,
          answerMode: turn.answerMode === 'full' ? 'full' : 'grounded',
        },
      ]),
    });
  }));

  const handleChat = asyncHandler(async (req, res) => {
    const userQuery = String(req.body?.message ?? req.query?.message ?? '').trim();
    const conversationId = req.body?.conversationId;
    const answerMode = req.body?.answerMode ?? req.query?.answerMode ?? 'grounded';
    if (!userQuery) {
      throw new HttpError(400, 'Query message is required.');
    }
    if (answerMode !== 'grounded' && answerMode !== 'full') {
      throw new HttpError(400, 'Invalid answer mode.');
    }
    if (!isConversationId(conversationId)) {
      throw new HttpError(400, 'Invalid conversation ID.');
    }
    const conversation = await getConversation(conversationId, req.userId);
    const selectedSources = conversation.selectedSources || [];
    const customJinaApiKey = await getCustomJinaApiKey(req);
    if (!selectedSources.length) {
      throw new HttpError(400, 'Select at least one PDF for this chat before sending a message.');
    }

    const jinaDocumentCount = await qdrantRequest(
      `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/count`,
      {
        method: 'POST',
        body: JSON.stringify({
          exact: true,
          filter: {
            must: [
              { key: 'source', match: { any: selectedSources } },
              { key: 'embeddingProvider', match: { value: 'jina' } },
              { key: 'ownerId', match: { value: req.userId } },
            ],
          },
        }),
      }
    );
    if (customJinaApiKey) {
      if (!jinaDocumentCount?.count) {
        throw new HttpError(
          409,
          'These PDFs were not indexed with Jina. Choose the app’s key or delete and re-upload the PDFs using your Jina key.'
        );
      }
      const nonJinaDocumentCount = await qdrantRequest(
        `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/count`,
        {
          method: 'POST',
          body: JSON.stringify({
            exact: true,
            filter: {
              must: [
                { key: 'source', match: { any: selectedSources } },
                { key: 'ownerId', match: { value: req.userId } },
              ],
              must_not: [{ key: 'embeddingProvider', match: { value: 'jina' } }],
            },
          }),
        }
      );
      if (nonJinaDocumentCount?.count) {
        throw new HttpError(
          409,
          'Some selected PDFs were not indexed with Jina. Delete and re-upload them using your Jina key before using it for this chat.'
        );
      }
    }
    const preferredProvider = jinaDocumentCount?.count ? 'jina' : 'gemini';

    const [{ vectors: [queryVector], provider }, documentGeneration] = await Promise.all([
      embedTexts(
        [userQuery],
        'RETRIEVAL_QUERY',
        req.userId,
        preferredProvider,
        customJinaApiKey,
        req.userId
      ),
      getDocumentGeneration(),
    ]);
    const retrievalCacheKey = `${CACHE_PREFIX}:retrieval:${cacheDigest([
      QDRANT_COLLECTION,
      provider,
      req.userId,
      documentGeneration,
      [...selectedSources].sort(),
      queryVector,
    ])}`;
    const [cachedRetrieval] = await cacheGetMany([retrievalCacheKey], 'retrieval');
    const loadRecentTurns = async () => {
      if (Array.isArray(conversation.recentTurns)) {
        return conversation.recentTurns
          .filter((turn) => turn.userMessage && turn.assistantMessage)
          .slice(-6);
      }

      const historyResult = await qdrantRequest(
        `/collections/${encodeURIComponent(QDRANT_CHAT_COLLECTION)}/points/scroll`,
        {
          method: 'POST',
          body: JSON.stringify({
            limit: 1000,
            with_payload: ['userMessage', 'assistantMessage', 'createdAt'],
            with_vectors: false,
            filter: {
              must: [
                { key: 'conversationId', match: { value: conversationId } },
                { key: 'ownerId', match: { value: req.userId } },
              ],
            },
          }),
        }
      );
      return (historyResult?.points || [])
        .map((point) => point.payload)
        .filter((turn) => turn.userMessage && turn.assistantMessage)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-6);
    };

    let scored;
    let previousTurns;
    if (cachedRetrieval !== null) {
      try {
        scored = JSON.parse(cachedRetrieval);
      } catch {
        throw new HttpError(503, 'Upstash returned invalid cached search results.');
      }
      if (!Array.isArray(scored)) {
        throw new HttpError(503, 'Upstash returned invalid cached search results.');
      }
      previousTurns = await loadRecentTurns();
    } else {
      const [result, recentTurns] = await Promise.all([
        qdrantRequest(
          `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/search`,
          {
            method: 'POST',
            body: JSON.stringify({
              vector: queryVector,
              limit: 5,
              with_payload: true,
              filter: {
                must: [
                  { key: 'source', match: { any: selectedSources } },
                  { key: 'ownerId', match: { value: req.userId } },
                  ...(provider === 'jina'
                    ? [{ key: 'embeddingProvider', match: { value: 'jina' } }]
                    : []),
                ],
                ...(provider === 'gemini'
                  ? {
                      should: [
                        { key: 'embeddingProvider', match: { value: 'gemini' } },
                        { is_empty: { key: 'embeddingProvider' } },
                      ],
                    }
                  : {}),
              },
            }),
          }
        ),
        loadRecentTurns(),
      ]);

      scored = (result || []).map((point) => ({
        ...point.payload,
        score: point.score,
      }));
      previousTurns = recentTurns;
      await cacheSetMany(
        [{ key: retrievalCacheKey, value: scored }],
        RETRIEVAL_CACHE_TTL_SECONDS,
        'retrieval'
      );
    }
    const answer = await generateAnswer(
        userQuery,
        scored,
        previousTurns,
        selectedSources,
        documentGeneration,
        req.userId,
        answerMode
      );
    const response = {
      ...answer,
      answerMode,
      sources: scored.map((doc) => ({
        source: doc.source,
        chunkIndex: doc.chunkIndex,
        totalChunks: doc.totalChunks,
        snippet: doc.text.slice(0, 220),
      })),
    };

    await persistChatTurn(
      conversationId,
      queryVector,
      userQuery,
      response,
      conversation,
      previousTurns,
      req.userId
    );
    res.json(response);
  });

  app.post('/chat', handleChat);
  app.get('/chat', handleChat);

};
