// Use Firestore-backed cache when enabled, with file-based fallback for local/dev resilience.
import * as fileCache from './cache-file';
import * as mongoCache from './cache-mongo';

// Re-export types from file cache
export type { CachedHistoricalEvent, CacheKey } from './cache-file';

function shouldUseMongoCache(): boolean {
  return Boolean(process.env.MONGO_CREDENTIALS);
}

type MemoryCacheEntry = {
  data: fileCache.CachedHistoricalEvent[];
  expiresAt: number;
};

const instanceCache = new Map<string, MemoryCacheEntry>();

function getMemoryCacheEntry(key: string): fileCache.CachedHistoricalEvent[] | undefined {
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

function setMemoryCacheEntry(key: string, data: fileCache.CachedHistoricalEvent[], viewType: 'today' | 'week'): void {
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
export async function setCacheData(key: string, data: fileCache.CachedHistoricalEvent[], viewType: 'today' | 'week'): Promise<void> {
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

export async function getCacheData(key: string): Promise<fileCache.CachedHistoricalEvent[] | undefined> {
  const memoryData = getMemoryCacheEntry(key);
  if (memoryData) {
    return memoryData;
  }

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
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

export async function clearCache(): Promise<void> {
  instanceCache.clear();

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
      await mongoCache.clearCache();
    } catch (error) {
      console.warn('Mongo cache clear failed, falling back to legacy file cache:', error);
    }
  }

  return fileCache.clearCache();
}

export async function getCacheStats() {
  clearExpiredMemoryCache();

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
      const remoteStats = await mongoCache.getCacheStats();
      return {
        ...remoteStats,
        keys: remoteStats.keys + instanceCache.size,
      };
    } catch (error) {
      console.warn('Mongo cache stats failed, falling back to legacy file cache:', error);
    }
  }

  const fileStats = await fileCache.getCacheStats();
  return {
    ...fileStats,
    keys: fileStats.keys + instanceCache.size,
  };
}

// Utility function to clean up expired cache files
export async function cleanupExpiredCache(): Promise<void> {
  clearExpiredMemoryCache();

  if (shouldUseMongoCache()) {
    try {
      await mongoCache.hydrateFromLegacyFileCache();
      await mongoCache.cleanupExpiredCache();
    } catch (error) {
      console.warn('Mongo cache cleanup failed, falling back to legacy file cache:', error);
    }
  }

  return fileCache.cleanupExpiredCache();
}
