import { after, NextRequest, NextResponse } from 'next/server';
import {
  generateHistoricalEventRefill,
  generateHistoricalEvents,
  generateHistoricalEventsByCategory,
  type HistoricalEventsByCategory,
} from '@/ai/flows/generate-historical-events';
import { 
  acquireCacheLock,
  releaseCacheLock,
  getCacheData, 
  hasValidCache,
  setCacheData, 
  generateCacheKey, 
  type CacheKey,
  type CachedHistoricalEvent,
  type CachedHistoricalEventSelection,
} from '@/lib/cache';
import { normalizeCacheDate } from '@/lib/cache-keys';
import { filterHiddenContent } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory } from '@/lib/historical-event-categories';
import {
  hasMinimumEvents,
  mergeValidatedSelections,
} from '@/lib/historical-event-selection';

const CACHE_VERSION = 'v6';
const GENERATION_LOCK_TTL_MS = 4 * 60 * 1000;
const GENERATION_LOCK_WAIT_MS = 4 * 60 * 1000;
const GENERATION_LOCK_POLL_MS = 1000;
const SOURCE_URL_TIMEOUT_MS = 5000;
const SOURCE_HTML_PREFIX_BYTES = 16 * 1024;

type CachedBatchResponse = {
  selections: HistoricalEventsByCategory;
  visibleEventsByCategory: Record<HistoricalEventCategory, CachedHistoricalEvent[]>;
};

