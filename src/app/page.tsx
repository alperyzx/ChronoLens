"use client";

import { cloneElement, useState, useEffect, useRef, type TouchEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Footer } from "@/components/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory } from "@/lib/historical-event-categories";
import { MINIMUM_PUBLISHABLE_EVENTS } from "@/lib/historical-event-selection";
import { normalizeCacheDate } from "@/lib/cache-keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Define types for our events
type HistoricalEvent = {
  title: string;
  date: string;
  description: string;
  category: string;
  source: string;
  significanceRank: number;
};

type HistoricalEventSelection = {
  count: number;
  events: HistoricalEvent[];
};

type HistoricalEventCategoryPayload = HistoricalEventSelection & {
  visibleEvents: HistoricalEvent[];
};

type CategoryEvents = Partial<Record<HistoricalEventCategory, HistoricalEventCategoryPayload>>;

type HistoricalEventsByCategory = Record<HistoricalEventCategory, HistoricalEventCategoryPayload>;

type ClientCacheEntry<T> = {
  data: T;
  createdAt: number;
  expiresAt: number;
  revision?: string;
};

function EventTitlePreview({ title, previewKey }: { title: string; previewKey: string }) {
  const previewRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }

    const updateOverflowState = () => {
      setIsOverflowing(preview.scrollWidth > preview.clientWidth + 1);
    };

    updateOverflowState();
    const resizeObserver = new ResizeObserver(updateOverflowState);
    resizeObserver.observe(preview);

    return () => resizeObserver.disconnect();
  }, [title, previewKey]);

  return (
    <p
      ref={previewRef}
      key={previewKey}
      className={cn(
        "event-preview-roll mt-1 w-full max-w-[22rem] overflow-hidden whitespace-nowrap text-xs font-medium text-white/90 drop-shadow md:mt-2 md:text-sm",
        isOverflowing && "event-preview-fade"
      )}
    >
      {title}
    </p>
  );
}

const CLIENT_CACHE_PREFIX = "chronolens_client_events";
const CLIENT_CACHE_VERSION = "v6";
const REPORTED_CONTENT_CACHE_KEY = "chronolens_reported_content_v1";
const HIDDEN_CONTENT_CACHE_KEY = "chronolens_hidden_content_v1";
const clientCacheMemory = new Map<string, ClientCacheEntry<unknown>>();
const reportedContentMemory = new Set<string>();
const hiddenContentMemory = new Set<string>();

function getEventReportKey(event: Pick<HistoricalEvent, 'title' | 'category' | 'date'>): string {
  return `${event.title}::${event.category}::${event.date}`;
}

function loadReportedContentKeys(): Set<string> {
  if (reportedContentMemory.size > 0) {
    return new Set(reportedContentMemory);
  }

  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(REPORTED_CONTENT_CACHE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const keys = new Set(parsed);
    for (const key of keys) {
      reportedContentMemory.add(key);
    }

    return keys;
  } catch {
    return new Set();
  }
}

function persistReportedContentKeys(keys: Set<string>): void {
  reportedContentMemory.clear();
  for (const key of keys) {
    reportedContentMemory.add(key);
  }

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(REPORTED_CONTENT_CACHE_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    // Ignore storage write failures.
  }
}

function hasReportedEvent(reportKey: string): boolean {
  if (reportedContentMemory.has(reportKey)) {
    return true;
  }

  return loadReportedContentKeys().has(reportKey);
}

function markEventAsReported(reportKey: string): void {
  const keys = loadReportedContentKeys();
  keys.add(reportKey);
  persistReportedContentKeys(keys);
}

function loadHiddenContentKeys(): Set<string> {
  if (hiddenContentMemory.size > 0) {
    return new Set(hiddenContentMemory);
  }

  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(HIDDEN_CONTENT_CACHE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const keys = new Set(parsed);
    for (const key of keys) {
      hiddenContentMemory.add(key);
    }

    return keys;
  } catch {
    return new Set();
  }
}

function persistHiddenContentKeys(keys: Set<string>): void {
  hiddenContentMemory.clear();
  for (const key of keys) {
    hiddenContentMemory.add(key);
  }

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(HIDDEN_CONTENT_CACHE_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    // Ignore storage write failures.
  }
}

function markEventAsHidden(reportKey: string): void {
  const keys = loadHiddenContentKeys();
  keys.add(reportKey);
  persistHiddenContentKeys(keys);
}

function getRequestDateString(): string {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return now.toISOString().slice(0, 10);
}

