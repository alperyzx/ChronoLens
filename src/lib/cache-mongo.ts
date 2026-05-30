import { MongoClient, type Db } from 'mongodb';
import { getTTLForViewType, listCacheRecords, type CachedHistoricalEventSelection } from './cache-file';

type CacheDocument = {
  _id: string;
  key: string;
  data: CachedHistoricalEventSelection;
  viewType: 'today' | 'week';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type CacheStatsDocument = {
  _id: 'historical-events-cache-stats';
  hits: number;
  misses: number;
  lastUpdated: Date;
};

type CacheStats = {
  keys: number;
  expired?: number;
  totalFiles?: number;
  totalSizeBytes?: number;
  totalSizeMB?: number;
  hits: number;
  misses: number;
  hitRate: number;
  backend: 'mongodb';
};

const CACHE_COLLECTION = 'historical_event_cache';
const STATS_COLLECTION = 'historical_event_cache_stats';
const STATS_DOC_ID: CacheStatsDocument['_id'] = 'historical-events-cache-stats';

declare global {
  // eslint-disable-next-line no-var
  var __chronolensMongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __chronolensMongoHydrationPromise: Promise<void> | undefined;
}

function getMongoCredentials(): string | undefined {
  return process.env.MONGO_CREDENTIALS;
}

function shouldUseMongoCache(): boolean {
  return Boolean(getMongoCredentials());
}

function getMongoDatabaseName(uri: string): string {
  try {
    const parsed = new URL(uri);
    const pathname = parsed.pathname.replace(/^\//, '');
    return pathname || 'chronolens';
  } catch {
    return 'chronolens';
  }
}

function buildCacheDocument(key: string, data: CachedHistoricalEventSelection, viewType: 'today' | 'week', expiresAt: Date, createdAt: Date): CacheDocument {
  const now = new Date();

  return {
    _id: key,
    key,
    data,
    viewType,
    expiresAt,
    createdAt,
    updatedAt: now,
  };
}

async function getMongoClient(): Promise<MongoClient | undefined> {
  if (!shouldUseMongoCache()) {
    return undefined;
  }

  const uri = getMongoCredentials();
  if (!uri) {
    return undefined;
  }

  if (!globalThis.__chronolensMongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: false,
    });

    globalThis.__chronolensMongoClientPromise = client.connect().then(async connectedClient => {
      return connectedClient;
    });
  }

  return globalThis.__chronolensMongoClientPromise;
}

async function getDatabase(): Promise<Db | undefined> {
  const client = await getMongoClient();
  if (!client) {
    return undefined;
  }

  const uri = getMongoCredentials();
  if (!uri) {
    return undefined;
  }

  return client.db(getMongoDatabaseName(uri));
}

async function recordStats(delta: { hits?: number; misses?: number }): Promise<void> {
  try {
    const database = await getDatabase();
    if (!database) {
      return;
    }

    try {
      await database.collection<CacheStatsDocument>(STATS_COLLECTION).updateOne(
        { _id: STATS_DOC_ID },
        {
          $inc: {
            hits: delta.hits ?? 0,
            misses: delta.misses ?? 0,
          },
          $set: {
            lastUpdated: new Date(),
          },
          $setOnInsert: {
            hits: 0,
            misses: 0,
          },
        },
        { upsert: true }
      );
    } catch (innerError) {
      const msg = innerError && (innerError as Error).message ? (innerError as Error).message : '';
      if (msg.includes('Path collision')) {
        console.warn('Mongo cache stats schema collision detected — replacing stats doc with numeric counters.');
        await database.collection<CacheStatsDocument>(STATS_COLLECTION).replaceOne(
          { _id: STATS_DOC_ID },
          { hits: delta.hits ?? 0, misses: delta.misses ?? 0, lastUpdated: new Date() },
          { upsert: true }
        );
      } else {
        throw innerError;
      }
    }
  } catch (error) {
    console.warn('Mongo cache stats update skipped:', error);
  }
}

function toCacheDocument(key: string, data: CachedHistoricalEventSelection, viewType: 'today' | 'week'): CacheDocument {
  const now = new Date();
  const ttlSeconds = getTTLForViewType(viewType);
  const expiresAt = new Date(now.getTime() + (ttlSeconds * 1000));

  return buildCacheDocument(key, data, viewType, expiresAt, now);
}

async function upsertCacheDocument(document: CacheDocument): Promise<void> {
  const database = await getDatabase();
  if (!database) {
    return;
  }

  await database.collection<CacheDocument>(CACHE_COLLECTION).updateOne(
    { _id: document._id },
    {
      $set: {
        key: document.key,
        data: document.data,
        viewType: document.viewType,
        expiresAt: document.expiresAt,
        updatedAt: document.updatedAt,
      },
      $setOnInsert: {
        createdAt: document.createdAt,
      },
    },
    { upsert: true }
  );
}

