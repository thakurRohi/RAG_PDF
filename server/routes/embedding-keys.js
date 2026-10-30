import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors.js';

export const registerEmbeddingKeyRoutes = (app, dependencies) => {
  const {
    asyncHandler,
    getJinaKeysState,
    requestJinaEmbeddings,
    encryptCredential,
    jinaCredentialRecordKey,
    jinaCredentialIndexKey,
    jinaCredentialActiveKey,
    JINA_KEY_USAGE_CATEGORIES,
    jinaCredentialUsageKey,
    redisPipeline,
    decryptCredential,
  } = dependencies;

  app.get('/embedding-keys', asyncHandler(async (req, res) => {
    res.json(await getJinaKeysState(req.userId));
  }));

  app.post('/embedding-keys', asyncHandler(async (req, res) => {
    const jinaApiKey = String(req.body?.jinaApiKey ?? '').trim();
    const label = String(req.body?.label ?? '').trim();
    if (!jinaApiKey) {
      throw new HttpError(400, 'Enter a Jina API key.');
    }
    if (jinaApiKey.length > 2048) {
      throw new HttpError(400, 'The Jina API key is too long.');
    }
    if (!label || label.length > 50) {
      throw new HttpError(400, 'Enter a key label of 1 to 50 characters.');
    }

    const existingState = await getJinaKeysState(req.userId);
    if (existingState.keys.some((key) => key.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new HttpError(409, 'A saved Jina key already uses that label.');
    }

    const validation = await requestJinaEmbeddings(
      [{ text: 'Validate this Jina API key.', index: 0 }],
      'RETRIEVAL_QUERY',
      jinaApiKey
    );
    const keyId = randomUUID();
    const record = {
      label,
      encryptedKey: encryptCredential(jinaApiKey, req.userId, keyId),
      maskedKey: `****${jinaApiKey.slice(-4)}`,
      createdAt: new Date().toISOString(),
    };
    const saveCommands = [
      ['SET', jinaCredentialRecordKey(req.userId, keyId), JSON.stringify(record)],
      ['SADD', jinaCredentialIndexKey(req.userId), keyId],
      ['SET', jinaCredentialActiveKey(req.userId), keyId],
    ];
    if (Number.isSafeInteger(validation.totalTokens) && validation.totalTokens >= 0) {
      saveCommands.push(
        ['INCRBY', jinaCredentialUsageKey(req.userId, keyId, 'validation'), validation.totalTokens],
        ['INCRBY', jinaCredentialUsageKey(req.userId, keyId, 'total'), validation.totalTokens]
      );
    } else {
      console.warn('Jina key validation succeeded without total_tokens usage metadata.');
    }
    await redisPipeline(saveCommands);
    res.status(201).json(await getJinaKeysState(req.userId));
  }));

  app.put('/embedding-keys/active', asyncHandler(async (req, res) => {
    const keyId = req.body?.keyId;
    if (keyId === null) {
      await redisPipeline([['DEL', jinaCredentialActiveKey(req.userId)]]);
      res.json(await getJinaKeysState(req.userId));
      return;
    }
    if (typeof keyId !== 'string' || !/^[\w-]{1,100}$/.test(keyId)) {
      throw new HttpError(400, 'Select a valid saved Jina key.');
    }

    const [record] = await redisPipeline([
      ['GET', jinaCredentialRecordKey(req.userId, keyId)],
    ]);
    if (!record) throw new HttpError(404, 'Saved Jina key not found.');
    await redisPipeline([['SET', jinaCredentialActiveKey(req.userId), keyId]]);
    res.json(await getJinaKeysState(req.userId));
  }));

  app.delete('/embedding-keys/:keyId', asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    if (!/^[\w-]{1,100}$/.test(keyId)) {
      throw new HttpError(400, 'Invalid saved Jina key ID.');
    }
    const recordKey = jinaCredentialRecordKey(req.userId, keyId);
    const [record, activeKeyId] = await redisPipeline([
      ['GET', recordKey],
      ['GET', jinaCredentialActiveKey(req.userId)],
    ]);
    if (!record) throw new HttpError(404, 'Saved Jina key not found.');

    await redisPipeline([
      ['SREM', jinaCredentialIndexKey(req.userId), keyId],
      ['DEL', recordKey],
      ...[...JINA_KEY_USAGE_CATEGORIES, 'total'].map((category) => [
        'DEL',
        jinaCredentialUsageKey(req.userId, keyId, category),
      ]),
    ]);
    if (activeKeyId === keyId) {
      const [remainingIds] = await redisPipeline([
        ['SMEMBERS', jinaCredentialIndexKey(req.userId)],
      ]);
      if (Array.isArray(remainingIds) && remainingIds.length) {
        await redisPipeline([
          ['SET', jinaCredentialActiveKey(req.userId), remainingIds[0]],
        ]);
      } else {
        await redisPipeline([['DEL', jinaCredentialActiveKey(req.userId)]]);
      }
    }
    res.json(await getJinaKeysState(req.userId));
  }));

  const getCustomJinaApiKey = async (req) => {
    const mode = req.get('x-embedding-key-mode');
    if (mode === undefined) return undefined;
    if (mode === 'app') return undefined;
    if (mode !== 'custom') {
      throw new HttpError(400, 'Invalid embedding API key mode.');
    }

    const [activeKeyId] = await redisPipeline([
      ['GET', jinaCredentialActiveKey(req.userId)],
    ]);
    if (!activeKeyId) {
      throw new HttpError(400, 'Select a saved Jina API key or choose the app’s key.');
    }
    const [rawRecord] = await redisPipeline([
      ['GET', jinaCredentialRecordKey(req.userId, activeKeyId)],
    ]);
    if (!rawRecord) throw new HttpError(404, 'The selected Jina API key was not found.');
    let record;
    try {
      record = JSON.parse(rawRecord);
    } catch {
      throw new HttpError(503, 'Upstash returned an invalid saved Jina key record.');
    }
    return {
      userId: req.userId,
      keyId: activeKeyId,
      apiKey: decryptCredential(record.encryptedKey, req.userId, activeKeyId),
    };
  };
    return getCustomJinaApiKey;
};