function getDateStringWithOffset(daysBack: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function formatMonthDay(dateString: string): string {
  const date = new Date(`${dateString}T12:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function getSelectedPeriodDateString(isTodayView: boolean, selectedDayOffset: number, selectedWeekOffset: number): string {
  return isTodayView
    ? getDateStringWithOffset(selectedDayOffset)
    : getDateStringWithOffset(selectedWeekOffset * 7);
}

function getClientCacheKey(scope: 'single' | 'batch', viewType: 'today' | 'week', date: string, category?: string): string {
  const normalizedDate = normalizeCacheDate(date, viewType);
  return [CLIENT_CACHE_PREFIX, CLIENT_CACHE_VERSION, scope, viewType, normalizedDate, category || 'all'].join('_');
}

function getClientCacheExpiration(viewType: 'today' | 'week'): number {
  const now = new Date();

  if (viewType === 'today') {
    return now.getTime() + (7 * 24 * 60 * 60 * 1000);
  }

  return now.getTime() + (14 * 24 * 60 * 60 * 1000);
}

function hasCompleteHistoricalEventsByCategory(eventsByCategory: Partial<Record<HistoricalEventCategory, HistoricalEventSelection & { visibleEvents?: HistoricalEvent[] }>>): boolean {
  return HISTORICAL_EVENT_CATEGORIES.every(category => {
    const selection = eventsByCategory[category];
    const events = selection?.visibleEvents ?? selection?.events ?? [];
    return (selection?.count || 0) >= MINIMUM_PUBLISHABLE_EVENTS && events.length >= MINIMUM_PUBLISHABLE_EVENTS;
  });
}

function getClientCache<T>(key: string): T | undefined {
  const memoryEntry = clientCacheMemory.get(key);

  if (memoryEntry) {
    if (Date.now() <= memoryEntry.expiresAt) {
      return memoryEntry.data as T;
    }

    clientCacheMemory.delete(key);
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const rawEntry = window.localStorage.getItem(key);
    if (!rawEntry) {
      return undefined;
    }

    const parsedEntry = JSON.parse(rawEntry) as ClientCacheEntry<T>;
    if (!parsedEntry?.expiresAt || Date.now() > parsedEntry.expiresAt) {
      window.localStorage.removeItem(key);
      clientCacheMemory.delete(key);
      return undefined;
    }

    if (
      parsedEntry.data &&
      typeof parsedEntry.data === 'object' &&
      !Array.isArray(parsedEntry.data) &&
      Object.values(parsedEntry.data as Record<string, unknown>).every(value => Array.isArray(value) && value.length === 0)
    ) {
      window.localStorage.removeItem(key);
      clientCacheMemory.delete(key);
      return undefined;
    }

    clientCacheMemory.set(key, parsedEntry);
    return parsedEntry.data;
  } catch {
    return undefined;
  }
}

function setClientCache<T>(key: string, data: T, viewType: 'today' | 'week', revision?: string): void {
  const entry: ClientCacheEntry<T> = {
    data,
    createdAt: Date.now(),
    expiresAt: getClientCacheExpiration(viewType),
    revision,
  };

  clientCacheMemory.set(key, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

async function getReportCacheRevision(date: string, viewType: 'today' | 'week', category?: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    date,
    viewType,
    metadataOnly: '1',
  });

  if (category) {
    params.set('category', category);
  }

  try {
    const response = await fetch(`/api/historical-events?${params.toString()}`);
    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json() as { reportCacheRevision?: string };
    return payload.reportCacheRevision;
  } catch {
    return undefined;
  }
}

// Category Icons - Modern SVG icons
const categoryIcons = {
  Sociology: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Technology: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  Philosophy: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Science: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  Politics: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  Art: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h4a2 2 0 002-2V9a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  ),
  Sports: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8m-8 4h8m-8-8h8M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  ),
  Literature: (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6" />
    </svg>
  ),
};

// Category Background Gradients - Modern themed gradients
const categoryBackgrounds = {
  Sociology: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  Technology: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  Philosophy: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  Science: "linear-gradient(135deg, #047857 0%, #0f766e 55%, #0891b2 100%)",
  Politics: "linear-gradient(135deg, #334155 0%, #7f1d1d 100%)",
  Art: "linear-gradient(135deg, #7c2d5b 0%, #c2416c 55%, #d97706 100%)",
  Sports: "linear-gradient(135deg, #065f46 0%, #0f766e 100%)",
  Literature: "linear-gradient(135deg, #5f27cd 0%, #341f97 100%)",
};

async function getHistoricalEventsForCategory(category: string, isTodayView: boolean, dateString: string): Promise<{events: HistoricalEventCategoryPayload, cached: boolean}> {
  const viewType = isTodayView ? 'today' : 'week';
  const clientCacheKey = getClientCacheKey('single', viewType, dateString, category);
  const reportCacheRevision = await getReportCacheRevision(dateString, viewType, category);

  const cachedClientData = getClientCache<HistoricalEventCategoryPayload>(clientCacheKey);
  if (cachedClientData) {
    const memoryEntry = clientCacheMemory.get(clientCacheKey);
    if (!reportCacheRevision || memoryEntry?.revision === reportCacheRevision) {
    console.log(`${category} events served from client cache`);
    return {
      events: cachedClientData,
      cached: true,
    };
    }

    clientCacheMemory.delete(clientCacheKey);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(clientCacheKey);
    }
  }
  
  try {
    // Call our cached API endpoint instead of direct AI call
    const response = await fetch(`/api/historical-events?date=${dateString}&category=${category}&viewType=${viewType}`);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // Log cache status for monitoring
    console.log(`${category} events ${result.cached ? 'served from cache' : 'fetched fresh from API'}`);

    const payload: HistoricalEventCategoryPayload = {
      ...(result.data || { count: 0, events: [] }),
      visibleEvents: Array.isArray(result.visibleEvents) ? result.visibleEvents : [],
    };

    if (payload.count >= MINIMUM_PUBLISHABLE_EVENTS && payload.visibleEvents.length >= MINIMUM_PUBLISHABLE_EVENTS) {
      setClientCache(clientCacheKey, payload, viewType, result.reportCacheRevision);
    }
    
    return {
      events: payload,
      cached: result.cached || false
    };
  } catch (error) {
    console.error(`Failed to fetch events for category: ${category}`, error);
    return {
      events: { count: 0, events: [], visibleEvents: [] },
      cached: false
    }; // Return empty events array on failure
  }
}

async function getHistoricalEventsForAllCategories(isTodayView: boolean, dateString: string): Promise<{eventsByCategory: HistoricalEventsByCategory, cached: boolean}> {
  const viewType = isTodayView ? 'today' : 'week';
  const clientCacheKey = getClientCacheKey('batch', viewType, dateString);
  const reportCacheRevision = await getReportCacheRevision(dateString, viewType);

  const cachedClientData = getClientCache<HistoricalEventsByCategory>(clientCacheKey);
  if (cachedClientData) {
    const memoryEntry = clientCacheMemory.get(clientCacheKey);
    if (hasCompleteHistoricalEventsByCategory(cachedClientData) && (!reportCacheRevision || memoryEntry?.revision === reportCacheRevision)) {
    console.log(`All categories served from client cache`);
    return {
      eventsByCategory: cachedClientData,
      cached: true,
    };
    }

    clientCacheMemory.delete(clientCacheKey);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(clientCacheKey);
    }
  }

  const response = await fetch(`/api/historical-events?date=${dateString}&viewType=${viewType}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  const emptyEventsByCategory = HISTORICAL_EVENT_CATEGORIES.reduce((accumulator, currentCategory) => {
    accumulator[currentCategory] = { count: 0, events: [], visibleEvents: [] };
    return accumulator;
  }, {} as HistoricalEventsByCategory);

  const eventsByCategory = {
    ...emptyEventsByCategory,
    ...(Object.entries(result.dataByCategory || {}).reduce((accumulator, [currentCategory, selection]) => {
      const visibleEvents = result.visibleEventsByCategory?.[currentCategory] || [];
      accumulator[currentCategory as HistoricalEventCategory] = {
        ...(selection as HistoricalEventSelection),
        visibleEvents,
      };
      return accumulator;
    }, {} as Partial<Record<HistoricalEventCategory, HistoricalEventCategoryPayload>>)),
  } as HistoricalEventsByCategory;

  console.log(`All categories ${result.cached ? 'served from cache' : 'fetched fresh from API'}`);

  if (hasCompleteHistoricalEventsByCategory(eventsByCategory)) {
    setClientCache(clientCacheKey, eventsByCategory, viewType, result.reportCacheRevision);
  }

  return {
    eventsByCategory,
    cached: result.cached || false,
  };
}

export default function Home() {
  const [isTodayView, setIsTodayView] = useState(true);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [historicalEvents, setHistoricalEvents] = useState<CategoryEvents>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<string, boolean>>({});
  const [showGeminiWarmup, setShowGeminiWarmup] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<HistoricalEventCategory | null>(null);
  const [reportingContent, setReportingContent] = useState<Record<string, boolean>>({});
  const [reportedContent, setReportedContent] = useState<Record<string, boolean>>({});
  const [hiddenContent, setHiddenContent] = useState<Record<string, boolean>>({});
  const [confirmReportEvent, setConfirmReportEvent] = useState<HistoricalEvent | null>(null);
  const categories = HISTORICAL_EVENT_CATEGORIES;
  const [isHeaderShrunken, setIsHeaderShrunken] = useState(false);
  const isHeaderShrunkenRef = useRef(false);
  const isMobile = useIsMobile();
  const [usesCompactHeaderMotion, setUsesCompactHeaderMotion] = useState(false);
  const batchRetryTimerRef = useRef<number | null>(null);
  const batchFetchRequestIdRef = useRef(0);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const mobileToggleTapTimerRef = useRef<number | null>(null);
  const ignoreMobileToggleClickUntilRef = useRef(0);
  const [warmupCategoryIndex, setWarmupCategoryIndex] = useState(0);
  const [eventPreviewIndices, setEventPreviewIndices] = useState<Partial<Record<HistoricalEventCategory, number>>>({});
  const { toast } = useToast();

  const clearBatchRetryTimer = () => {
    if (batchRetryTimerRef.current !== null) {
      window.clearTimeout(batchRetryTimerRef.current);
      batchRetryTimerRef.current = null;
    }
  };

  useEffect(() => {
    const threshold = 24;
    let rafId: number;
    let isScheduled = false;

    const updateShrinkState = () => {
      const scrollY = window.scrollY;
      const nextIsShrunken = isHeaderShrunkenRef.current
        ? scrollY > 8
        : scrollY > threshold;

      if (nextIsShrunken !== isHeaderShrunkenRef.current) {
        isHeaderShrunkenRef.current = nextIsShrunken;
        setIsHeaderShrunken(nextIsShrunken);
      }
    };

    const handleScroll = () => {
      if (!isScheduled) {
        isScheduled = true;
        rafId = requestAnimationFrame(() => {
          updateShrinkState();
          isScheduled = false;
        });
      }
    };

    updateShrinkState();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 1023px)");
    const updateHeaderMotionMode = () => setUsesCompactHeaderMotion(mediaQuery.matches);

    updateHeaderMotionMode();
    mediaQuery.addEventListener("change", updateHeaderMotionMode);
    return () => mediaQuery.removeEventListener("change", updateHeaderMotionMode);
  }, []);

  useEffect(() => {
    if (!selectedCategory) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedCategory]);

  useEffect(() => {
    // Load saved view preference
    if (typeof window !== "undefined") {
      const storedView = localStorage.getItem("isTodayView");
      if (storedView) {
        setIsTodayView(storedView === "true");
      }
      const storedDayOffset = localStorage.getItem("selectedDayOffset");
      if (storedDayOffset) {
        setSelectedDayOffset(Number(storedDayOffset) || 0);
      }
      const storedWeekOffset = localStorage.getItem("selectedWeekOffset");
      if (storedWeekOffset) {
        setSelectedWeekOffset(Number(storedWeekOffset) || 0);
      }
    }
  }, []);

  useEffect(() => {
    // Save view preference
    if (typeof window !== "undefined") {
      localStorage.setItem("isTodayView", String(isTodayView));
      localStorage.setItem("selectedDayOffset", String(selectedDayOffset));
      localStorage.setItem("selectedWeekOffset", String(selectedWeekOffset));
    }
  }, [isTodayView, selectedDayOffset, selectedWeekOffset]);

  useEffect(() => {
    const keys = loadReportedContentKeys();
    const reportedMap = Array.from(keys).reduce((accumulator, key) => {
      accumulator[key] = true;
      return accumulator;
    }, {} as Record<string, boolean>);

    setReportedContent(reportedMap);
  }, []);

  useEffect(() => {
    const keys = loadHiddenContentKeys();
    const hiddenMap = Array.from(keys).reduce((accumulator, key) => {
      accumulator[key] = true;
      return accumulator;
    }, {} as Record<string, boolean>);

    hiddenContentMemory.clear();
    for (const key of keys) {
      hiddenContentMemory.add(key);
    }

    setHiddenContent(hiddenMap);
  }, []);

  useEffect(() => {
    return () => {
      clearBatchRetryTimer();
      if (mobileToggleTapTimerRef.current !== null) {
        window.clearTimeout(mobileToggleTapTimerRef.current);
      }
    };
  }, []);

  const shouldShowWarmupBanner = showGeminiWarmup;

  const getRenderableEvents = (selection?: HistoricalEventCategoryPayload): HistoricalEvent[] => {
    if (!selection) {
      return [];
    }

    const hiddenKeys = new Set(Object.keys(hiddenContent).filter(key => hiddenContent[key]));
    const sourceEvents = Array.isArray(selection.visibleEvents)
      ? selection.visibleEvents
      : selection.events.slice(0, selection.count);

    return sourceEvents
      .filter(event => !hiddenKeys.has(getEventReportKey(event)))
      .slice(0, selection.count);
  };

  useEffect(() => {
    if (!shouldShowWarmupBanner) {
      setWarmupCategoryIndex(0);
      return;
    }

      const intervalId = window.setInterval(() => {
      setWarmupCategoryIndex(currentIndex => (currentIndex + 1) % categories.length);
      }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldShowWarmupBanner, categories.length]);

  useEffect(() => {
    const intervalIds: number[] = [];
    const timeoutIds: number[] = [];

    categories.forEach(category => {
      const staggerDelay = Math.floor(Math.random() * 3500);
      const startRotation = () => {
        intervalIds.push(window.setInterval(() => {
          setEventPreviewIndices(currentIndices => ({
            ...currentIndices,
            [category]: (currentIndices[category] ?? 0) + 1,
          }));
        }, 5000));
      };

      timeoutIds.push(window.setTimeout(startRotation, staggerDelay));
    });

    return () => {
      timeoutIds.forEach(window.clearTimeout);
      intervalIds.forEach(window.clearInterval);
    };
  }, [categories]);

  const fetchCategoryEvents = async (category: string) => {
    setLoadingCategories(prev => ({ ...prev, [category]: true }));
    
    try {
      const dateString = getSelectedPeriodDateString(isTodayView, selectedDayOffset, selectedWeekOffset);
      const {events, cached} = await getHistoricalEventsForCategory(category, isTodayView, dateString);
      setHistoricalEvents(prev => ({
        ...prev,
        [category]: events
      }));
      setCacheStatus(prev => ({
        ...prev,
        [category]: cached
      }));
    } catch (error) {
      console.error(`Failed to fetch events for ${category}`, error);
    } finally {
      setLoadingCategories(prev => ({ ...prev, [category]: false }));
    }
  };

  const fetchAllEvents = async () => {
    const requestId = ++batchFetchRequestIdRef.current;
    const viewType = isTodayView ? 'today' : 'week';
    const dateString = getSelectedPeriodDateString(isTodayView, selectedDayOffset, selectedWeekOffset);
    const clientCacheKey = getClientCacheKey('batch', viewType, dateString);
    const hasClientCache = Boolean(getClientCache<HistoricalEventsByCategory>(clientCacheKey));
    let shouldKeepWarmupVisible = false;

    clearBatchRetryTimer();

    if (!hasClientCache) {
      try {
        const metadataResponse = await fetch(`/api/historical-events?date=${dateString}&viewType=${viewType}&metadataOnly=1`);
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          if (requestId !== batchFetchRequestIdRef.current) {
            setLoadingCategories({});
            return;
          }

          if (metadata?.generationRequired === true) {
            setShowGeminiWarmup(true);
            shouldKeepWarmupVisible = true;
          }
        }
      } catch (metadataError) {
        console.warn('Failed to probe cache status before historical event fetch:', metadataError);
      }
    }

    // Initialize loading state for all categories
    const initialLoadingState: Record<string, boolean> = {};
    categories.forEach(cat => {
      initialLoadingState[cat] = true;
    });
    setLoadingCategories(initialLoadingState);
    
    // Reset cache status
    setCacheStatus({});
    
    try {
      const {eventsByCategory, cached} = await getHistoricalEventsForAllCategories(isTodayView, dateString);
      if (requestId !== batchFetchRequestIdRef.current) {
        setLoadingCategories({});
        return;
      }

      const hasCompleteEvents = hasCompleteHistoricalEventsByCategory(eventsByCategory);

      setHistoricalEvents(prev => ({
        ...prev,
        ...eventsByCategory,
      }));

      setCacheStatus(
        categories.reduce((accumulator, category) => {
          accumulator[category] = cached;
          return accumulator;
        }, {} as Record<string, boolean>)
      );

      if (!cached && !hasCompleteEvents && shouldKeepWarmupVisible) {
        batchRetryTimerRef.current = window.setTimeout(() => {
          void fetchAllEvents();
        }, 10000);
        return;
      }

      shouldKeepWarmupVisible = false;
    } catch (error) {
      console.error('Failed to fetch all categories', error);
    } finally {
      if (requestId !== batchFetchRequestIdRef.current) {
        setLoadingCategories({});
        return;
      }

      if (!shouldKeepWarmupVisible) {
        setShowGeminiWarmup(false);
      }

      if (!shouldKeepWarmupVisible) {
        setLoadingCategories(
          categories.reduce((accumulator, category) => {
            accumulator[category] = false;
            return accumulator;
          }, {} as Record<string, boolean>)
        );
      }
    }
  };

  useEffect(() => {
    void fetchAllEvents();
  }, [isTodayView, selectedDayOffset, selectedWeekOffset, navigationRevision]);

  const toggleView = () => {
    clearBatchRetryTimer();
    setIsTodayView(!isTodayView);
  };

  const jumpToLatestPeriod = () => {
    clearBatchRetryTimer();
    batchFetchRequestIdRef.current += 1;
    setShowGeminiWarmup(false);
    setSelectedDayOffset(0);
    setSelectedWeekOffset(0);
    setNavigationRevision(currentRevision => currentRevision + 1);
  };

  const handleMobileToggleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    ignoreMobileToggleClickUntilRef.current = Date.now() + 700;

    if (mobileToggleTapTimerRef.current !== null) {
      window.clearTimeout(mobileToggleTapTimerRef.current);
      mobileToggleTapTimerRef.current = null;
      jumpToLatestPeriod();
      return;
    }

    mobileToggleTapTimerRef.current = window.setTimeout(() => {
      mobileToggleTapTimerRef.current = null;
      toggleView();
    }, 350);
  };

  const handleMobileToggleClick = () => {
    if (Date.now() < ignoreMobileToggleClickUntilRef.current) {
      return;
    }

    toggleView();
  };

  const activeViewLabel = isTodayView ? "Today View" : "Week View";
  const nextViewLabel = isTodayView ? "Switch to Week View" : "Switch to Today View";
  const selectedPeriodLabel = isTodayView
    ? formatMonthDay(getSelectedPeriodDateString(true, selectedDayOffset, selectedWeekOffset))
    : selectedWeekOffset === 0
      ? 'This week'
      : 'Previous week';
  const canGoForward = isTodayView ? selectedDayOffset > 0 : selectedWeekOffset > 0;
  const showBackwardButton = isTodayView || selectedWeekOffset === 0;
  const goBackward = () => {
    clearBatchRetryTimer();
    if (isTodayView) {
      setSelectedDayOffset(current => Math.min(6, current + 1));
      return;
    }

    setSelectedWeekOffset(current => Math.min(1, current + 1));
  };
  const goForward = () => {
    clearBatchRetryTimer();
    if (isTodayView) {
      setSelectedDayOffset(current => Math.max(0, current - 1));
      return;
    }

    setSelectedWeekOffset(current => Math.max(0, current - 1));
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (!isMobile) {
      return;
    }

    const touch = event.touches[0];
    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (!isMobile || swipeStartXRef.current === null || swipeStartYRef.current === null) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeStartXRef.current;
    const deltaY = touch.clientY - swipeStartYRef.current;

    swipeStartXRef.current = null;
    swipeStartYRef.current = null;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      goForward();
      return;
    }

    goBackward();
  };

  const handleTouchCancel = () => {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  };

  // Share content function - Enhanced for mobile devices
  const shareContent = async (event: HistoricalEvent) => {
    // Create shareable content with domain prominently featured
    const domain = window.location.origin;
    const shareText = `🏛️ ${event.title}\n\n${event.description}\n\n📅 Date: ${event.date}\n🔗 Source: ${event.source || domain}\n\n✨ Discover more historical events at ${domain}`;

    // Check if we're in a secure context (required for Web Share API)
    const isSecureContext = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Check if we're on a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    console.log('Share attempt:', {
      hasShareAPI: !!navigator.share,
      isSecureContext,
      isMobile,
      userAgent: navigator.userAgent,
      webdriver: !!navigator.webdriver
    });

    // Try Web Share API first (if available and in secure context)
    if (navigator.share && typeof window !== 'undefined' && isSecureContext) {
      const shareData = {
        title: `${event.title} - ChronoLens`,
        text: `${event.description}\n\nDiscover more at ${domain}`,
        url: event.source || domain
      };

      try {
        // Check if the browser can share this data
        if (navigator.canShare && navigator.canShare(shareData)) {
          console.log('Using Web Share API with data:', shareData);
          await navigator.share(shareData);
          toast({
            title: "Content Shared",
            description: "Historical event shared successfully!",
          });
          return;
        } else {
          console.log('Web Share API available but cannot share this data format');
        }
      } catch (error) {
        console.log('Web Share API failed:', error);
        // Check if it was a user cancellation (not an error)
        if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('cancelled'))) {
          console.log('User cancelled share dialog');
          return;
        }
      }
    } else {
      console.log('Web Share API not available:', {
        hasShare: !!navigator.share,
        isSecureContext,
        protocol: window.location.protocol,
        hostname: window.location.hostname
      });
    }

    // Fallback to clipboard
    try {
      console.log('Falling back to clipboard copy');
      await navigator.clipboard.writeText(shareText);
      toast({
        title: "Copied to Clipboard",
        description: "Event details copied to clipboard for sharing!",
      });
    } catch (clipboardError) {
      console.log('Clipboard failed:', clipboardError);
      // Final fallback: try to use the older execCommand method for mobile compatibility
      try {
        const textArea = document.createElement('textarea');
        textArea.value = shareText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          toast({
            title: "Copied to Clipboard",
            description: "Event info copied to clipboard!",
          });
        } else {
          throw new Error('execCommand copy failed');
        }
      } catch (finalError) {
        console.error('All share methods failed:', finalError);
        toast({
          title: isMobile ? "Share Unavailable" : "Copy Failed",
          description: isMobile
            ? "Please select and copy the text manually to share."
            : "Unable to copy to clipboard. Please select and copy manually.",
          variant: "destructive",
        });
      }
    }
  };  // Report content function
  const showReportConfirmation = (event: HistoricalEvent) => {
    const reportKey = getEventReportKey(event);
    if (hasReportedEvent(reportKey)) {
      toast({
        title: "Already Reported",
        description: "You already reported this event.",
      });
      return;
    }

    setConfirmReportEvent(event);
  };

  const confirmReportContent = async () => {
    if (!confirmReportEvent) return;
    
    const event = confirmReportEvent;
    const reportKey = getEventReportKey(event);

    if (hasReportedEvent(reportKey)) {
      setConfirmReportEvent(null);
      toast({
        title: "Already Reported",
        description: "You already reported this event.",
      });
      return;
    }
    
    setReportingContent(prev => ({ ...prev, [reportKey]: true }));
    setConfirmReportEvent(null); // Close the dialog
    
    try {
      const response = await fetch('/api/report-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: event.title,
          category: event.category,
          date: event.date
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        markEventAsReported(reportKey);
        setReportedContent(prev => ({ ...prev, [reportKey]: true }));

        toast({
          title: "Content Reported",
          description: result.message,
          variant: result.isHidden ? "destructive" : "default",
        });
        
        if (result.isHidden) {
          markEventAsHidden(reportKey);
          setHiddenContent(prev => ({ ...prev, [reportKey]: true }));
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to report content. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error reporting content:', error);
      toast({
        title: "Error",
        description: "Failed to report content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setReportingContent(prev => ({ ...prev, [reportKey]: false }));
    }
  };

  return (
    <div
      className={cn(
        "relative min-h-screen antialiased flex flex-col transition-colors duration-700",
        isTodayView
          ? "bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900"
          : "bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-amber-950/40 dark:to-rose-950/40"
      )}
      style={isMobile ? { touchAction: "pan-y" } : undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Modern animated background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            isTodayView ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"></div>
        </div>
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            isTodayView ? "opacity-0" : "opacity-100"
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(251,191,36,0.18),rgba(255,255,255,0)),radial-gradient(circle_at_80%_85%,rgba(244,63,94,0.16),rgba(255,255,255,0))]"></div>
        </div>
        
        {/* Content-aligned floating geometric shapes */}
        <div className="container mx-auto px-4 h-full relative">
          <div className="max-w-6xl mx-auto h-full relative">
            {/* Large floating circles */}
            <div className="absolute top-20 left-8 w-32 h-32 bg-gradient-to-br from-indigo-400/20 to-blue-500/20 rounded-full animate-pulse opacity-80">
              <div className="w-full h-full rounded-full animate-spin" style={{animationDuration: '20s'}}>
                <div className="w-4 h-4 bg-indigo-400/40 rounded-full absolute top-2 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>
            
            <div className="absolute top-32 right-8 w-24 h-24 bg-gradient-to-br from-purple-400/20 to-pink-500/20 rounded-full animate-pulse opacity-70" style={{animationDelay: '2s'}}>
              <div className="w-full h-full rounded-full animate-spin" style={{animationDuration: '25s', animationDirection: 'reverse'}}>
                <div className="w-3 h-3 bg-purple-400/40 rounded-full absolute bottom-2 right-2"></div>
              </div>
            </div>
            
            <div className="absolute bottom-40 left-1/4 w-20 h-20 bg-gradient-to-br from-cyan-400/20 to-teal-500/20 rounded-full animate-pulse opacity-60" style={{animationDelay: '4s'}}>
              <div className="w-full h-full rounded-full animate-spin" style={{animationDuration: '30s'}}>
                <div className="w-2 h-2 bg-cyan-400/40 rounded-full absolute top-1 left-1"></div>
              </div>
            </div>
            
            {/* Floating squares and diamonds */}
            <div className="absolute top-1/3 right-1/3 w-8 h-8 bg-gradient-to-br from-emerald-400/25 to-green-500/25 rotate-45 animate-bounce opacity-50" style={{animationDuration: '8s', animationDelay: '1s'}}></div>
            
            <div className="absolute bottom-1/3 right-1/4 w-6 h-6 bg-gradient-to-br from-amber-400/25 to-orange-500/25 rotate-12 animate-bounce opacity-45" style={{animationDuration: '12s', animationDelay: '3s'}}></div>
            
            <div className="absolute top-2/3 left-1/3 w-10 h-10 bg-gradient-to-br from-rose-400/25 to-pink-500/25 rotate-45 animate-bounce opacity-55" style={{animationDuration: '10s', animationDelay: '2s'}}></div>
            
            {/* Small floating dots */}
            <div className="absolute top-16 right-1/2 w-2 h-2 bg-indigo-400/50 rounded-full animate-ping opacity-80" style={{animationDelay: '0s', animationDuration: '4s'}}></div>
            <div className="absolute top-1/2 left-16 w-1.5 h-1.5 bg-purple-400/50 rounded-full animate-ping opacity-70" style={{animationDelay: '1s', animationDuration: '5s'}}></div>
            <div className="absolute bottom-1/4 right-16 w-3 h-3 bg-cyan-400/50 rounded-full animate-ping opacity-60" style={{animationDelay: '2s', animationDuration: '6s'}}></div>
            <div className="absolute top-3/4 left-1/2 w-2 h-2 bg-emerald-400/50 rounded-full animate-ping opacity-65" style={{animationDelay: '3s', animationDuration: '4.5s'}}></div>
            <div className="absolute top-40 right-1/3 w-1 h-1 bg-amber-400/50 rounded-full animate-ping opacity-55" style={{animationDelay: '1.5s', animationDuration: '7s'}}></div>
            
            {/* Subtle moving lines aligned with content */}
            <div className="absolute top-1/4 left-0 w-px h-32 bg-gradient-to-b from-transparent via-indigo-400/40 to-transparent opacity-50 animate-pulse" style={{animationDelay: '2s'}}></div>
            <div className="absolute top-1/2 right-0 w-px h-24 bg-gradient-to-b from-transparent via-purple-400/40 to-transparent opacity-45 animate-pulse" style={{animationDelay: '4s'}}></div>
            <div className="absolute bottom-1/3 left-1/2 w-24 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent opacity-40 animate-pulse" style={{animationDelay: '1s'}}></div>
          </div>
        </div>
        
        {/* SVG animations aligned with content width */}
        <div className="container mx-auto px-4 h-full relative">
          <div className="max-w-6xl mx-auto h-full relative">
            <svg className="w-full h-full opacity-40" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:"rgb(99, 102, 241)", stopOpacity:0.25}} />
                  <stop offset="100%" style={{stopColor:"rgb(14, 165, 233)", stopOpacity:0.25}} />
                </linearGradient>
                <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:"rgb(147, 51, 234)", stopOpacity:0.2}} />
                  <stop offset="100%" style={{stopColor:"rgb(219, 39, 119)", stopOpacity:0.2}} />
                </linearGradient>
                <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:"rgb(6, 182, 212)", stopOpacity:0.2}} />
                  <stop offset="100%" style={{stopColor:"rgb(16, 185, 129)", stopOpacity:0.2}} />
                </linearGradient>
              </defs>
              
              {/* Main floating orbs positioned within content bounds */}
              <circle cx="100" cy="80" r="50" fill="url(#grad1)" className="animate-pulse">
                <animate attributeName="r" values="30;50;30" dur="4s" repeatCount="indefinite"/>
                <animateTransform attributeName="transform" type="translate" values="0,0; 20,10; 0,0" dur="15s" repeatCount="indefinite"/>
              </circle>
              
              <circle cx="1000" cy="120" r="40" fill="url(#grad2)" className="animate-pulse" style={{animationDelay: '1s'}}>
                <animate attributeName="r" values="25;40;25" dur="5s" repeatCount="indefinite"/>
                <animateTransform attributeName="transform" type="translate" values="0,0; -15,25; 0,0" dur="18s" repeatCount="indefinite"/>
              </circle>
              
              <circle cx="200" cy="600" r="35" fill="url(#grad1)" className="animate-pulse" style={{animationDelay: '2s'}}>
                <animate attributeName="r" values="20;35;20" dur="3.5s" repeatCount="indefinite"/>
                <animateTransform attributeName="transform" type="translate" values="0,0; 30,-10; 0,0" dur="20s" repeatCount="indefinite"/>
              </circle>
              
              {/* Additional smaller elements within content area */}
              <circle cx="600" cy="300" r="25" fill="url(#grad3)" className="animate-pulse" style={{animationDelay: '3s'}}>
                <animate attributeName="r" values="15;25;15" dur="6s" repeatCount="indefinite"/>
                <animateTransform attributeName="transform" type="translate" values="0,0; -20,15; 0,0" dur="22s" repeatCount="indefinite"/>
              </circle>
              
              <circle cx="300" cy="200" r="20" fill="url(#grad2)" className="animate-pulse" style={{animationDelay: '4s'}}>
                <animate attributeName="r" values="10;20;10" dur="4.5s" repeatCount="indefinite"/>
                <animateTransform attributeName="transform" type="translate" values="0,0; 25,-20; 0,0" dur="25s" repeatCount="indefinite"/>
              </circle>
              
              <circle cx="900" cy="500" r="30" fill="url(#grad3)" className="animate-pulse" style={{animationDelay: '5s'}}>
                <animate attributeName="r" values="18;30;18" dur="5.5s" repeatCount="indefinite"/>
                <animateTransform attributeName="transform" type="translate" values="0,0; -10,20; 0,0" dur="16s" repeatCount="indefinite"/>
              </circle>
            </svg>
          </div>
        </div>
      </div>
      
      {/* Header - Sticky with Responsive Design */}
      <div className={cn(
        "sticky top-0 z-40 backdrop-blur-lg border-b border-slate-200/20 dark:border-slate-700/20 will-change-[padding] select-none",
        usesCompactHeaderMotion ? "transition-none" : "transition-[padding] duration-200 ease-out",
        isTodayView
          ? "bg-gradient-to-br from-slate-50/95 via-white/95 to-blue-50/95 dark:from-slate-900/95 dark:via-slate-800/95 dark:to-blue-900/95"
          : "bg-gradient-to-br from-amber-50/95 via-orange-50/95 to-rose-50/95 dark:from-slate-900/95 dark:via-amber-950/40 dark:to-rose-950/40",
        isHeaderShrunken ? "py-2" : "py-4"
      )}>
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto relative">
            {/* Header Content */}
            <div className="flex flex-col items-start">
              <div className="flex items-center space-x-3 w-full justify-between">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg",
                    !usesCompactHeaderMotion && "transition-all duration-300 ease-in-out",
                    isHeaderShrunken ? "w-6 h-6" : "w-8 h-8"
                  )}>
                    <svg className={cn(
                      "text-white",
                      !usesCompactHeaderMotion && "transition-all duration-300 ease-in-out",
                      isHeaderShrunken ? "w-3.5 h-3.5" : "w-5 h-5"
                    )} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className={cn(
                    "font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-white dark:to-blue-200 bg-clip-text text-transparent drop-shadow-lg dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]",
                    !usesCompactHeaderMotion && "transition-all duration-300 ease-in-out",
                    isHeaderShrunken ? "text-xl" : "text-3xl"
                  )}>
                    ChronoLens
                  </h1>
                  {isHeaderShrunken && (
                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:bg-slate-800/95 dark:text-slate-100">
                      {selectedPeriodLabel}
                    </span>
                  )}
                </div>
                
                {isMobile ? (
                  <div className="flex justify-end flex-shrink-0">
                    <button
                      onClick={handleMobileToggleClick}
                      onDoubleClick={jumpToLatestPeriod}
                      onTouchEnd={handleMobileToggleTouchEnd}
                      className="group relative flex items-center gap-1.5 rounded-full border border-white/50 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/70"
                      title={`${nextViewLabel}. Double-tap to return to the latest ${isTodayView ? "day" : "week"}.`}
                    >
                      <span className="swipe-date-hint" aria-hidden="true" />
                      {isTodayView ? (
                        <span className="relative flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Today</span>
                        </span>
                      ) : (
                        <span className="relative flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm-6-7h-2v2h2v-2zm0-4h-2v2h2V8zm4 4h-2v2h2v-2zm0-4h-2v2h2V8zM9 8H7v2h2V8zm0 4H7v2h2v-2z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Week</span>
                        </span>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className={cn(
                    "flex origin-right items-center gap-2 md:gap-3",
                    usesCompactHeaderMotion ? "transition-none" : "transition-transform duration-200 ease-out",
                    isHeaderShrunken ? "scale-90" : "scale-100"
                  )}>
                    <div className="h-8 w-8 md:h-10 md:w-10">
                      {showBackwardButton ? (
                        <button
                          type="button"
                          onClick={goBackward}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-md md:h-10 md:w-10 dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-label={isTodayView ? "Previous day" : "Previous week"}
                          title={isTodayView ? "Previous day" : "Previous week"}
                        >
                          <svg className="h-3.5 w-3.5 text-slate-700 md:h-4 md:w-4 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="pointer-events-none invisible inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm backdrop-blur-sm md:h-10 md:w-10 dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-hidden="true"
                          tabIndex={-1}
                        />
                      )}
                    </div>

                    <button 
                      onClick={toggleView}
                      onDoubleClick={jumpToLatestPeriod}
                      className="group flex items-center gap-1.5 rounded-full border border-white/50 bg-white/60 px-2.5 py-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md md:gap-2 md:px-4 md:py-2 dark:border-slate-700/60 dark:bg-slate-800/70"
                      title={`${nextViewLabel}. Double-click to return to the latest ${isTodayView ? "day" : "week"}.`}
                    >
                      {isTodayView ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-amber-500 transition-transform group-hover:scale-110 md:h-4 md:w-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-amber-600 md:text-sm dark:text-amber-400">Today</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5 text-blue-500 transition-transform group-hover:scale-110 md:h-4 md:w-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm-6-7h-2v2h2v-2zm0-4h-2v2h2V8zm4 4h-2v2h2v-2zm0-4h-2v2h2V8zM9 8H7v2h2V8zm0 4H7v2h2v-2z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-blue-600 md:text-sm dark:text-blue-400">Week</span>
                        </>
                      )}
                    </button>

                    <div className="h-8 w-8 justify-self-end md:h-10 md:w-10">
                      {canGoForward ? (
                        <button
                          type="button"
                          onClick={goForward}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-md md:h-10 md:w-10 dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-label={isTodayView ? "Next day" : "This week"}
                          title={isTodayView ? "Next day" : "This week"}
                        >
                          <svg className="h-3.5 w-3.5 text-slate-700 md:h-4 md:w-4 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="pointer-events-none invisible inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm backdrop-blur-sm md:h-10 md:w-10 dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-hidden="true"
                          tabIndex={-1}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Subtitle - Optional, minimal */}
              <div className={cn(
                "overflow-hidden",
                !usesCompactHeaderMotion && "transition-all duration-300 ease-in-out",
                isHeaderShrunken ? "max-h-0 opacity-0 mt-0" : "max-h-16 opacity-100 mt-1"
              )}>
                <p className="text-slate-600 dark:text-slate-300 text-base select-none">
                  Discover historical events across {selectedPeriodLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div
        className={cn(
          "container mx-auto px-4 pb-8 relative z-10 flex-1",
          usesCompactHeaderMotion && isHeaderShrunken && "translate-y-[54px] mb-[54px]"
        )}
        style={{ scrollPaddingTop: '96px' }}
      >
        <div className="max-w-6xl mx-auto pt-4">
            {shouldShowWarmupBanner && (
            <div className="mb-6 flex justify-center" role="status" aria-live="polite">
              <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/15 bg-white/15 px-6 py-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:bg-slate-950/35">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.14),transparent_28%)]" />
                <div className="relative flex flex-col items-center gap-5">
                  {/* Gemini spinner */}
                  <div className="relative flex h-28 w-28 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-slate-300/60 animate-[spin_14s_linear_infinite] dark:border-indigo-400/25" />
                    <div className="absolute inset-4 rounded-full border border-sky-400/45 animate-[spin_10s_linear_infinite_reverse] dark:border-cyan-300/35" />
                    <div className="absolute inset-8 rounded-full border border-fuchsia-400/30 animate-pulse dark:border-fuchsia-300/25" />
                    <div className="absolute inset-11 rounded-full bg-gradient-to-br from-white/30 via-cyan-200/30 to-fuchsia-200/30 blur-xl" />
                    <Icons.spinner className="relative h-11 w-11 text-slate-700 animate-spin drop-shadow-[0_0_18px_rgba(255,255,255,0.35)] dark:text-white dark:drop-shadow-[0_0_18px_rgba(255,255,255,0.6)]" />
                  </div>

                  {/* Title and description */}
                  <div className="space-y-2 max-w-lg">
                    <div className="inline-flex items-center rounded-full border border-slate-300/70 bg-white/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-900 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white/80">
                      One-time warmup
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.55)] dark:text-white md:text-4xl">
                      Curating fresh historical selections
                    </h2>
                    <p className="text-balance text-sm leading-6 text-slate-800 dark:text-white/75 md:text-base">
                      Gemini is generating a fresh ranked set of events for this view.
                    </p>
                  </div>

                  {/* Bouncing dots */}
                  <div className="flex w-full max-w-md items-end justify-center gap-2 pt-1" aria-hidden="true">
                    <span className="h-3 w-3 rounded-full bg-cyan-300 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-5 w-3 rounded-full bg-sky-300 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-7 w-3 rounded-full bg-fuchsia-300 animate-bounce" />
                    <span className="h-4 w-3 rounded-full bg-amber-300 animate-bounce [animation-delay:-0.2s]" />
                    <span className="h-3 w-3 rounded-full bg-emerald-300 animate-bounce [animation-delay:-0.35s]" />
                  </div>

                  {/* Category carousel */}
                  <div className="flex w-full items-center justify-center gap-3 pt-1" aria-live="polite" aria-atomic="true">
                    <div className="relative h-8 w-[11rem] overflow-hidden rounded-full border border-slate-300/60 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/10">
                      <div
                        className="flex h-full transition-transform duration-500 ease-in-out"
                        style={{ transform: `translateX(-${warmupCategoryIndex * 100}%)` }}
                      >
                        {categories.map((cat) => (
                          <div key={cat} className="flex h-full min-w-full items-center justify-center px-3">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-900 dark:text-white">
                              {cat}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
              </div>
              )}
              <div className={cn("w-full", shouldShowWarmupBanner && "hidden")}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {categories.map((category) => (
                <Dialog key={category} open={selectedCategory === category} onOpenChange={(open) => setSelectedCategory(open ? category : null)}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className="group w-full overflow-hidden rounded-xl text-left shadow-lg outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                    aria-label={`View ${category} historical events`}
                  >
                    <Card className="overflow-hidden border border-white/50 bg-white/80 dark:border-white/10 dark:bg-[#1e1e1e]">
                      <div 
                        className="relative h-24 w-full overflow-hidden md:h-36 lg:h-40"
                        style={{
                          background: categoryBackgrounds[category as keyof typeof categoryBackgrounds],
                        }}
                      >
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent"></div>
                        
                        {/* Category header */}
                        <div className="absolute left-16 right-3 top-1/3 -translate-y-1/2 md:left-4 md:right-4 md:flex md:items-center md:justify-between">
                          <div className="flex w-full min-w-0 items-center md:space-x-3">
                            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/30 bg-white/20 backdrop-blur-sm md:flex md:h-12 md:w-12">
                              {categoryIcons[category as keyof typeof categoryIcons]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h2 className="text-xl font-bold text-white drop-shadow-lg md:text-2xl">
                                {category}
                              </h2>
                            </div>
                          </div>
                        </div>
                        <div className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/30 bg-white/20 backdrop-blur-sm md:hidden">
                          {categoryIcons[category as keyof typeof categoryIcons]}
                        </div>
                        {loadingCategories[category] ? (
                          <p className="absolute left-16 right-3 top-2/3 -translate-y-1/2 text-left text-xs text-white/80 md:left-[4.75rem] md:right-4 md:text-sm">
                            Loading events...
                          </p>
                        ) : getRenderableEvents(historicalEvents[category]).length > 0 ? (
                          <div className="absolute left-16 right-3 top-2/3 -translate-y-1/2 md:left-[4.75rem] md:right-4">
                            <EventTitlePreview
                              key={`${category}-${(eventPreviewIndices[category] ?? 0) % getRenderableEvents(historicalEvents[category]).length}`}
                              previewKey={`${category}-${(eventPreviewIndices[category] ?? 0) % getRenderableEvents(historicalEvents[category]).length}`}
                              title={getRenderableEvents(historicalEvents[category])[(eventPreviewIndices[category] ?? 0) % getRenderableEvents(historicalEvents[category]).length].title}
                            />
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  </button>

                  <DialogContent className="flex h-[85dvh] w-[90%] max-w-[800px] flex-col gap-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-2xl dark:border-white/10 dark:bg-[#121212]">
                    <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-slate-50/95 px-5 py-5 text-left backdrop-blur sm:px-8 sm:py-6 dark:border-white/10 dark:bg-[#121212]/95">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/30 shadow-sm"
                          style={{ background: categoryBackgrounds[category as keyof typeof categoryBackgrounds] }}
                          aria-hidden="true"
                        >
                          {cloneElement(categoryIcons[category as keyof typeof categoryIcons], {
                            className: cn(
                              "h-6 w-6 text-white",
                            ),
                          })}
                        </div>
                        <div className="min-w-0">
                          <DialogTitle className="text-2xl font-bold text-slate-950 dark:text-slate-50">{category}</DialogTitle>
                        </div>
                      </div>
                      <div
                        className="relative flex shrink-0 touch-pan-y select-none items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm md:hidden dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchCancel}
                        aria-label={`${selectedPeriodLabel}. Swipe left or right to change ${isTodayView ? "day" : "week"}.`}
                      >
                        <span className="swipe-date-hint" aria-hidden="true" />
                        <span className="relative whitespace-nowrap">{selectedPeriodLabel}</span>
                      </div>
                      <div className="hidden shrink-0 items-center rounded-full border border-slate-200 bg-white/80 p-0.5 shadow-sm md:flex dark:border-white/10 dark:bg-white/5">
                          <button
                            type="button"
                            onClick={goBackward}
                            disabled={!showBackwardButton}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-200 dark:hover:bg-white/10"
                            aria-label={isTodayView ? "Previous day" : "Previous week"}
                            title={isTodayView ? "Previous day" : "Previous week"}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <span className="inline-flex h-8 items-center whitespace-nowrap border-x border-slate-200 px-2.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:text-slate-200">
                            {selectedPeriodLabel}
                          </span>
                          <button
                            type="button"
                            onClick={goForward}
                            disabled={!canGoForward}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-200 dark:hover:bg-white/10"
                            aria-label={isTodayView ? "Next day" : "Next week"}
                            title={isTodayView ? "Next day" : "Next week"}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                      </div>
                    </DialogHeader>
                    <div className="p-5 sm:p-8">
                        {loadingCategories[category] ? (
                          <div className="space-y-3">
                            <DialogDescription className="text-sm font-medium text-slate-600 dark:text-slate-300">
                              Loading historical events...
                            </DialogDescription>
                            {[...Array(3)].map((_, index) => (
                              <div key={index} className="flex space-x-3">
                                <Skeleton className="h-12 w-12 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-3 w-3/4" />
                                  <Skeleton className="h-3 w-1/2" />
                                  <Skeleton className="h-3 w-full" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : getRenderableEvents(historicalEvents[category]).length > 0 ? (
                          <div className="space-y-3">
                            {getRenderableEvents(historicalEvents[category]).map((event: HistoricalEvent, index: number) => {
                              const reportKey = getEventReportKey(event);
                              const isReporting = reportingContent[reportKey] || false;
                              const isReported = reportedContent[reportKey] || false;
                              
                              return (
                                <Card key={index} className="group border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-700 hover:shadow-md transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5">
                                  <CardContent className="p-4">
                                    <div className="space-y-3">
                                      {/* Header with title and action buttons */}
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1 pr-3">
                                          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
                                            {event.title}
                                          </h3>
                                          <div className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium px-2 py-0.5 rounded-md inline-block">
                                            {event.date}
                                          </div>
                                        </div>
                                        <div className="flex items-center space-x-2 flex-shrink-0">
                                          {/* Report button */}
                                          <button
                                            onClick={() => showReportConfirmation(event)}
                                            disabled={isReporting || isReported}
                                            className="w-7 h-7 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-200 group/report disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={isReported ? "Already reported by you" : "Report inappropriate content"}
                                          >
                                            {isReporting ? (
                                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                            ) : isReported ? (
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                            ) : (
                                              <svg className="w-3.5 h-3.5 group-hover/report:scale-105 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                            )}
                                          </button>
                                          
                                          {/* Share button */}
                                          <button
                                            onClick={() => shareContent(event)}
                                            className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 group/share"
                                            title="Share this historical event"
                                          >
                                            <svg className="w-3.5 h-3.5 text-white group-hover/share:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                            </svg>
                                          </button>
                                          
                                          {/* Source link button */}
                                          {event.source ? (
                                            <a 
                                              href={event.source} 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 group/icon"
                                              title={`View source for ${event.title}`}
                                            >
                                              <svg className="w-3.5 h-3.5 text-white group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </a>
                                          ) : (
                                            <div className="w-7 h-7 bg-gradient-to-br from-slate-400 to-slate-500 rounded-lg flex items-center justify-center shadow-md opacity-50">
                                              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="w-full">
                                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                                          {event.description}
                                        </p>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-base mb-3">No historical events found</p>
                            <Button 
                              onClick={() => fetchCategoryEvents(category)} 
                              variant="outline" 
                              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Retry
                            </Button>
                          </div>
                        )}
                      </div>
                  </DialogContent>
                </Dialog>
              ))}
              </div>
              </div>
          </div>
        </div>
      <Footer />
      
      {/* Report Confirmation Dialog */}
      <AlertDialog open={!!confirmReportEvent} onOpenChange={(open) => !open && setConfirmReportEvent(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-[#1e1e1e]/95">
          <AlertDialogHeader className="space-y-1.5 text-left">
            <AlertDialogTitle className="text-base sm:text-lg">Report content</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed sm:text-sm">
              Report <strong>"{confirmReportEvent?.title}"</strong> as inappropriate?
              <br />
              Multiple reports may hide this content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end gap-2 pt-2">
            <AlertDialogCancel className="mt-0 h-8 flex-1 text-xs sm:h-9 sm:text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReportContent}
              className="h-8 flex-1 border border-rose-200 bg-rose-100 text-xs text-rose-700 hover:bg-rose-200 sm:h-9 sm:text-sm dark:border-rose-900/60 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
            >
              Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
