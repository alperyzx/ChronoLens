"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { generateHistoricalEvents } from "@/ai/flows/generate-historical-events";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/toaster";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Navigation, Footer } from "@/components/navigation";

// Define types for our events
type HistoricalEvent = {
  title: string;
  date: string;
  description: string;
  category: string;
  source: string; // Added source field
};

// Define CategoryEvents type which was missing
type CategoryEvents = {
  [category: string]: HistoricalEvent[];
};

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
};

// Add the missing link icon definition
const linkIcon = <Icons.edit className="h-3 w-3 mr-1" />; // Using the edit icon as a replacement

// Category Background Gradients - Modern themed gradients
const categoryBackgrounds = {
  Sociology: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  Technology: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  Philosophy: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  Science: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  Politics: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  Art: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
};

async function getHistoricalEventsForCategory(category: string, isTodayView: boolean): Promise<{events: HistoricalEvent[], cached: boolean}> {
  const today = new Date();
  const dateString = today.toISOString().slice(0, 10);
  const viewType = isTodayView ? 'today' : 'week';
  
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
    
    return {
      events: result.data || [],
      cached: result.cached || false
    };
  } catch (error) {
    console.error(`Failed to fetch events for category: ${category}`, error);
    return {
      events: [],
      cached: false
    }; // Return empty events array on failure
  }
}

