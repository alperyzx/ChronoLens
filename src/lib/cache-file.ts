import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { HistoricalEventCategory } from './historical-event-categories';
import { normalizeCacheDate } from './cache-keys';

export interface CachedHistoricalEvent {
  title: string;
  date: string;
  description: string;
  category: string;
  source: string;
  significanceRank: number;
}

export interface CachedHistoricalEventSelection {
  count: number;
  events: CachedHistoricalEvent[];
}

export type CacheKey = {
  date: string; // YYYY-MM-DD; week view is normalized to the start of the week
  category: HistoricalEventCategory;
  viewType: 'today' | 'week';
  version?: string;
};

interface CacheEntry {
  data: CachedHistoricalEventSelection;
  expiresAt: number; // Unix timestamp
  createdAt: number; // Unix timestamp
}

export interface PersistedCacheEntry {
  data: CachedHistoricalEventSelection;
  expiresAt: number;
  createdAt: number;
  viewType: 'today' | 'week';
}

export interface PersistedCacheRecord extends PersistedCacheEntry {
  key: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  lastUpdated: number;
}

interface CacheLockEntry {
  acquiredAt: number;
  expiresAt: number;
}

const TODAY_TTL_SECONDS = 24 * 60 * 60;
const WEEK_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_LOCK_TTL_MS = 4 * 60 * 1000;
const LOCK_POLL_INTERVAL_MS = 1000;

// Get cache directory path
function getCacheDir(): string {
  // Use temp directory or a persistent directory in production
  const baseDir = process.env.CACHE_DIR || path.join(os.tmpdir(), 'chronolens-cache');
  return baseDir;
}

// Get cache file path for a specific key
function getCacheFilePath(key: string): string {
  const cacheDir = getCacheDir();
  // Sanitize key for filename
  const sanitizedKey = key.replace(/[^a-zA-Z0-9-_:]/g, '_');
  return path.join(cacheDir, `${sanitizedKey}.json`);
}

// Get stats file path
function getStatsFilePath(): string {
  const cacheDir = getCacheDir();
  return path.join(cacheDir, '_cache_stats.json');
}

function getLockFilePath(key: string): string {
  const cacheDir = getCacheDir();
  const sanitizedKey = key.replace(/[^a-zA-Z0-9-_:]/g, '_');
  return path.join(cacheDir, `${sanitizedKey}.lock.json`);
}

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
  const cacheDir = getCacheDir();
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (error) {
    console.error('Error creating cache directory:', error);
  }
}

