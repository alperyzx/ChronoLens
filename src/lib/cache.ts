// Use Firestore-backed cache when enabled, with file-based fallback for local/dev resilience.
import * as fileCache from './cache-file';
import * as mongoCache from './cache-mongo';

// Re-export types from file cache
export type { CachedHistoricalEvent, CachedHistoricalEventSelection, CacheKey } from './cache-file';

function shouldUseMongoCache(): boolean {
  return Boolean(process.env.MONGO_CREDENTIALS);
}

type MemoryCacheEntry = {
  data: fileCache.CachedHistoricalEventSelection;
  expiresAt: number;
};

const instanceCache = new Map<string, MemoryCacheEntry>();
let serverCacheHits = 0;
let serverCacheMisses = 0;
let mongoFallbackLookups = 0;

function getMemoryCacheEntry(key: string): fileCache.CachedHistoricalEventSelection | undefined {
  const entry = instanceCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    instanceCache.delete(key);
    return undefined;
  }

  return entry.data;
}

function setMemoryCacheEntry(key: string, data: fileCache.CachedHistoricalEventSelection, viewType: 'today' | 'week'): void {
  const expiresAt = Date.now() + (fileCache.getTTLForViewType(viewType) * 1000);
  instanceCache.set(key, { data, expiresAt });
}

function clearExpiredMemoryCache(): void {
  const now = Date.now();

  for (const [key, entry] of instanceCache.entries()) {
    if (now > entry.expiresAt) {
      instanceCache.delete(key);
    }
  }
}

function resetServerCacheMetrics(): void {
  serverCacheHits = 0;
  serverCacheMisses = 0;
  mongoFallbackLookups = 0;
}

function getViewTypeFromCacheKey(key: string): 'today' | 'week' {
  return key.includes('_week_') ? 'week' : 'today';
}

// Re-export functions from file cache with the same interface
export const generateCacheKey = fileCache.generateCacheKey;
export const getTTLUntilMidnight = fileCache.getTTLUntilMidnight;
export const getTTLUntilEndOfWeek = fileCache.getTTLUntilEndOfWeek;
export const getTTLForViewType = fileCache.getTTLForViewType;
export const getCacheExpirationInfo = fileCache.getCacheExpirationInfo;
export const acquireCacheLock = fileCache.acquireCacheLock;
export const releaseCacheLock = fileCache.releaseCacheLock;
export const isCacheLockActive = fileCache.isCacheLockActive;
export const waitForCacheLockRelease = fileCache.waitForCacheLockRelease;

// Async wrapper functions to maintain backward compatibility with the API
export async function setCacheData(key: string, data: fileCache.CachedHistoricalEventSelection, viewType: 'today' | 'week'): Promise<void> {
  setMemoryCacheEntry(key, data, viewType);

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
      return await mongoCache.setCacheData(key, data, viewType);
    } catch (error) {
      console.warn('Mongo cache write failed, falling back to legacy file cache:', error);
    }
  }

  return fileCache.setCacheData(key, data, viewType);
}

export async function getCacheData(
  key: string,
  trackMetrics = true,
): Promise<fileCache.CachedHistoricalEventSelection | undefined> {
  const memoryData = getMemoryCacheEntry(key);
  if (memoryData) {
    if (trackMetrics) {
      serverCacheHits++;
    }
    return memoryData;
  }

  if (trackMetrics) {
    serverCacheMisses++;
  }

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
      mongoFallbackLookups++;
      const mongoData = await mongoCache.getCacheData(key);
      if (mongoData) {
        setMemoryCacheEntry(key, mongoData, getViewTypeFromCacheKey(key));
        return mongoData;
      }

      return undefined;
    } catch (error) {
      console.warn('Mongo cache read failed, falling back to legacy file cache:', error);
    }
  }

  return fileCache.getCacheData(key);
}

export async function hasValidCache(key: string): Promise<boolean> {
  if (getMemoryCacheEntry(key)) {
    return true;
  }

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
      return await mongoCache.hasValidCache(key);
    } catch (error) {
      console.warn('Mongo cache validation failed, falling back to legacy file cache:', error);
    }
  }

  return fileCache.hasValidCache(key);
}

/** Clears only this server instance's in-memory cache and its local metrics. */
export function clearServerCache(): void {
  instanceCache.clear();
  resetServerCacheMetrics();
}

export async function getCacheStats() {
  clearExpiredMemoryCache();
  const lookups = serverCacheHits + serverCacheMisses;

  return {
    entries: instanceCache.size,
    hits: serverCacheHits,
    misses: serverCacheMisses,
    mongoFallbackLookups,
    hitRate: lookups > 0 ? serverCacheHits / lookups : 0,
  };
}

/** Removes expired entries only from this server instance's in-memory cache. */
export function cleanupExpiredServerCache(): void {
  clearExpiredMemoryCache();
}
