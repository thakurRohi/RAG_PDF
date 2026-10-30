import { HttpError } from '../errors.js';

export const registerHealthRoutes = (app, dependencies) => {
  const {
    asyncHandler,
    redisPipeline,
    CACHE_PREFIX,
    cacheMetrics,
    EMBEDDING_CACHE_TTL_SECONDS,
    RETRIEVAL_CACHE_TTL_SECONDS,
    ANSWER_CACHE_TTL_SECONDS,
  } = dependencies;

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ status: 'All Good!' });
  }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/cache', asyncHandler(async (req, res) => {
    const [status] = await redisPipeline([['PING']]);
    if (status !== 'PONG') {
      throw new HttpError(503, 'Upstash Redis health check returned an unexpected response.');
    }

    res.json({
      status: 'connected',
      provider: 'Upstash Redis',
      metrics: {
        scope: 'This server process since startup; counters reset on restart.',
        ...cacheMetrics,
      },
      storage: {
        prefix: `${CACHE_PREFIX}:`,
        embeddings: `JSON vectors; ${EMBEDDING_CACHE_TTL_SECONDS} seconds TTL`,
        retrieval: `Retrieved chunk text and scores; ${RETRIEVAL_CACHE_TTL_SECONDS} seconds TTL`,
        answers: `Generated answers; ${ANSWER_CACHE_TTL_SECONDS} seconds TTL`,
      },
    });
  }));

};