async function readLockEntry(lockPath: string): Promise<CacheLockEntry | undefined> {
  try {
    const content = await fs.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(content) as CacheLockEntry;

    if (!parsed || typeof parsed.acquiredAt !== 'number' || typeof parsed.expiresAt !== 'number') {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

async function removeLockFile(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch {
    // Ignore cleanup failures.
  }
}

async function writeLockFile(lockPath: string, lockEntry: CacheLockEntry): Promise<boolean> {
  try {
    await fs.writeFile(lockPath, JSON.stringify(lockEntry, null, 2), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }

    throw error;
  }
}

export async function acquireCacheLock(key: string, lockTtlMs: number = DEFAULT_LOCK_TTL_MS): Promise<boolean> {
  try {
    await ensureCacheDir();

    const lockPath = getLockFilePath(key);
    const now = Date.now();
    const lockEntry: CacheLockEntry = {
      acquiredAt: now,
      expiresAt: now + lockTtlMs,
    };

    const acquired = await writeLockFile(lockPath, lockEntry);
    if (acquired) {
      return true;
    }

    const existingLock = await readLockEntry(lockPath);
    if (existingLock && existingLock.expiresAt > now) {
      return false;
    }

    await removeLockFile(lockPath);

    return await writeLockFile(lockPath, lockEntry);
  } catch (error) {
    console.error('Error acquiring cache lock:', error);
    return false;
  }
}

export async function releaseCacheLock(key: string): Promise<void> {
  await removeLockFile(getLockFilePath(key));
}

export async function isCacheLockActive(key: string): Promise<boolean> {
  try {
    const lockPath = getLockFilePath(key);
    const existingLock = await readLockEntry(lockPath);

    if (!existingLock) {
      return false;
    }

    if (Date.now() > existingLock.expiresAt) {
      await removeLockFile(lockPath);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking cache lock:', error);
    return false;
  }
}

export async function waitForCacheLockRelease(
  key: string,
  timeoutMs: number = DEFAULT_LOCK_TTL_MS,
  pollIntervalMs: number = LOCK_POLL_INTERVAL_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await isCacheLockActive(key))) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return !(await isCacheLockActive(key));
}

// Update cache statistics
async function updateStats(isHit: boolean): Promise<void> {
  try {
    await ensureCacheDir();
    const statsPath = getStatsFilePath();
    
    let stats: CacheStats = { hits: 0, misses: 0, lastUpdated: Date.now() };
    
    // Try to read existing stats
    try {
      const existing = await fs.readFile(statsPath, 'utf8');
      stats = JSON.parse(existing);
    } catch (readError) {
      // File doesn't exist or can't be read, use defaults
    }
    
    // Update stats
    if (isHit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
    stats.lastUpdated = Date.now();
    
    // Save updated stats
    await fs.writeFile(statsPath, JSON.stringify(stats), 'utf8');
  } catch (error) {
    console.error('Error updating cache stats:', error);
  }
}

// Get current cache statistics
async function getStats(): Promise<CacheStats> {
  try {
    const statsPath = getStatsFilePath();
    const content = await fs.readFile(statsPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return { hits: 0, misses: 0, lastUpdated: Date.now() };
  }
}

// Generate a unique cache key for each request
export function generateCacheKey(key: CacheKey): string {
  const versionSuffix = key.version ? `_${key.version}` : '';
  const normalizedDate = normalizeCacheDate(key.date, key.viewType);
  return `chronolens_events_${key.viewType}_${key.category}_${normalizedDate}${versionSuffix}`;
}

// Get TTL until next midnight (in seconds)
export function getTTLUntilMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const ttlMs = tomorrow.getTime() - now.getTime();
  return Math.floor(ttlMs / 1000); // Convert to seconds
}

// Get TTL until end of current week (Sunday at midnight)
export function getTTLUntilEndOfWeek(): number {
  const now = new Date();
  const endOfWeek = new Date(now);

  // Calculate days until Sunday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const currentDay = now.getDay();
  const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay; // If today is Sunday, cache for next Sunday

  endOfWeek.setDate(now.getDate() + daysUntilSunday);
  endOfWeek.setHours(0, 0, 0, 0); // Set to midnight of the end day

  const ttlMs = endOfWeek.getTime() - now.getTime();
  return Math.floor(ttlMs / 1000); // Convert to seconds
}

// Get appropriate TTL based on view type
export function getTTLForViewType(viewType: 'today' | 'week'): number {
  return viewType === 'today' ? getTTLUntilMidnight() : getTTLUntilEndOfWeek();
}

// Set cache with automatic TTL based on view type
export async function setCacheData(key: string, data: CachedHistoricalEventSelection, viewType: 'today' | 'week'): Promise<void> {
  try {
    await ensureCacheDir();
    
    const ttlSeconds = getTTLForViewType(viewType);
    const now = Date.now();
    const expiresAt = now + (ttlSeconds * 1000); // Convert to milliseconds
    
    const cacheEntry: CacheEntry = {
      data,
      expiresAt,
      createdAt: now
    };
    
    const filePath = getCacheFilePath(key);
    await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2), 'utf8');
    
    const expiryDescription = viewType === 'today' ? 'midnight' : 'end of week (Sunday)';
    console.log(`File cache set for key: ${key}, TTL: ${ttlSeconds} seconds (expires at ${expiryDescription})`);
  } catch (error) {
    console.error('Error setting file cache data:', error);
    // Graceful degradation - continue without caching
  }
}

// Get cache data
export async function getCacheData(key: string): Promise<CachedHistoricalEventSelection | undefined> {
  try {
    const filePath = getCacheFilePath(key);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const cacheEntry: CacheEntry = JSON.parse(fileContent);
      
      // Check if cache has expired
      const now = Date.now();
      if (now > cacheEntry.expiresAt) {
        console.log(`File cache expired for key: ${key}`);
        // Delete expired file
        try {
          await fs.unlink(filePath);
        } catch (unlinkError) {
          // Ignore unlink errors
        }
        // Record as miss
        await updateStats(false);
        return undefined;
      }
      
      console.log(`File cache hit for key: ${key}`);
      // Record as hit
      await updateStats(true);
      return cacheEntry.data;
    } catch (fileError) {
      // File doesn't exist or can't be read
      console.log(`File cache miss for key: ${key}`);
      // Record as miss
      await updateStats(false);
      return undefined;
    }
  } catch (error) {
    console.error('Error getting file cache data:', error);
    // Record as miss
    await updateStats(false);
    return undefined; // Graceful degradation
  }
}

