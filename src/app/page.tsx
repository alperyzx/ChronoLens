"use client";

import { useState, useEffect, useRef, useMemo, type AnimationEvent, type MouseEvent, type TouchEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Footer } from "@/components/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory } from "@/lib/historical-event-categories";
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

const CLIENT_CACHE_PREFIX = "chronolens_client_events";
const CLIENT_CACHE_VERSION = "v7";
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

function hasAnyHistoricalEventsByCategory(eventsByCategory: Record<HistoricalEventCategory, HistoricalEventSelection>): boolean {
  return Object.values(eventsByCategory).some(selection => Array.isArray(selection?.events) && selection.events.length > 0);
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

async function getReportCacheRevision(date: string, viewType: 'today' | 'week', category?: string, signal?: AbortSignal): Promise<string | undefined> {
  const params = new URLSearchParams({
    date,
    viewType,
    metadataOnly: '1',
  });

  if (category) {
    params.set('category', category);
  }

  try {
    const response = await fetch(`/api/historical-events?${params.toString()}`, { signal });
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
  Science: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  Politics: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  Art: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  Sports: "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)",
  Literature: "linear-gradient(135deg, #5f27cd 0%, #341f97 100%)",
};

async function getHistoricalEventsForCategory(category: string, isTodayView: boolean, dateString: string, signal?: AbortSignal): Promise<{events: HistoricalEventCategoryPayload, cached: boolean}> {
  const viewType = isTodayView ? 'today' : 'week';
  const clientCacheKey = getClientCacheKey('single', viewType, dateString, category);
  const reportCacheRevision = await getReportCacheRevision(dateString, viewType, category, signal);

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
    const response = await fetch(`/api/historical-events?date=${dateString}&category=${category}&viewType=${viewType}`, { signal });
    
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

    if (payload.events.length > 0) {
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

async function getHistoricalEventsForAllCategories(isTodayView: boolean, dateString: string, signal?: AbortSignal, knownReportCacheRevision?: string): Promise<{eventsByCategory: HistoricalEventsByCategory, cached: boolean}> {
  const viewType = isTodayView ? 'today' : 'week';
  const clientCacheKey = getClientCacheKey('batch', viewType, dateString);
  const reportCacheRevision = knownReportCacheRevision ?? await getReportCacheRevision(dateString, viewType, undefined, signal);

  const cachedClientData = getClientCache<HistoricalEventsByCategory>(clientCacheKey);
  if (cachedClientData) {
    const memoryEntry = clientCacheMemory.get(clientCacheKey);
    if (!reportCacheRevision || memoryEntry?.revision === reportCacheRevision) {
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

  const response = await fetch(`/api/historical-events?date=${dateString}&viewType=${viewType}`, { signal });

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

  if (result.dataByCategory && hasAnyHistoricalEventsByCategory(result.dataByCategory)) {
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
  const [historicalEvents, setHistoricalEvents] = useState<CategoryEvents>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<string, boolean>>({});
  const [showGeminiWarmup, setShowGeminiWarmup] = useState(false);
  const [reportingContent, setReportingContent] = useState<Record<string, boolean>>({});
  const [reportedContent, setReportedContent] = useState<Record<string, boolean>>({});
  const [hiddenContent, setHiddenContent] = useState<Record<string, boolean>>({});
  const [confirmReportEvent, setConfirmReportEvent] = useState<HistoricalEvent | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const isHeaderShrunken = openAccordions.length > 0;
  const categories = HISTORICAL_EVENT_CATEGORIES;
  const isMobile = useIsMobile();
  const batchRetryTimerRef = useRef<number | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const batchRequestRef = useRef<AbortController | null>(null);
  const pendingAccordionScrollRef = useRef<HTMLButtonElement | null>(null);
  const { toast } = useToast();

  const clearBatchRetryTimer = () => {
    if (batchRetryTimerRef.current !== null) {
      window.clearTimeout(batchRetryTimerRef.current);
      batchRetryTimerRef.current = null;
    }
  };

  const handleAccordionTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.currentTarget.dataset.state !== "closed") {
      return;
    }

    pendingAccordionScrollRef.current = event.currentTarget;
  };

  const handleAccordionContentAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !pendingAccordionScrollRef.current) {
      return;
    }

    const trigger = pendingAccordionScrollRef.current;
    pendingAccordionScrollRef.current = null;
    const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 96;
    const top = trigger.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

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
    setPreferencesLoaded(true);
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
    let scrollEndTimer: number | null = null;

    const handleScroll = () => {
      document.documentElement.classList.add("is-scrolling");

      if (scrollEndTimer !== null) {
        window.clearTimeout(scrollEndTimer);
      }

      scrollEndTimer = window.setTimeout(() => {
        document.documentElement.classList.remove("is-scrolling");
        scrollEndTimer = null;
      }, 120);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollEndTimer !== null) {
        window.clearTimeout(scrollEndTimer);
      }
      document.documentElement.classList.remove("is-scrolling");
    };
  }, []);

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
      batchRequestRef.current?.abort();
    };
  }, []);

  const shouldShowWarmupBanner = showGeminiWarmup;

  const hiddenKeys = useMemo(
    () => new Set(Object.keys(hiddenContent).filter(key => hiddenContent[key])),
    [hiddenContent]
  );

  const getRenderableEvents = (selection?: HistoricalEventCategoryPayload): HistoricalEvent[] => {
    if (!selection) {
      return [];
    }

    const sourceEvents = Array.isArray(selection.visibleEvents) && selection.visibleEvents.length > 0
      ? selection.visibleEvents
      : selection.events.slice(0, selection.count);

    return sourceEvents.filter(event => !hiddenKeys.has(getEventReportKey(event)));
  };

  const fetchCategoryEvents = async (category: string) => {
    setLoadingCategories(prev => ({ ...prev, [category]: true }));
    
    try {
      const dateString = getSelectedPeriodDateString(isTodayView, selectedDayOffset, selectedWeekOffset);
      const {events} = await getHistoricalEventsForCategory(category, isTodayView, dateString);
      setHistoricalEvents(prev => ({
        ...prev,
        [category]: events
      }));
    } catch (error) {
      console.error(`Failed to fetch events for ${category}`, error);
    } finally {
      setLoadingCategories(prev => ({ ...prev, [category]: false }));
    }
  };

  const fetchAllEvents = async () => {
    batchRequestRef.current?.abort();
    const controller = new AbortController();
    batchRequestRef.current = controller;
    const viewType = isTodayView ? 'today' : 'week';
    const dateString = getSelectedPeriodDateString(isTodayView, selectedDayOffset, selectedWeekOffset);
    const clientCacheKey = getClientCacheKey('batch', viewType, dateString);
    const hasClientCache = Boolean(getClientCache<HistoricalEventsByCategory>(clientCacheKey));
    let shouldKeepWarmupVisible = false;
    let knownReportCacheRevision: string | undefined;

    clearBatchRetryTimer();

    if (!hasClientCache) {
      try {
        const metadataResponse = await fetch(`/api/historical-events?date=${dateString}&viewType=${viewType}&metadataOnly=1`, { signal: controller.signal });
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          knownReportCacheRevision = metadata?.reportCacheRevision;
          if (metadata?.generationRequired === true) {
            setShowGeminiWarmup(true);
            shouldKeepWarmupVisible = true;
          }
        }
      } catch (metadataError) {
        if (controller.signal.aborted) {
          return;
        }
        console.warn('Failed to probe cache status before historical event fetch:', metadataError);
      }
    }

    // Initialize loading state for all categories
    const initialLoadingState: Record<string, boolean> = {};
    categories.forEach(cat => {
      initialLoadingState[cat] = true;
    });
    setLoadingCategories(initialLoadingState);
    
    try {
      const {eventsByCategory, cached} = await getHistoricalEventsForAllCategories(
        isTodayView,
        dateString,
        controller.signal,
        knownReportCacheRevision
      );
      const hasEvents = hasAnyHistoricalEventsByCategory(eventsByCategory);

      setHistoricalEvents(prev => ({
        ...prev,
        ...eventsByCategory,
      }));

      if (!cached && !hasEvents && shouldKeepWarmupVisible) {
        batchRetryTimerRef.current = window.setTimeout(() => {
          void fetchAllEvents();
        }, 10000);
        return;
      }

      shouldKeepWarmupVisible = false;
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      console.error('Failed to fetch all categories', error);
    } finally {
      if (batchRequestRef.current !== controller || controller.signal.aborted) {
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
    if (preferencesLoaded) {
      void fetchAllEvents();
    }
  }, [preferencesLoaded, isTodayView, selectedDayOffset, selectedWeekOffset]);

  const toggleView = () => {
    clearBatchRetryTimer();
    setIsTodayView(!isTodayView);
  };

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

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile) {
      return;
    }

    const touch = event.touches[0];
    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
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
    <div className={cn(
        "relative min-h-screen antialiased flex flex-col",
        isTodayView
          ? "bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900"
          : "bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-amber-950/40 dark:to-rose-950/40"
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-slate-950 focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        Skip to historical events
      </a>

      <div className="ambient-background" aria-hidden="true">
        <div className="ambient-background__orb ambient-background__orb--indigo" />
        <div className="ambient-background__orb ambient-background__orb--purple" />
        <div className="ambient-background__orb ambient-background__orb--cyan" />
      </div>

      {/* Header */}
      <header
        aria-label="ChronoLens header"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={isMobile ? { touchAction: "pan-y" } : undefined}
        className={cn(
        "sticky top-0 z-40 border-b border-slate-200/60 bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/90 select-none transition-[padding] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        isHeaderShrunken ? "py-2" : "py-4",
        isTodayView
          ? "bg-gradient-to-br from-slate-50/95 via-white/95 to-blue-50/95 dark:from-slate-900/95 dark:via-slate-800/95 dark:to-blue-900/95"
          : "bg-gradient-to-br from-amber-50/95 via-orange-50/95 to-rose-50/95 dark:from-slate-900/95 dark:via-amber-950/40 dark:to-rose-950/40"
      )}>
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto relative">
            {/* Header Content */}
            <div className="flex flex-col items-start">
              <div className="flex items-center space-x-3 w-full justify-between">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg transition-[width,height] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                    isHeaderShrunken ? "h-6 w-6" : "h-8 w-8"
                  )}>
                    <svg className={cn(
                      "text-white transition-[width,height] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                      isHeaderShrunken ? "h-3.5 w-3.5" : "h-5 w-5"
                    )} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className={cn(
                    "font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-white dark:to-blue-200 bg-clip-text text-transparent drop-shadow-lg dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] transition-[font-size] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                    isHeaderShrunken ? "text-xl" : "text-3xl"
                  )}>
                    ChronoLens
                  </h1>
                  {isHeaderShrunken && (
                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200/70 bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300">
                      {selectedPeriodLabel}
                    </span>
                  )}
                </div>
                
                {isMobile ? (
                  <div className="flex justify-end flex-shrink-0">
                    <button
                      onClick={toggleView}
                      className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/50 bg-white/90 px-3 py-1.5 shadow-sm transition-colors duration-150 touch-manipulation hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-700/60 dark:bg-slate-800/90"
                      title={nextViewLabel}
                    >
                      {isTodayView ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Today</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm-6-7h-2v2h2v-2zm0-4h-2v2h2V8zm4 4h-2v2h2v-2zm0-4h-2v2h2V8zM9 8H7v2h2V8zm0 4H7v2h2v-2z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Week</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8">
                      {showBackwardButton ? (
                        <button
                          type="button"
                          onClick={goBackward}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm transition-colors duration-150 touch-manipulation hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-label={isTodayView ? "Previous day" : "Previous week"}
                          title={isTodayView ? "Previous day" : "Previous week"}
                        >
                          <svg className="h-3.5 w-3.5 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm invisible pointer-events-none dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-hidden="true"
                          tabIndex={-1}
                        />
                      )}
                    </div>

                    <button 
                      onClick={toggleView}
                      className="flex items-center gap-1.5 rounded-full border border-white/50 bg-white/60 px-2.5 py-1.5 shadow-sm transition-colors duration-150 touch-manipulation hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-700/60 dark:bg-slate-800/70"
                      title={nextViewLabel}
                    >
                      {isTodayView ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Today</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm-6-7h-2v2h2v-2zm0-4h-2v2h2V8zm4 4h-2v2h2v-2zm0-4h-2v2h2V8zM9 8H7v2h2V8zm0 4H7v2h2v-2z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Week</span>
                        </>
                      )}
                    </button>

                    <div className="h-8 w-8 justify-self-end">
                      {canGoForward ? (
                        <button
                          type="button"
                          onClick={goForward}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm transition-colors duration-150 touch-manipulation hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-700/60 dark:bg-slate-800/70"
                          aria-label={isTodayView ? "Next day" : "This week"}
                          title={isTodayView ? "Next day" : "This week"}
                        >
                          <svg className="h-3.5 w-3.5 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/60 shadow-sm invisible pointer-events-none dark:border-slate-700/60 dark:bg-slate-800/70"
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
                "overflow-hidden transition-[max-height,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                isHeaderShrunken ? "mt-0 max-h-0 opacity-0" : "mt-1 max-h-16 opacity-100"
              )}>
                <p className="text-slate-600 dark:text-slate-300 text-base select-none">
                  Discover historical events across {selectedPeriodLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main id="main-content" className="container mx-auto px-4 pb-8 relative z-10 flex-1" style={{ scrollPaddingTop: "96px" }}>
        <div className="max-w-6xl mx-auto pt-4">
            {shouldShowWarmupBanner && (
            <div className="mb-6 flex justify-center" role="status" aria-live="polite">
              <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/60 bg-white/90 px-6 py-8 text-center shadow-lg dark:border-white/20 dark:bg-slate-950/90">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.14),transparent_28%)]" />
                <div className="relative flex flex-col items-center gap-5">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-300/70 bg-white/70 dark:border-white/20 dark:bg-white/10">
                    <Icons.spinner className="h-8 w-8 animate-spin text-indigo-600 dark:text-cyan-300" />
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

                </div>
              </div>
              </div>
              )}
              <div className={cn("w-full", shouldShowWarmupBanner && "hidden")}>
              <Accordion
                type="multiple"
                value={openAccordions}
                onValueChange={setOpenAccordions}
                className="space-y-4"
                style={{ overflowAnchor: "none" }}
              >
              {categories.map((category) => (
                <AccordionItem 
                  key={category} 
                  value={category} 
                  className="border-0"
                >
                  <Card className="overflow-hidden border-0 bg-white/95 shadow-lg dark:bg-slate-800/95">
                    <AccordionTrigger
                      onClick={handleAccordionTriggerClick}
                      className="hover:no-underline p-0 [&>svg]:hidden [&[data-state=open]>div>div>div:last-child>div:last-child>svg]:rotate-180"
                    >
                      <div 
                        className="relative h-16 md:h-20 overflow-hidden w-full"
                        style={{
                          background: categoryBackgrounds[category as keyof typeof categoryBackgrounds],
                        }}
                      >
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent"></div>
                        
                        {/* Category header */}
                        <div className="absolute inset-0 flex items-center justify-between p-3 md:p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center border border-white/30">
                              {categoryIcons[category as keyof typeof categoryIcons]}
                            </div>
                            <div>
                              <h2 className="text-xl font-bold text-white drop-shadow-lg">
                                {category}
                              </h2>
                              <p className="text-white/80 text-xs text-left">
                                {loadingCategories[category] ? "Loading events..." : historicalEvents[category] ? `${historicalEvents[category]?.count || 0} events` : "No events found"}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {/* Custom subtle expand/collapse arrow */}
                            <div className="w-6 h-6 bg-white/15 rounded-md flex items-center justify-center border border-white/20">
                              <svg className="w-3 h-3 text-white/90 transition-transform duration-300 ease-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 9l6 6 6-6" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    {/* Content */}
                    <AccordionContent onAnimationEnd={handleAccordionContentAnimationEnd} className="p-0">
                      <div className="p-4">
                        {loadingCategories[category] ? (
                          <div className="space-y-3">
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
                              {getRenderableEvents(historicalEvents[category]).map((event: HistoricalEvent) => {
                              const reportKey = getEventReportKey(event);
                              const isReporting = reportingContent[reportKey] || false;
                              const isReported = reportedContent[reportKey] || false;
                              
                              return (
                                <Card key={getEventReportKey(event)} className="group border border-slate-200 bg-gradient-to-r from-white to-slate-50 dark:border-slate-700 dark:from-slate-800 dark:to-slate-700">
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
                                            aria-label={isReported ? "Already reported" : "Report inappropriate content"}
                                            className="flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-slate-200 text-slate-500 shadow-sm transition-colors duration-150 hover:bg-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-300"
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
                                            aria-label="Share this historical event"
                                            className="flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                                            title="Share this historical event"
                                          >
                                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                            </svg>
                                          </button>
                                          
                                          {/* Source link button */}
                                          {event.source ? (
                                            <a 
                                              href={event.source} 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              aria-label={`View source for ${event.title} (opens in new tab)`}
                                              className="flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                                              title={`View source for ${event.title} (opens in new tab)`}
                                            >
                                              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </a>
                                          ) : (
                                            <div
                                              role="img"
                                              aria-label="Source unavailable"
                                              title="Source unavailable"
                                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 shadow-md opacity-50"
                                            >
                                              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="w-full">
                                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-base">
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
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              ))}
            </Accordion>
              </div>
          </div>
        </main>
      <Footer />
      
      {/* Report Confirmation Dialog */}
      <AlertDialog open={!!confirmReportEvent} onOpenChange={(open) => !open && setConfirmReportEvent(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-lg">Report Content</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Report <strong>"{confirmReportEvent?.title}"</strong> as inappropriate?
              <br />
              Multiple reports may hide this content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 pt-2">
            <AlertDialogCancel className="flex-1 h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReportContent}
              className="flex-1 h-9 bg-red-600 hover:bg-red-700 text-white"
            >
              Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