export default function Home() {
  const [isTodayView, setIsTodayView] = useState(true);
  const [historicalEvents, setHistoricalEvents] = useState<CategoryEvents>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<string, boolean>>({});
  const [cacheStatus, setCacheStatus] = useState<Record<string, boolean>>({});
  const categories: Array<"Sociology" | "Technology" | "Philosophy" | "Science" | "Politics" | "Art"> = ["Sociology", "Technology", "Philosophy", "Science", "Politics", "Art"];
  
  useEffect(() => {
    // Load saved view preference
    if (typeof window !== "undefined") {
      const storedView = localStorage.getItem("isTodayView");
      if (storedView) {
        setIsTodayView(storedView === "true");
      }
    }
  }, []);

  useEffect(() => {
    // Save view preference
    if (typeof window !== "undefined") {
      localStorage.setItem("isTodayView", String(isTodayView));
    }
  }, [isTodayView]);

  const fetchCategoryEvents = async (category: string) => {
    setLoadingCategories(prev => ({ ...prev, [category]: true }));
    
    try {
      const {events, cached} = await getHistoricalEventsForCategory(category, isTodayView);
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

  const fetchAllEvents = () => {
    // Initialize loading state for all categories
    const initialLoadingState: Record<string, boolean> = {};
    categories.forEach(cat => {
      initialLoadingState[cat] = true;
    });
    setLoadingCategories(initialLoadingState);
    
    // Reset cache status
    setCacheStatus({});
    
    // Fetch each category independently
    categories.forEach(fetchCategoryEvents);
  };

  useEffect(() => {
    fetchAllEvents();
  }, [isTodayView]);

  const toggleView = () => {
    setIsTodayView(!isTodayView);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 antialiased">
      <Navigation />
      
      {/* Day/Week Toggle - Mobile Friendly */}
      <div className="fixed top-3 left-3 md:top-4 md:left-4 z-50">
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-xl px-3 py-2 shadow-lg">
          <div className="flex items-center space-x-2">
            <span className={`text-sm font-medium transition-colors select-none ${isTodayView ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
              Today
            </span>
            <Switch 
              id="today-view" 
              checked={!isTodayView} 
              onCheckedChange={() => toggleView()}
              className="data-[state=checked]:bg-indigo-600"
            />
            <span className={`text-sm font-medium transition-colors select-none ${!isTodayView ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
              Week
            </span>
          </div>
        </div>
      </div>
      
      {/* Modern animated background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]"></div>
        <div className="absolute inset-0">
          <svg className="w-full h-full opacity-30" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor:"rgb(99, 102, 241)", stopOpacity:0.1}} />
                <stop offset="100%" style={{stopColor:"rgb(14, 165, 233)", stopOpacity:0.1}} />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="50" fill="url(#grad1)" className="animate-pulse">
              <animate attributeName="r" values="30;50;30" dur="3s" repeatCount="indefinite"/>
            </circle>
            <circle cx="800" cy="200" r="40" fill="url(#grad1)" className="animate-pulse" style={{animationDelay: '1s'}}>
              <animate attributeName="r" values="25;40;25" dur="4s" repeatCount="indefinite"/>
            </circle>
            <circle cx="200" cy="800" r="35" fill="url(#grad1)" className="animate-pulse" style={{animationDelay: '2s'}}>
              <animate attributeName="r" values="20;35;20" dur="3.5s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
      </div>
      
      {/* Header - Sticky */}
      <div className="sticky top-0 z-40 bg-gradient-to-br from-slate-50/95 via-white/95 to-blue-50/95 dark:from-slate-900/95 dark:via-slate-800/95 dark:to-blue-900/95 backdrop-blur-lg border-b border-slate-200/20 dark:border-slate-700/20">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
                ChronoLens
              </h1>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-base">
              Discover historical events across {isTodayView ? "today" : "this week"} in different subjects
            </p>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container mx-auto px-4 pb-8 relative z-10">
        <div className="max-w-6xl mx-auto">
          <ScrollArea className="h-[calc(100vh-12rem)] w-full">
            <Accordion type="multiple" className="space-y-6">
              {categories.map((category) => (
                <AccordionItem key={category} value={category} className="border-0">
                  <Card className="overflow-hidden border-0 shadow-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                    <AccordionTrigger className="hover:no-underline p-0 [&[data-state=open]>div>div>div>div>svg]:rotate-180">
                      <div 
                        className="relative h-32 overflow-hidden w-full"
                        style={{
                          background: categoryBackgrounds[category as keyof typeof categoryBackgrounds],
                        }}
                      >
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent"></div>
                        
                        {/* Category header */}
                        <div className="absolute inset-0 flex items-center justify-between p-6">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
                              {categoryIcons[category as keyof typeof categoryIcons]}
                            </div>
                            <div>
                              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                                {category}
                              </h2>
                              <p className="text-white/80 text-sm">
                                {loadingCategories[category] 
                                  ? "Loading events..." 
                                  : historicalEvents[category] 
                                    ? `${historicalEvents[category].length} events`
                                    : "No events found"
                                }
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            {cacheStatus[category] && (
                              <div className="bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full border border-emerald-400/50">
                                <div className="flex items-center space-x-1">
                                  <div className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></div>
                                  <span>Cached</span>
                                </div>
                              </div>
                            )}
                            <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/30">
                              <svg className="w-4 h-4 text-white transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    {/* Content */}
                    <AccordionContent className="p-0">
                      <div className="p-6">
                        {loadingCategories[category] ? (
                          <div className="space-y-4">
                            {[...Array(3)].map((_, index) => (
                              <div key={index} className="flex space-x-4">
                                <Skeleton className="h-16 w-16 rounded-xl" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-4 w-3/4" />
                                  <Skeleton className="h-3 w-1/2" />
                                  <Skeleton className="h-3 w-full" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : historicalEvents[category] && historicalEvents[category].length > 0 ? (
                          <div className="space-y-4">
                            {historicalEvents[category].map((event: any, index: number) => (
                              <Card key={index} className="group border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-700 hover:shadow-lg transition-all duration-200 hover:scale-[1.01]">
                                <CardContent className="p-6">
                                  <div className="flex items-start space-x-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between mb-2">
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                          {event.title}
                                        </h3>
                                        {event.source && (
                                          <a 
                                            href={event.source} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="ml-2 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium flex items-center space-x-1 hover:underline transition-colors"
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            <span>Source</span>
                                          </a>
                                        )}
                                      </div>
                                      <div className="flex items-center space-x-2 mb-3">
                                        <div className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-sm font-medium px-3 py-1 rounded-full">
                                          {event.date}
                                        </div>
                                      </div>
                                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {event.description}
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-lg mb-4">No historical events found</p>
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
          </ScrollArea>
        </div>
      </div>
      <Footer />
      <Toaster />
    </div>
  );
}