export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeSourceUrl(source: string): string | undefined {
  try {
    const url = new URL(source.trim());

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return undefined;
    }

    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

// ponytail: checks URL reachability, not fact-to-page semantics; use grounded search when proof is required.
async function validateSourceUrl(source: string): Promise<string> {
  const normalizedSource = normalizeSourceUrl(source);
  if (!normalizedSource) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_URL_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedSource, {
      headers: { Range: `bytes=0-${SOURCE_HTML_PREFIX_BYTES - 1}` },
      redirect: 'follow',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    const isHtml = contentType.includes('text/html');
    const isPdf = contentType.includes('application/pdf');

    if (![200, 206].includes(response.status) || (!isHtml && !isPdf)) {
      return '';
    }

    if (isHtml && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let html = '';
      let bytesRead = 0;

      try {
        while (bytesRead < SOURCE_HTML_PREFIX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = value.subarray(0, SOURCE_HTML_PREFIX_BYTES - bytesRead);
          html += decoder.decode(chunk, { stream: true });
          bytesRead += chunk.byteLength;
        }
        html += decoder.decode();
      } finally {
        await reader.cancel().catch(() => undefined);
      }

      const pageHeadings = [...html.matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)]
        .map(match => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .join(' ');

      if (/\b404\b|page not found|\bnot found\b|page unavailable|content unavailable/i.test(pageHeadings)) {
        return '';
      }
    }

    return normalizeSourceUrl(response.url) || normalizedSource;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function validateSelectionSources(selection: CachedHistoricalEventSelection): Promise<CachedHistoricalEventSelection> {
  const checkedEvents = await Promise.all(
    selection.events.map(async event => {
      const source = await validateSourceUrl(event.source);
      return source ? { ...event, source } : undefined;
    })
  );
  const validEvents = checkedEvents.filter((event): event is CachedHistoricalEvent => Boolean(event));
  const visibleEvents = await filterHiddenContent(validEvents);

  return { count: selection.count, events: visibleEvents };
}

async function validateCategorySources(selections: HistoricalEventsByCategory): Promise<HistoricalEventsByCategory> {
  const entries = await Promise.all(
    HISTORICAL_EVENT_CATEGORIES.map(async category => [
      category,
      await validateSelectionSources(selections[category] || emptySelection()),
    ] as const)
  );

  return Object.fromEntries(entries) as HistoricalEventsByCategory;
}

function getGenerationLockKey(date: string, viewType: 'today' | 'week', scope: 'batch' | HistoricalEventCategory): string {
  const normalizedDate = normalizeCacheDate(date, viewType);
  return `chronolens_generation_${scope}_${viewType}_${normalizedDate}_${CACHE_VERSION}`;
}

async function getCachedSingleCategoryResponse(cacheKey: string): Promise<CachedHistoricalEventSelection | undefined> {
  if (!(await hasValidCache(cacheKey))) {
    return undefined;
  }

  const cachedSelection = await getCacheData(cacheKey);
  if (!hasMinimumEvents(cachedSelection)) {
    return undefined;
  }

  return cachedSelection;
}

async function getCachedBatchResponse(date: string, viewType: 'today' | 'week'): Promise<CachedBatchResponse | undefined> {
  const selectionsByCategory = await getCachedSelectionsByCategory(date, viewType);
  const hasCompleteBatch = HISTORICAL_EVENT_CATEGORIES.every(category => hasMinimumEvents(selectionsByCategory[category]));
  if (!hasCompleteBatch) {
    return undefined;
  }

  const visibleEventsByCategory = await getVisibleSelectionsByCategory(selectionsByCategory);
  const hasEnoughVisibleEvents = HISTORICAL_EVENT_CATEGORIES.every(category => visibleEventsByCategory[category].length >= 3);

  return hasEnoughVisibleEvents
    ? { selections: selectionsByCategory, visibleEventsByCategory }
    : undefined;
}

async function getCachedSelectionsByCategory(date: string, viewType: 'today' | 'week'): Promise<HistoricalEventsByCategory> {
  const entries = await Promise.all(HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
    const cacheKey: CacheKey = {
      date,
      category: currentCategory,
      viewType,
      version: CACHE_VERSION,
    };

    return [currentCategory, await getCachedSingleCategoryResponse(generateCacheKey(cacheKey)) || emptySelection()] as const;
  }));

  return Object.fromEntries(entries) as HistoricalEventsByCategory;
}

async function getVisibleSelection(selection: CachedHistoricalEventSelection): Promise<CachedHistoricalEvent[]> {
  return filterHiddenContent(selection.events);
}

async function getVisibleSelectionsByCategory(selections: HistoricalEventsByCategory): Promise<Record<HistoricalEventCategory, CachedHistoricalEvent[]>> {
  const eventsByCategory = HISTORICAL_EVENT_CATEGORIES.map(category => [
    category,
    selections[category]?.events || [],
  ] as const);
  const visibleEventSet = new Set(await filterHiddenContent(eventsByCategory.flatMap(([, events]) => events)));

  return Object.fromEntries(
    eventsByCategory.map(([category, events]) => [
      category,
      events.filter(event => visibleEventSet.has(event)),
    ] as const)
  ) as Record<HistoricalEventCategory, CachedHistoricalEvent[]>;
}

function emptySelection(): CachedHistoricalEventSelection {
  return { count: 0, events: [] };
}

function emptySelectionsByCategory(): HistoricalEventsByCategory {
  return Object.fromEntries(
    HISTORICAL_EVENT_CATEGORIES.map(category => [category, emptySelection()] as const)
  ) as HistoricalEventsByCategory;
}

function finalizeSelection(
  primary: CachedHistoricalEventSelection,
  refill: CachedHistoricalEventSelection = emptySelection()
): CachedHistoricalEventSelection {
  const selection = mergeValidatedSelections(primary, refill);
  return hasMinimumEvents(selection) ? selection : emptySelection();
}

async function generateCompleteBatch(
  date: string,
  viewType: 'today' | 'week',
  cachedSelections: HistoricalEventsByCategory
): Promise<HistoricalEventsByCategory> {
  const missingCachedCategories = HISTORICAL_EVENT_CATEGORIES.filter(category => !hasMinimumEvents(cachedSelections[category]));

  if (missingCachedCategories.length < HISTORICAL_EVENT_CATEGORIES.length) {
    const refill = await generateHistoricalEventRefill({
      date,
      viewType,
      categories: missingCachedCategories,
      excludedEvents: HISTORICAL_EVENT_CATEGORIES.flatMap(category => cachedSelections[category]?.events || []),
    });
    const validatedRefill = await validateCategorySources(refill);

    return Object.fromEntries(
      HISTORICAL_EVENT_CATEGORIES.map(category => [
        category,
        finalizeSelection(cachedSelections[category], validatedRefill[category]),
      ])
    ) as HistoricalEventsByCategory;
  }

  const generated = await generateHistoricalEventsByCategory({ date, viewType, category: 'Sociology' });
  const validated = await validateCategorySources(generated);
  const deficientCategories = HISTORICAL_EVENT_CATEGORIES.filter(category => !hasMinimumEvents(validated[category]));

  if (deficientCategories.length === 0) {
    return Object.fromEntries(
      HISTORICAL_EVENT_CATEGORIES.map(category => [category, finalizeSelection(validated[category])])
    ) as HistoricalEventsByCategory;
  }

  const refill = await generateHistoricalEventRefill({
    date,
    viewType,
    categories: deficientCategories,
    excludedEvents: HISTORICAL_EVENT_CATEGORIES.flatMap(category => generated[category]?.events || []),
  });
  const validatedRefill = await validateCategorySources(refill);

  return Object.fromEntries(
    HISTORICAL_EVENT_CATEGORIES.map(category => [
      category,
      finalizeSelection(validated[category], validatedRefill[category]),
    ])
  ) as HistoricalEventsByCategory;
}

async function generateCompleteSelection(
  date: string,
  viewType: 'today' | 'week',
  category: HistoricalEventCategory
): Promise<CachedHistoricalEventSelection> {
  const generated = await generateHistoricalEvents({ date, viewType, category });
  const validated = await validateSelectionSources(generated);

  if (hasMinimumEvents(validated)) {
    return finalizeSelection(validated);
  }

  const refill = await generateHistoricalEventRefill({
    date,
    viewType,
    categories: [category],
    excludedEvents: generated.events,
  });
  const validatedRefill = await validateSelectionSources(refill[category] || emptySelection());

  return finalizeSelection(validated, validatedRefill);
}

async function runLockedGeneration<T>(options: {
  lockKey: string;
  readCachedData: () => Promise<T | undefined>;
  generateFreshData: () => Promise<T>;
  storeFreshData: (data: T) => Promise<void>;
}): Promise<{ data: T; cached: boolean }> {
  const deadline = Date.now() + GENERATION_LOCK_WAIT_MS;

  while (true) {
    const cachedData = await options.readCachedData();
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

    const acquired = await acquireCacheLock(options.lockKey, GENERATION_LOCK_TTL_MS);
    if (acquired) {
      try {
        const cachedAfterLock = await options.readCachedData();
        if (cachedAfterLock) {
          return { data: cachedAfterLock, cached: true };
        }

        const freshData = await options.generateFreshData();
        await options.storeFreshData(freshData);
        return { data: freshData, cached: false };
      } finally {
        await releaseCacheLock(options.lockKey);
      }
    }

    if (Date.now() >= deadline) {
      break;
    }

    await sleep(GENERATION_LOCK_POLL_MS);
  }

  const cachedData = await options.readCachedData();
  if (cachedData) {
    return { data: cachedData, cached: true };
  }

  throw new Error('Timed out waiting for historical events generation lock');
}

function keepGenerationAlive<T>(promise: Promise<T>): Promise<T> {
  after(
    promise.catch(error => {
      console.error('Historical events background generation failed:', error);
      throw error;
    })
  );

  return promise;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const category = searchParams.get('category');
    const viewType = searchParams.get('viewType');
    const metadataOnly = searchParams.get('metadataOnly') === '1';

    const isBatchRequest = !category || category === 'all';

    // Validate required parameters
    if (!date || !viewType || (!isBatchRequest && !category)) {
      return NextResponse.json(
        { error: 'Missing required parameters: date, viewType, and category for single-category requests' },
        { status: 400 }
      );
    }

    // Validate category
    if (!isBatchRequest && !HISTORICAL_EVENT_CATEGORIES.includes(category as HistoricalEventCategory)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Validate viewType
    if (!['today', 'week'].includes(viewType)) {
      return NextResponse.json(
        { error: 'Invalid viewType. Must be "today" or "week"' },
        { status: 400 }
      );
    }

    if (metadataOnly) {
      if (isBatchRequest) {
        const cachedBatchData = await getCachedBatchResponse(date, viewType as 'today' | 'week');
        return NextResponse.json({
          cached: Boolean(cachedBatchData),
          generationRequired: !cachedBatchData,
          scope: 'batch',
        });
      }

      const cacheKey: CacheKey = {
        date,
        category: category as HistoricalEventCategory,
        viewType: viewType as 'today' | 'week',
        version: CACHE_VERSION,
      };
      const key = generateCacheKey(cacheKey);
      const cachedData = await getCachedSingleCategoryResponse(key);

      return NextResponse.json({
        cached: Boolean(cachedData),
        generationRequired: !cachedData,
        scope: 'single',
      });
    }

    if (isBatchRequest) {
      const cachedBatchData = await getCachedBatchResponse(date, viewType as 'today' | 'week');

      if (cachedBatchData) {
        return NextResponse.json({
          dataByCategory: cachedBatchData.selections,
          visibleEventsByCategory: cachedBatchData.visibleEventsByCategory,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      console.log('Fetching fresh data from Gemini API for all categories');

      if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
        console.error('Google Gemini API key not configured');
        return NextResponse.json({
          error: 'API key not configured. Please set GOOGLE_GENAI_API_KEY in your environment variables.',
          dataByCategory: emptySelectionsByCategory(),
          visibleEventsByCategory: Object.fromEntries(HISTORICAL_EVENT_CATEGORIES.map(currentCategory => [currentCategory, []] as const)),
          cached: false,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }

      const lockKey = getGenerationLockKey(date, viewType as 'today' | 'week', 'batch');
      const generationPromise = keepGenerationAlive(
        runLockedGeneration<HistoricalEventsByCategory>({
          lockKey,
          readCachedData: async () => (await getCachedBatchResponse(date, viewType as 'today' | 'week'))?.selections,
          generateFreshData: async () => generateCompleteBatch(
            date,
            viewType as 'today' | 'week',
            await getCachedSelectionsByCategory(date, viewType as 'today' | 'week')
          ),
          storeFreshData: async generatedEventsByCategory => {
            await Promise.all(
              HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
                const cachedEvents = generatedEventsByCategory[currentCategory] || { count: 0, events: [] };

                if (!hasMinimumEvents(cachedEvents)) {
                  return;
                }

                const cacheKey: CacheKey = {
                  date,
                  category: currentCategory,
                  viewType: viewType as 'today' | 'week',
                  version: CACHE_VERSION,
                };

                const key = generateCacheKey(cacheKey);
                await setCacheData(key, cachedEvents, viewType as 'today' | 'week');
              })
            );
          },
        })
      );

      const { data: eventsByCategory, cached } = await generationPromise;

      const visibleEventsByCategory = await getVisibleSelectionsByCategory(eventsByCategory);

      return NextResponse.json({
        dataByCategory: eventsByCategory,
        visibleEventsByCategory,
        cached,
        timestamp: new Date().toISOString()
      });
    }

    // Create cache key
    const cacheKey: CacheKey = {
      date,
      category: category as HistoricalEventCategory,
      viewType: viewType as 'today' | 'week',
      version: CACHE_VERSION,
    };
    
    const key = generateCacheKey(cacheKey);

    const cachedData = await getCachedSingleCategoryResponse(key);
    if (cachedData) {
      const visibleEvents = await getVisibleSelection(cachedData);
      
      return NextResponse.json({
        data: cachedData,
        visibleEvents,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    // Cache miss - fetch from AI
    console.log(`Fetching fresh data from Gemini API for: ${key}`);
    
    // Check if API key is configured
    if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
      console.error('Google Gemini API key not configured');
      return NextResponse.json({
        error: 'API key not configured. Please set GOOGLE_GENAI_API_KEY in your environment variables.',
        data: emptySelection(),
        visibleEvents: [],
        cached: false,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    const lockKey = getGenerationLockKey(date, viewType as 'today' | 'week', category as HistoricalEventCategory);
    const generationPromise = keepGenerationAlive(
      runLockedGeneration({
      lockKey,
      readCachedData: async () => getCachedSingleCategoryResponse(key),
      generateFreshData: async () => generateCompleteSelection(
        date,
        viewType as 'today' | 'week',
        category as HistoricalEventCategory
      ),
      storeFreshData: async generatedEvents => {
        if (!hasMinimumEvents(generatedEvents)) {
          return;
        }

        await setCacheData(key, generatedEvents, viewType as 'today' | 'week');
      }
    })
    );

    const { data: events, cached } = await generationPromise;

    const visibleEvents = await getVisibleSelection(events);

    return NextResponse.json({
      data: events,
      visibleEvents,
      cached,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in historical events API:', error);
    
    // Check if it's an API key related error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isAPIKeyError = errorMessage.includes('API key') || errorMessage.includes('GOOGLE_GENAI_API_KEY');
    
    return NextResponse.json({
      error: isAPIKeyError 
        ? 'Google Gemini API key not configured properly. Please check your environment variables.'
        : 'Failed to fetch historical events. Please try again later.',
      data: emptySelection(),
      visibleEvents: [],
      cached: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
