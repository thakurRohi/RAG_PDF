import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { HttpError } from './errors.js';

export const createInfrastructure = (settings) => {
  const {
    EMBEDDING_DIMENSIONS,
    EMBEDDING_CACHE_TTL_SECONDS,
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
    QDRANT_URL,
    QDRANT_API_KEY,
    CREDENTIAL_ENCRYPTION_KEY,
    CACHE_PREFIX,
    CREDENTIAL_ENCRYPTION_ALGORITHM,
    JINA_KEY_USAGE_CATEGORIES,
    APP_DEFAULT_JINA_KEY_ID,
  } = settings;
  const cacheMetrics = {
    embeddings: { hits: 0, misses: 0, writes: 0 },
    retrieval: { hits: 0, misses: 0, writes: 0 },
    answers: { hits: 0, misses: 0, writes: 0 },
  };

  const getCredentialEncryptionKey = () => {
    if (!CREDENTIAL_ENCRYPTION_KEY) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured.');
    }
    const key = Buffer.from(CREDENTIAL_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
    return key;
  };

  const encryptCredential = (value, userId, keyId) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      CREDENTIAL_ENCRYPTION_ALGORITHM,
      getCredentialEncryptionKey(),
      iv
    );
    cipher.setAAD(Buffer.from(keyId === null ? userId : `${userId}:${keyId}`));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });
  };

  const decryptCredential = (encrypted, userId, keyId) => {
    try {
      const record = JSON.parse(encrypted);
      const decipher = createDecipheriv(
        CREDENTIAL_ENCRYPTION_ALGORITHM,
        getCredentialEncryptionKey(),
        Buffer.from(record.iv, 'base64')
      );
      decipher.setAAD(Buffer.from(keyId === null ? userId : `${userId}:${keyId}`));
      decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new HttpError(
        503,
        'The saved Jina key could not be decrypted. Check the server credential-encryption configuration.'
      );
    }
  };

  const jinaCredentialIndexKey = (userId) =>
    `${CACHE_PREFIX}:user-jina-keys:${cacheDigest(userId)}`;

  const jinaCredentialRecordKey = (userId, keyId) =>
    `${jinaCredentialIndexKey(userId)}:${keyId}`;

  const jinaCredentialActiveKey = (userId) =>
    `${jinaCredentialIndexKey(userId)}:active`;

  const jinaCredentialUsageKey = (userId, keyId, category) =>
    `${jinaCredentialIndexKey(userId)}:${keyId}:usage:${category}`;

  const legacyJinaCredentialKey = (userId) =>
    `${CACHE_PREFIX}:user-jina-key:${cacheDigest(userId)}`;

  const qdrantRequest = async (endpoint, options = {}) => {
    const response = await fetch(`${QDRANT_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'api-key': QDRANT_API_KEY,
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = body?.status?.error || body?.status || response.statusText;
      throw new HttpError(503, `Qdrant request failed (${response.status}): ${detail}`);
    }

    return body?.result;
  };

  const redisPipeline = async (commands) => {
    const response = await fetch(`${UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result)) {
      throw new HttpError(503, `Upstash cache request failed (${response.status}).`);
    }

    const commandError = result.find((entry) => entry.error);
    if (commandError) {
      throw new HttpError(503, `Upstash cache command failed: ${commandError.error}`);
    }
    return result.map((entry) => entry.result);
  };

  const cacheGetMany = async (keys, category) => {
    if (!keys.length) return [];
    const values = await redisPipeline(keys.map((key) => ['GET', key]));
    if (category && cacheMetrics[category]) {
      for (const value of values) {
        if (value === null || value === undefined) cacheMetrics[category].misses += 1;
        else cacheMetrics[category].hits += 1;
      }
    }
    return values.map((value) => value ?? null);
  };

  const cacheSetMany = async (entries, ttlSeconds, category, embeddingNamespace) => {
    if (!entries.length) return;
    const commands = entries.map(({ key, value }) => [
      'SET',
      key,
      JSON.stringify(value),
      'EX',
      ttlSeconds,
    ]);
    if (embeddingNamespace) {
      const registryKey = embeddingRegistryKey(embeddingNamespace);
      commands.push(['SADD', registryKey, ...entries.map(({ key }) => key)]);
      commands.push(['EXPIRE', registryKey, EMBEDDING_CACHE_TTL_SECONDS]);
    }
    await redisPipeline(commands);
    if (category && cacheMetrics[category]) {
      cacheMetrics[category].writes += entries.length;
    }
  };

  const cacheDigest = (value) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

  const recordJinaKeyUsage = async (userId, keyId, category, totalTokens) => {
    if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) {
      console.warn('Jina did not return a valid total_tokens value; usage was not recorded.');
      return;
    }
    await redisPipeline([
      ['INCRBY', jinaCredentialUsageKey(userId, keyId, category), totalTokens],
      ['INCRBY', jinaCredentialUsageKey(userId, keyId, 'total'), totalTokens],
    ]);
  };

  const getJinaKeysState = async (userId) => {
    const indexKey = jinaCredentialIndexKey(userId);
    let [keyIds, activeKeyId, legacyEncryptedKey] = await redisPipeline([
      ['SMEMBERS', indexKey],
      ['GET', jinaCredentialActiveKey(userId)],
      ['GET', legacyJinaCredentialKey(userId)],
    ]);

    if ((!Array.isArray(keyIds) || keyIds.length === 0) && legacyEncryptedKey) {
      const legacyApiKey = decryptCredential(legacyEncryptedKey, userId, null);
      const migratedKeyId = `legacy-${cacheDigest(userId).slice(0, 12)}`;
      const migratedRecord = {
        label: 'Migrated Jina key',
        encryptedKey: encryptCredential(legacyApiKey, userId, migratedKeyId),
        maskedKey: `****${legacyApiKey.slice(-4)}`,
        createdAt: new Date().toISOString(),
      };
      await redisPipeline([
        ['SET', jinaCredentialRecordKey(userId, migratedKeyId), JSON.stringify(migratedRecord)],
        ['SADD', indexKey, migratedKeyId],
        ['SET', jinaCredentialActiveKey(userId), migratedKeyId, 'NX'],
        ['DEL', legacyJinaCredentialKey(userId)],
      ]);
      [keyIds, activeKeyId] = await redisPipeline([
        ['SMEMBERS', indexKey],
        ['GET', jinaCredentialActiveKey(userId)],
      ]);
    }

    const availableKeyIds = Array.isArray(keyIds) ? keyIds : [];
    const records = availableKeyIds.length
      ? await redisPipeline(availableKeyIds.map((keyId) => [
        'GET',
        jinaCredentialRecordKey(userId, keyId),
      ]))
      : [];
    const usageValues = availableKeyIds.length
      ? await redisPipeline(availableKeyIds.flatMap((keyId) => [
        ...JINA_KEY_USAGE_CATEGORIES.map((category) => [
          'GET',
          jinaCredentialUsageKey(userId, keyId, category),
        ]),
        ['GET', jinaCredentialUsageKey(userId, keyId, 'total')],
      ]))
      : [];
    const appDefaultUsageValues = await redisPipeline([
      ...JINA_KEY_USAGE_CATEGORIES.map((category) => [
        'GET',
        jinaCredentialUsageKey(userId, APP_DEFAULT_JINA_KEY_ID, category),
      ]),
      ['GET', jinaCredentialUsageKey(userId, APP_DEFAULT_JINA_KEY_ID, 'total')],
    ]);
    const appDefaultUsageNumbers = appDefaultUsageValues.map((value) => {
      const parsed = Number(value || 0);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new HttpError(503, 'Upstash returned invalid default Jina usage totals.');
      }
      return parsed;
    });
    const keys = [];
    for (let index = 0; index < availableKeyIds.length; index += 1) {
      const keyId = availableKeyIds[index];
      const rawRecord = records[index];
      if (!rawRecord) continue;
      let record;
      try {
        record = JSON.parse(rawRecord);
      } catch {
        throw new HttpError(503, 'Upstash returned an invalid saved Jina key record.');
      }
      const usageNumbers = usageValues
        .slice(index * (JINA_KEY_USAGE_CATEGORIES.length + 1), (index + 1) * (JINA_KEY_USAGE_CATEGORIES.length + 1))
        .map((value) => {
          const parsed = Number(value || 0);
          if (!Number.isSafeInteger(parsed) || parsed < 0) {
            throw new HttpError(503, 'Upstash returned invalid Jina usage totals.');
          }
          return parsed;
        });
      keys.push({
        id: keyId,
        label: record.label,
        maskedKey: record.maskedKey,
        createdAt: record.createdAt,
        usage: {
          indexingTokens: usageNumbers[0],
          searchTokens: usageNumbers[1],
          validationTokens: usageNumbers[2],
          totalTokens: usageNumbers[3],
        },
      });
    }
    keys.sort((left, right) =>
      left.label.localeCompare(right.label) || left.createdAt.localeCompare(right.createdAt)
    );
    return {
      keys,
      activeKeyId: keys.some((key) => key.id === activeKeyId) ? activeKeyId : null,
      appDefaultJinaUsage: {
        indexingTokens: appDefaultUsageNumbers[0],
        searchTokens: appDefaultUsageNumbers[1],
        validationTokens: appDefaultUsageNumbers[2],
        totalTokens: appDefaultUsageNumbers[3],
      },
    };
  };

  const embeddingRegistryKey = (namespace) =>
    `${CACHE_PREFIX}:embedding-keys:${cacheDigest(namespace)}`;

  const deleteEmbeddingCacheForNamespace = async (namespace) => {
    const registryKey = embeddingRegistryKey(namespace);
    const [keys] = await redisPipeline([['SMEMBERS', registryKey]]);
    const commands = [];
    if (Array.isArray(keys) && keys.length) {
      for (let start = 0; start < keys.length; start += 500) {
        commands.push(['DEL', ...keys.slice(start, start + 500)]);
      }
    }
    commands.push(['DEL', registryKey]);
    await redisPipeline(commands);
  };

  const getDocumentGeneration = async () => {
    const [generation] = await redisPipeline([['GET', `${CACHE_PREFIX}:document-generation`]]);
    const parsed = Number(generation || 0);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new HttpError(503, 'Upstash returned an invalid document cache generation.');
    }
    return parsed;
  };

  const invalidateDocumentCaches = async () => {
    await redisPipeline([['INCR', `${CACHE_PREFIX}:document-generation`]]);
  };

  const ensureCollection = async (collectionName) => {
    const endpoint = `/collections/${encodeURIComponent(collectionName)}`;
    const response = await fetch(`${QDRANT_URL}${endpoint}`, {
      headers: { 'api-key': QDRANT_API_KEY },
    });

    if (response.status === 404) {
      await qdrantRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
          vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
        }),
      });
      console.log(`Created Qdrant collection: ${collectionName}`);
      return;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body?.status?.error || body?.status || response.statusText;
      throw new Error(`Could not inspect Qdrant collection (${response.status}): ${detail}`);
    }

    const size = body?.result?.config?.params?.vectors?.size;
    if (size !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Qdrant collection "${collectionName}" must use ${EMBEDDING_DIMENSIONS}-dimension vectors; found ${size ?? 'an incompatible vector configuration'}.`
      );
    }
  };

  const ensurePayloadIndex = async (collectionName, fieldName) => {
    const collection = await qdrantRequest(
      `/collections/${encodeURIComponent(collectionName)}`
    );
    const existingIndex = collection?.payload_schema?.[fieldName]?.data_type;
    if (existingIndex === 'keyword' || existingIndex === 'uuid') return;
    if (existingIndex) {
      throw new Error(
        `Qdrant payload index "${fieldName}" in "${collectionName}" must be keyword or uuid; found ${existingIndex}.`
      );
    }

    await qdrantRequest(
      `/collections/${encodeURIComponent(collectionName)}/index?wait=true`,
      {
        method: 'PUT',
        body: JSON.stringify({
          field_name: fieldName,
          field_schema: 'keyword',
        }),
      }
    );
    console.log(`Created Qdrant payload index: ${collectionName}.${fieldName}`);
  };


  return {
    getCredentialEncryptionKey,
    encryptCredential,
    decryptCredential,
    jinaCredentialIndexKey,
    jinaCredentialRecordKey,
    jinaCredentialActiveKey,
    jinaCredentialUsageKey,
    legacyJinaCredentialKey,
    qdrantRequest,
    redisPipeline,
    cacheGetMany,
    cacheSetMany,
    cacheDigest,
    recordJinaKeyUsage,
    getJinaKeysState,
    deleteEmbeddingCacheForNamespace,
    getDocumentGeneration,
    invalidateDocumentCaches,
    ensureCollection,
    ensurePayloadIndex,
    cacheMetrics,
  };
};