// Get the full persisted cache entry, including timestamps, for migration/backfill use.
export async function getCacheRecord(key: string, viewType: 'today' | 'week'): Promise<PersistedCacheEntry | undefined> {
  try {
    const filePath = getCacheFilePath(key);

    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const cacheEntry: CacheEntry = JSON.parse(fileContent);

      const now = Date.now();
      if (now > cacheEntry.expiresAt) {
        try {
          await fs.unlink(filePath);
        } catch {
          // Ignore unlink errors
        }
        await updateStats(false);
        return undefined;
      }

      return {
        data: cacheEntry.data,
        expiresAt: cacheEntry.expiresAt,
        createdAt: cacheEntry.createdAt,
        viewType,
      };
    } catch {
      await updateStats(false);
      return undefined;
    }
  } catch (error) {
    console.error('Error getting file cache record:', error);
    await updateStats(false);
    return undefined;
  }
}

export async function listCacheRecords(): Promise<PersistedCacheRecord[]> {
  try {
    await ensureCacheDir();
    const cacheDir = getCacheDir();
    const files = await fs.readdir(cacheDir);
    const records: PersistedCacheRecord[] = [];

    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('_cache_stats') || file.startsWith('_report_cache') || file.startsWith('_cache_admin_attempts')) {
        continue;
      }

      const filePath = path.join(cacheDir, file);

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const cacheEntry: CacheEntry = JSON.parse(fileContent);

        if (Date.now() > cacheEntry.expiresAt) {
          continue;
        }

        const key = file.replace(/\.json$/, '');
        const viewType: 'today' | 'week' = key.includes('_week_') ? 'week' : 'today';

        records.push({
          key,
          data: cacheEntry.data,
          expiresAt: cacheEntry.expiresAt,
          createdAt: cacheEntry.createdAt,
          viewType,
        });
      } catch {
        // Ignore invalid cache files during hydration.
      }
    }

    return records;
  } catch (error) {
    console.error('Error listing file cache records:', error);
    return [];
  }
}

// Check if cache has valid data
export async function hasValidCache(key: string): Promise<boolean> {
  try {
    const filePath = getCacheFilePath(key);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const cacheEntry: CacheEntry = JSON.parse(fileContent);
      
      // Check if cache has expired
      const now = Date.now();
      if (now > cacheEntry.expiresAt) {
        // Delete expired file
        try {
          await fs.unlink(filePath);
        } catch (unlinkError) {
          // Ignore unlink errors
        }
        return false;
      }
      
      return true;
    } catch (fileError) {
      // File doesn't exist or can't be read
      return false;
    }
  } catch (error) {
    console.error('Error checking file cache validity:', error);
    return false; // Graceful degradation
  }
}