async function readCacheDocument(key: string): Promise<CacheDocument | undefined> {
  const database = await getDatabase();
  if (!database) {
    return undefined;
  }

  const document = await database.collection<CacheDocument>(CACHE_COLLECTION).findOne({ _id: key });
  return document || undefined;
}

async function deleteExpiredDocument(key: string): Promise<void> {
  const database = await getDatabase();
  if (!database) {
    return;
  }

  await database.collection<CacheDocument>(CACHE_COLLECTION).deleteOne({ _id: key }).catch(() => undefined);
}

export async function setCacheData(key: string, data: CachedHistoricalEventSelection, viewType: 'today' | 'week'): Promise<void> {
  await upsertCacheDocument(toCacheDocument(key, data, viewType));
}

export async function setCacheDataWithExpiration(
  key: string,
  data: CachedHistoricalEventSelection,
  viewType: 'today' | 'week',
  expiresAt: number,
  createdAt: number
): Promise<void> {
  await upsertCacheDocument(
    buildCacheDocument(key, data, viewType, new Date(expiresAt), new Date(createdAt))
  );
}

export async function getCacheData(key: string): Promise<CachedHistoricalEventSelection | undefined> {
  try {
    const document = await readCacheDocument(key);

    if (!document) {
      await recordStats({ misses: 1 });
      return undefined;
    }

    if (Date.now() > document.expiresAt.getTime()) {
      await deleteExpiredDocument(key);
      await recordStats({ misses: 1 });
      return undefined;
    }

    await recordStats({ hits: 1 });
    return document.data;
  } catch (error) {
    console.error('Error getting Mongo cache data:', error);
    await recordStats({ misses: 1 });
    return undefined;
  }
}

export async function hasValidCache(key: string): Promise<boolean> {
  try {
    const document = await readCacheDocument(key);
    if (!document) {
      return false;
    }

    if (Date.now() > document.expiresAt.getTime()) {
      await deleteExpiredDocument(key);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking Mongo cache validity:', error);
    return false;
  }
}

export async function clearCache(): Promise<void> {
  const database = await getDatabase();
  if (!database) {
    return;
  }

  await Promise.all([
    database.collection<CacheDocument>(CACHE_COLLECTION).deleteMany({}),
    database.collection<CacheStatsDocument>(STATS_COLLECTION).deleteMany({}),
  ]);
}

export async function cleanupExpiredCache(): Promise<void> {
  const database = await getDatabase();
  if (!database) {
    return;
  }

  await database.collection<CacheDocument>(CACHE_COLLECTION).deleteMany({ expiresAt: { $lte: new Date() } });
}

export async function hydrateFromLegacyFileCache(): Promise<void> {
  if (!shouldUseMongoCache()) {
    return;
  }

  if (!globalThis.__chronolensMongoHydrationPromise) {
    globalThis.__chronolensMongoHydrationPromise = (async () => {
      const records = await listCacheRecords();

      for (const record of records) {
        try {
          await setCacheDataWithExpiration(
            record.key,
            record.data,
            record.viewType,
            record.expiresAt,
            record.createdAt
          );
        } catch (error) {
          console.warn(`Failed to hydrate cache entry ${record.key}:`, error);
        }
      }
    })();
  }

  await globalThis.__chronolensMongoHydrationPromise;
}

export async function getCacheStats(): Promise<CacheStats> {
  const database = await getDatabase();
  if (!database) {
    return {
      keys: 0,
      expired: 0,
      totalFiles: 0,
      totalSizeBytes: 0,
      totalSizeMB: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      backend: 'mongodb',
    };
  }

  const now = new Date();
  const [validKeys, expiredKeys, documents, statsDocument] = await Promise.all([
    database.collection<CacheDocument>(CACHE_COLLECTION).countDocuments({ expiresAt: { $gt: now } }),
    database.collection<CacheDocument>(CACHE_COLLECTION).countDocuments({ expiresAt: { $lte: now } }),
    database.collection<CacheDocument>(CACHE_COLLECTION).find({}).toArray(),
    database.collection<CacheStatsDocument>(STATS_COLLECTION).findOne({ _id: STATS_DOC_ID }),
  ]);

  const totalSizeBytes = documents.reduce((total, document) => total + Buffer.byteLength(JSON.stringify(document), 'utf8'), 0);
  const hits = statsDocument?.hits ?? 0;
  const misses = statsDocument?.misses ?? 0;
  const hitRate = (hits + misses) > 0 ? hits / (hits + misses) : 0;

  return {
    keys: validKeys,
    expired: expiredKeys,
    totalFiles: documents.length,
    totalSizeBytes,
    totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100,
    hits,
    misses,
    hitRate,
    backend: 'mongodb',
  };
}