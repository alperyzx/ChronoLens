import { NextRequest, NextResponse } from 'next/server';
import { generateHistoricalEvents } from '@/ai/flows/generate-historical-events';
import { 
  getCacheData, 
  setCacheData, 
  generateCacheKey, 
  hasValidCache,
  type CacheKey,
  type CachedHistoricalEvent 
} from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const category = searchParams.get('category');
    const viewType = searchParams.get('viewType');

    // Validate required parameters
    if (!date || !category || !viewType) {
      return NextResponse.json(
        { error: 'Missing required parameters: date, category, viewType' },
        { status: 400 }
      );
    }

    // Validate category
    const validCategories = ['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art'];
    if (!validCategories.includes(category)) {
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

    // Create cache key
    const cacheKey: CacheKey = {
      date,
      category: category as any,
      viewType: viewType as 'today' | 'week'
    };
    
    const key = generateCacheKey(cacheKey);

    // Check cache first
    if (await hasValidCache(key)) {
      const cachedData = await getCacheData(key);
      if (cachedData) {
        return NextResponse.json({
          data: cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Cache miss - fetch from AI
    console.log(`Fetching fresh data from Gemini API for: ${key}`);
    
    // Check if API key is configured
    if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error('Google Gemini API key not configured');
      return NextResponse.json({
        error: 'API key not configured. Please set GOOGLE_GENAI_API_KEY in your environment variables.',
        data: [],
        cached: false,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    const events = await generateHistoricalEvents({
      date: viewType === 'week' ? 'This Week' : date,
      category: category as any
    });

    // Convert to cached format
    const cachedEvents: CachedHistoricalEvent[] = events.map(event => ({
      title: event.title,
      date: event.date,
      description: event.description,
      category: event.category,
      source: event.source
    }));

    // Only cache successful responses with data
    if (cachedEvents.length > 0) {
      await setCacheData(key, cachedEvents, viewType as 'today' | 'week');
    }

    return NextResponse.json({
      data: cachedEvents,
      cached: false,
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
      data: [],
      cached: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
