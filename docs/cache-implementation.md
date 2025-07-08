# Cache Implementation for ChronoLens

## Overview
Implemented a server-side daily cache system to minimize Gemini API requests and improve performance for all users.

## Architecture

### Before (Client-side caching)
- Each user had their own localStorage cache
- Every new visitor triggered API calls
- No shared cache across users
- Limited cache coordination

### After (Server-side caching)
- Centralized server-side cache using node-cache
- Single API call per day per category serves all users
- Automatic daily cache expiration at midnight
- Shared cache across all application users

## Implementation Details

### 1. Cache Service (`src/lib/cache.ts`)
- **Adaptive TTL Strategy**: 
  - **Today view**: Cache expires at midnight (daily refresh)
  - **Week view**: Cache expires at end of week/Sunday (weekly refresh)
- **Key Format**: `events_[viewType]_[category]_[date]`
- **Memory Storage**: In-memory cache (resets on server restart)
- **Statistics**: Tracks hits, misses, and hit rates
- **Expiration Info**: Provides detailed cache expiration times for monitoring

### 2. API Routes
- **`/api/historical-events`**: Main endpoint for fetching cached events with adaptive TTL
- **`/api/cache-stats`**: Basic admin endpoint for monitoring cache performance
- **`/api/cache-stats-enhanced`**: Enhanced admin endpoint with expiration information

### 3. Client Updates (`src/app/page.tsx`)
- Removed client-side localStorage cache for events
- Updated to use server-side API endpoints
- Added cache status indicators in UI
- Maintained localStorage for user preferences (view toggle)

### 4. Admin Interface (`/cache-admin`)
- Real-time cache statistics monitoring
- Cache management controls
- Performance metrics dashboard

## Cache Behavior

### Cache Hit (Subsequent Requests)
1. User requests historical events
2. Server checks cache for existing data
3. Returns cached data if valid (before expiration)
4. Response includes `cached: true` flag

### Cache Miss (First Request of Period)
1. User requests historical events
2. Server finds no valid cache entry
3. Makes fresh Gemini API call
4. Stores response in cache with appropriate TTL:
   - **Today view**: Until midnight
   - **Week view**: Until end of week (Sunday)
5. Returns fresh data with `cached: false` flag

### TTL Calculation
- **Daily (Today view)**: Cache until next midnight
- **Weekly (Week view)**: Cache until next Sunday at midnight

## Benefits

### Performance
- **Faster Response Times**: Cached responses are near-instantaneous
- **Reduced Latency**: No AI API calls for cached data
- **Better User Experience**: Consistent loading times

### Cost Optimization
- **Minimized API Calls**: 
  - **Today view**: Maximum 6 API calls per day (one per category)
  - **Week view**: Maximum 6 API calls per week (one per category)
- **Shared Resources**: Single API call serves unlimited users for the cache period
- **Efficient Resource Usage**: Adaptive server-side cache management

### Scalability
- **Multi-user Support**: Shared cache across all users
- **Memory Efficient**: Single cache entry per category/view/date
- **Auto-cleanup**: Daily cache expiration prevents memory bloat

## Monitoring

### Cache Statistics Available
- **Keys Count**: Number of cached entries
- **Hit Rate**: Percentage of requests served from cache
- **Hits/Misses**: Request fulfillment metrics
- **Timestamp**: Last statistics update

### Admin Dashboard Features
- Real-time cache statistics
- Cache expiration information for both view types
- Cache clearing functionality
- Performance monitoring
- Cache behavior insights
- TTL tracking for today vs week views

## Configuration

### TTL Calculation
```typescript
// Today view - Cache expires at midnight
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);
const ttlMs = tomorrow.getTime() - now.getTime();

// Week view - Cache expires at end of week (Sunday)
const endOfWeek = new Date(now);
const currentDay = now.getDay();
const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
endOfWeek.setDate(now.getDate() + daysUntilSunday);
endOfWeek.setHours(0, 0, 0, 0);
const ttlMs = endOfWeek.getTime() - now.getTime();
```

### Cache Key Generation
```typescript
// Format: events_[today|week]_[category]_[YYYY-MM-DD]
const key = `events_${viewType}_${category}_${date}`;
```

## Usage

### For Developers
1. **Development**: Cache admin available at `/cache-admin`
2. **Monitoring**: Check cache performance via API or admin panel
3. **Debugging**: Console logs show cache hit/miss status

### For Users
- **Transparent**: No user action required
- **Visual Feedback**: "Cached" badge shows when data is from cache
- **Performance**: Faster loading after first daily request

## Future Enhancements

### Possible Improvements
1. **Persistent Storage**: Redis or database-backed cache
2. **Cache Warming**: Pre-populate cache for popular categories
3. **Smart Invalidation**: Refresh specific categories on demand
4. **Distributed Cache**: Multi-server cache coordination
5. **Cache Analytics**: Detailed usage patterns and optimization

### Monitoring Enhancements
1. **Alerting**: Low hit rate notifications
2. **Metrics Export**: Prometheus/Grafana integration
3. **Cache Health**: Memory usage and performance tracking
4. **Historical Data**: Cache performance over time