// Clear all cache (useful for development/testing)
export async function clearCache(): Promise<void> {
  try {
    const cacheDir = getCacheDir();
    
    try {
      const files = await fs.readdir(cacheDir);
      const deletePromises = files
        .filter(file => file.endsWith('.json'))
        .map(file => fs.unlink(path.join(cacheDir, file)));
      
      await Promise.all(deletePromises);
      console.log(`File cache cleared - deleted ${deletePromises.length} files`);
      
      // Reset stats
      const statsPath = getStatsFilePath();
      const resetStats: CacheStats = { hits: 0, misses: 0, lastUpdated: Date.now() };
      await fs.writeFile(statsPath, JSON.stringify(resetStats), 'utf8');
    } catch (readdirError) {
      // Directory doesn't exist or can't be read - that's fine
      console.log('File cache directory does not exist or is empty');
    }
  } catch (error) {
    console.error('Error clearing file cache:', error);
  }
}

// Clean up expired cache files (utility function)
export async function cleanupExpiredCache(): Promise<void> {
  try {
    const cacheDir = getCacheDir();
    
    try {
      const files = await fs.readdir(cacheDir);
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(cacheDir, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const cacheEntry: CacheEntry = JSON.parse(fileContent);
          
          if (now > cacheEntry.expiresAt) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (fileError) {
          // If we can't read/parse the file, delete it
          try {
            await fs.unlink(path.join(cacheDir, file));
            deletedCount++;
          } catch (unlinkError) {
            // Ignore unlink errors
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired cache files`);
      }
    } catch (readdirError) {
      // Directory doesn't exist - that's fine
    }
  } catch (error) {
    console.error('Error cleaning up expired cache:', error);
  }
}

// Get cache statistics
export async function getCacheStats() {
  try {
    const cacheDir = getCacheDir();
    const stats = await getStats();
    
    try {
      const files = await fs.readdir(cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json') && !file.startsWith('_cache_stats'));
      const now = Date.now();
      
      let validFiles = 0;
      let expiredFiles = 0;
      let totalSize = 0;
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(cacheDir, file);
          const stat = await fs.stat(filePath);
          totalSize += stat.size;
          
          const fileContent = await fs.readFile(filePath, 'utf8');
          const cacheEntry: CacheEntry = JSON.parse(fileContent);
          
          if (now > cacheEntry.expiresAt) {
            expiredFiles++;
          } else {
            validFiles++;
          }
        } catch (fileError) {
          // If we can't read the file, count it as expired
          expiredFiles++;
        }
      }
      
      const hitRate = (stats.hits + stats.misses) > 0 ? stats.hits / (stats.hits + stats.misses) : 0;
      
      return {
        keys: validFiles,
        expired: expiredFiles,
        totalFiles: jsonFiles.length,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        hits: stats.hits,
        misses: stats.misses,
        hitRate
      };
    } catch (readdirError) {
      return {
        keys: 0,
        expired: 0,
        totalFiles: 0,
        totalSizeBytes: 0,
        totalSizeMB: 0,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: (stats.hits + stats.misses) > 0 ? stats.hits / (stats.hits + stats.misses) : 0
      };
    }
  } catch (error) {
    console.error('Error getting file cache stats:', error);
    return {
      keys: 0,
      expired: 0,
      totalFiles: 0,
      totalSizeBytes: 0,
      totalSizeMB: 0,
      hits: 0,
      misses: 0,
      hitRate: 0
    };
  }
}

// Get cache expiration info for display purposes
export function getCacheExpirationInfo(viewType: 'today' | 'week') {
  const now = new Date();
  
  if (viewType === 'today') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return {
      expiresAt: tomorrow,
      description: 'midnight',
      ttlSeconds: getTTLUntilMidnight()
    };
  } else {
    const endOfWeek = new Date(now);
    const currentDay = now.getDay();
    const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
    
    endOfWeek.setDate(now.getDate() + daysUntilSunday);
    endOfWeek.setHours(0, 0, 0, 0);
    
    return {
      expiresAt: endOfWeek,
      description: 'end of week (Sunday)',
      ttlSeconds: getTTLUntilEndOfWeek()
    };
  }
}
