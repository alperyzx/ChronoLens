# Cache Implementation for ChronoLens

## Overview
ChronoLens uses a layered cache so historical events are fast to load and durable across restarts. Event data is cached on the server and persisted in MongoDB, while the browser keeps a short-lived local cache for repeat views in the same session.

MongoDB is the durable source of truth for both historical event selections and report state. The backend decides whether browser caches are still valid, and the frontend only revalidates when the backend revision changes.

The backend is deployed through Firebase, even though the runtime executes on Google Cloud infrastructure.

## What Is Cached

### Historical Events
- Cached per view and category in the server cache layer
- Stored as selection objects with `count`, `events`, and visible slices
- Used for both Today and This Week views

### Report State
- Cached separately from event selections
- Tracks report counts and hidden status for moderation
- Used by the admin console, visibility filtering, and cache-revision checks

## Cache Layers

### 1. Browser Cache
- Location: `src/app/page.tsx`
- Storage: `localStorage` plus in-memory fallback
- Purpose: avoid repeat fetches in the same browser session
- Invalidation: browser cache is tied to a backend report-cache revision

### 2. Server Cache
- Location: `src/lib/cache.ts`
- Storage: process memory with persistent backing
- Purpose: avoid repeated remote reads within the same server process

### 3. MongoDB Persistence
- Location: `src/lib/cache-mongo.ts`
- Purpose: durable persistence for historical events and report state
- Behavior: survives restarts and shared across instances

### 4. Legacy File Fallback
- Location: `src/lib/cache-file.ts`
- Purpose: fallback when MongoDB is unavailable or disabled
- Behavior: survives restarts on the same machine

## Event Read Flow

### Cache Hit Path
1. The browser checks its local cache first.
2. If the client cache is missing or stale, it calls `/api/historical-events`.
3. The server checks memory and persistent cache before any Gemini call.
4. If a valid cached selection exists, the server returns it immediately.

### Cache Miss Path
1. The server finds no valid cached selection.
2. The route calls Gemini to generate fresh category data.
3. The new selection is written back to server cache and MongoDB.
4. The response includes visible events plus a cache revision.

## Report and Visibility Flow

### Reported Content
- Reporting an item writes report state to MongoDB
- When the threshold is reached, the item becomes hidden server-side
- The admin recovery flow removes that report record and returns success even if the item is already visible

### Hidden Content Updates
- The historical-events route filters hidden items using the report cache
- The frontend keeps a separate hidden-content key set for optimistic UI updates
- The frontend also stores a report-cache revision so stale browser caches can be invalidated without extra event generation

## API Routes

- `/api/historical-events`: serves cached or freshly generated events, plus visible slices and a report-cache revision
- `/api/report-content`: increments report counts and determines whether content is hidden
- `/api/report-stats`: admin stats, list, clear, and recover operations for report state
- `/api/cache-stats`: cache admin operations
- `/api/cache-stats-enhanced`: detailed cache stats and cleanup

## Environment Variables

```bash
MONGO_CREDENTIALS=mongodb://.../chronolens?retryWrites=false
CACHE_DIR=/custom/cache/path
GOOGLE_GENAI_API_KEY=...
```

## Important Notes

- MongoDB is used for durable persistence of events and report state, not for every browser render.
- The frontend does not need to refetch events after every report; it can hide the item locally and rely on the backend revision check for stale cache invalidation.
- If the backend report revision has not changed, the browser cache can be reused safely.

## Missing Or Outdated Items To Watch

- The old Firestore wording in earlier drafts is outdated and should not be used.
- The cache order should be described as browser cache -> server cache -> MongoDB -> Gemini, with file fallback only when needed.
- Any docs that say the client has no caching need to be updated; the client now persists view state and hidden/report state in localStorage.
