import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface ReportedContent {
  title: string;
  category: string;
  date: string;
  reportCount: number;
  reportedAt: number; // Unix timestamp
  weekNumber: number; // ISO week number when first reported
  year: number; // Year when first reported
}

interface ReportCacheEntry {
  reportedContent: Record<string, ReportedContent>; // key: content hash
  lastClearWeek: number; // Last week when cache was cleared
  lastClearYear: number; // Last year when cache was cleared
}

// Threshold for hiding content
const REPORT_THRESHOLD = 5;

// Get cache directory path
function getCacheDir(): string {
  const baseDir = process.env.CACHE_DIR || path.join(os.tmpdir(), 'chronolens-cache');
  return baseDir;
}

// Get report cache file path
function getReportCacheFilePath(): string {
  const cacheDir = getCacheDir();
  return path.join(cacheDir, '_report_cache.json');
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

// Generate a unique hash for content identification
function generateContentHash(title: string, category: string, date: string): string {
  // Simple hash based on title, category, and date
  const content = `${title}|${category}|${date}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Get current ISO week number
function getISOWeek(date: Date): { week: number; year: number } {
  const tempDate = new Date(date.getTime());
  tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
  const week1 = new Date(tempDate.getFullYear(), 0, 4);
  const weekNumber = Math.ceil((((tempDate.getTime() - week1.getTime()) / 86400000) + 1) / 7);
  return { week: weekNumber, year: tempDate.getFullYear() };
}

// Load report cache
async function loadReportCache(): Promise<ReportCacheEntry> {
  try {
    await ensureCacheDir();
    const filePath = getReportCacheFilePath();
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist or can't be read, return empty cache
      const now = new Date();
      const { week, year } = getISOWeek(now);
      return {
        reportedContent: {},
        lastClearWeek: week,
        lastClearYear: year
      };
    }
  } catch (error) {
    console.error('Error loading report cache:', error);
    const now = new Date();
    const { week, year } = getISOWeek(now);
    return {
      reportedContent: {},
      lastClearWeek: week,
      lastClearYear: year
    };
  }
}

// Save report cache
async function saveReportCache(cache: ReportCacheEntry): Promise<void> {
  try {
    await ensureCacheDir();
    const filePath = getReportCacheFilePath();
    await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving report cache:', error);
  }
}

// Clear report cache if we're in a new week
async function checkAndClearWeeklyCache(): Promise<void> {
  try {
    const cache = await loadReportCache();
    const now = new Date();
    const { week, year } = getISOWeek(now);
    
    // Check if we're in a new week
    if (year > cache.lastClearYear || (year === cache.lastClearYear && week > cache.lastClearWeek)) {
      console.log(`Clearing report cache for new week: ${year}-W${week}`);
      
      const clearedCache: ReportCacheEntry = {
        reportedContent: {},
        lastClearWeek: week,
        lastClearYear: year
      };
      
      await saveReportCache(clearedCache);
    }
  } catch (error) {
    console.error('Error checking and clearing weekly cache:', error);
  }
}

// Report content
export async function reportContent(title: string, category: string, date: string): Promise<{ success: boolean; reportCount: number; isHidden: boolean }> {
  try {
    // Check and clear cache if needed
    await checkAndClearWeeklyCache();
    
    const cache = await loadReportCache();
    const contentHash = generateContentHash(title, category, date);
    const now = Date.now();
    const { week, year } = getISOWeek(new Date());
    
    if (cache.reportedContent[contentHash]) {
      // Existing report - increment count
      cache.reportedContent[contentHash].reportCount++;
      cache.reportedContent[contentHash].reportedAt = now;
    } else {
      // New report
      cache.reportedContent[contentHash] = {
        title,
        category,
        date,
        reportCount: 1,
        reportedAt: now,
        weekNumber: week,
        year
      };
    }
    
    const reportCount = cache.reportedContent[contentHash].reportCount;
    const isHidden = reportCount >= REPORT_THRESHOLD;
    
    await saveReportCache(cache);
    
    console.log(`Content reported: ${title} (${category}) - Count: ${reportCount}, Hidden: ${isHidden}`);
    
    return {
      success: true,
      reportCount,
      isHidden
    };
  } catch (error) {
    console.error('Error reporting content:', error);
    return {
      success: false,
      reportCount: 0,
      isHidden: false
    };
  }
}

// Check if content should be hidden
export async function isContentHidden(title: string, category: string, date: string): Promise<boolean> {
  try {
    // Check and clear cache if needed
    await checkAndClearWeeklyCache();
    
    const cache = await loadReportCache();
    const contentHash = generateContentHash(title, category, date);
    
    const reportedContent = cache.reportedContent[contentHash];
    if (!reportedContent) {
      return false;
    }
    
    return reportedContent.reportCount >= REPORT_THRESHOLD;
  } catch (error) {
    console.error('Error checking if content is hidden:', error);
    return false;
  }
}

// Filter out hidden content from an array
export async function filterHiddenContent<T extends { title: string; category: string; date: string }>(content: T[]): Promise<T[]> {
  try {
    // Check and clear cache if needed
    await checkAndClearWeeklyCache();
    
    const cache = await loadReportCache();
    
    return content.filter(item => {
      const contentHash = generateContentHash(item.title, item.category, item.date);
      const reportedContent = cache.reportedContent[contentHash];
      
      if (!reportedContent) {
        return true; // Not reported, show it
      }
      
      return reportedContent.reportCount < REPORT_THRESHOLD;
    });
  } catch (error) {
    console.error('Error filtering hidden content:', error);
    return content; // On error, return all content
  }
}

// Get report statistics
export async function getReportStats(): Promise<{
  totalReported: number;
  hiddenContent: number;
  currentWeek: number;
  currentYear: number;
  lastClearWeek: number;
  lastClearYear: number;
}> {
  try {
    await checkAndClearWeeklyCache();
    
    const cache = await loadReportCache();
    const now = new Date();
    const { week, year } = getISOWeek(now);
    
    const reported = Object.values(cache.reportedContent);
    const hiddenCount = reported.filter(item => item.reportCount >= REPORT_THRESHOLD).length;
    
    return {
      totalReported: reported.length,
      hiddenContent: hiddenCount,
      currentWeek: week,
      currentYear: year,
      lastClearWeek: cache.lastClearWeek,
      lastClearYear: cache.lastClearYear
    };
  } catch (error) {
    console.error('Error getting report stats:', error);
    const now = new Date();
    const { week, year } = getISOWeek(now);
    return {
      totalReported: 0,
      hiddenContent: 0,
      currentWeek: week,
      currentYear: year,
      lastClearWeek: week,
      lastClearYear: year
    };
  }
}

// Get all reported content (for admin purposes)
export async function getAllReportedContent(): Promise<ReportedContent[]> {
  try {
    await checkAndClearWeeklyCache();
    
    const cache = await loadReportCache();
    return Object.values(cache.reportedContent);
  } catch (error) {
    console.error('Error getting all reported content:', error);
    return [];
  }
}

// Clear all reports (admin function)
export async function clearAllReports(): Promise<void> {
  try {
    const now = new Date();
    const { week, year } = getISOWeek(now);
    
    const clearedCache: ReportCacheEntry = {
      reportedContent: {},
      lastClearWeek: week,
      lastClearYear: year
    };
    
    await saveReportCache(clearedCache);
    console.log('All reports cleared manually');
  } catch (error) {
    console.error('Error clearing all reports:', error);
  }
}
