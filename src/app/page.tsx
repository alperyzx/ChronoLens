"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { generateHistoricalEvents } from "@/ai/flows/generate-historical-events";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Navigation, Footer } from "@/components/navigation";
import { useHeaderShrink } from "@/hooks/use-header-shrink";

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
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const categories: Array<"Sociology" | "Technology" | "Philosophy" | "Science" | "Politics" | "Art"> = ["Sociology", "Technology", "Philosophy", "Science", "Politics", "Art"];
  // Use a simpler logic: expand header when all accordions are closed
  const baseHeaderShrunken = useHeaderShrink(100);
  const isHeaderShrunken = baseHeaderShrunken && openAccordions.length > 0;
  const accordionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Handle accordion value changes and smooth scroll
  const handleAccordionChange = (value: string[]) => {
    const newlyOpened = value.filter(v => !openAccordions.includes(v));
    setOpenAccordions(value);
    
    // If a new accordion was opened, scroll it to the top
    if (newlyOpened.length > 0) {
      const newAccordion = newlyOpened[0];
      const element = accordionRefs.current[newAccordion];
      if (element) {
        // Add a small delay to allow the accordion to open
        setTimeout(() => {
          const rect = element.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          // Dynamic header height based on shrink state
          const headerHeight = isHeaderShrunken ? 64 : 96; // py-2 = 16px*2, py-4 = 24px*2, plus content
          const padding = 20; // Additional spacing
          const targetPosition = rect.top + scrollTop - headerHeight - padding;
          
          window.scrollTo({
            top: Math.max(0, targetPosition), // Ensure we don't scroll to negative position
            behavior: 'smooth'
          });
        }, 150);
      }
    }
  };
  
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
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 antialiased flex flex-col">
      <Navigation />
      
      
      {/* Modern animated background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"></div>
        
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
        "sticky top-0 z-40 bg-gradient-to-br from-slate-50/95 via-white/95 to-blue-50/95 dark:from-slate-900/95 dark:via-slate-800/95 dark:to-blue-900/95 backdrop-blur-lg border-b border-slate-200/20 dark:border-slate-700/20 transition-all duration-300 ease-in-out will-change-padding",
        isHeaderShrunken ? "py-2" : "py-4"
      )}>
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto relative">
            {/* Header Content */}
            <div className="flex flex-col items-start">
              <div className="flex items-center space-x-3 w-full justify-between">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 ease-in-out",
                    isHeaderShrunken ? "w-6 h-6" : "w-8 h-8"
                  )}>
                    <svg className={cn(
                      "text-white transition-all duration-300 ease-in-out",
                      isHeaderShrunken ? "w-3.5 h-3.5" : "w-5 h-5"
                    )} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className={cn(
                    "font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-white dark:to-blue-200 bg-clip-text text-transparent transition-all duration-300 ease-in-out drop-shadow-lg dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]",
                    isHeaderShrunken ? "text-xl" : "text-3xl"
                  )}>
                    ChronoLens
                  </h1>
                </div>
                
                {/* Day/Week Toggle - Aligned to right edge */}
                <button 
                  onClick={toggleView}
                  className={cn(
                    "bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-lg shadow-lg hover:bg-white/90 dark:hover:bg-slate-800/90 transition-all duration-300 hover:scale-105 flex items-center justify-center",
                    isHeaderShrunken ? "p-1.5 scale-90 w-6 h-6" : "p-2.5 w-8 h-8"
                  )}
                  title={isTodayView ? "Switch to Week View" : "Switch to Today View"}
                >
                  <div className={cn(
                    "transition-all duration-300 ease-in-out flex items-center justify-center",
                    isHeaderShrunken ? "w-6 h-6" : "w-8 h-8"
                  )}>
                    {isTodayView ? (
                      // Today Icon - Calendar with dot
                      <svg className="w-5 h-5 md:w-6 md:h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        <circle cx="12" cy="15" r="2" fill="currentColor" />
                      </svg>
                    ) : (
                      // Week Icon - Grid
                      <svg className="w-5 h-5 md:w-6 md:h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    )}
                  </div>
                </button>
              </div>
              
              {/* Subtitle with smooth transitions - single line */}
              <div className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                isHeaderShrunken ? "max-h-0 opacity-0 mt-0" : "max-h-6 opacity-100 mt-1"
              )}>
                <p className="text-slate-600 dark:text-slate-300 text-base whitespace-nowrap">
                  Discover historical events across {isTodayView ? "today" : "this week"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container mx-auto px-4 pb-8 relative z-10 flex-1" style={{ scrollPaddingTop: '96px' }}>
        <div className="max-w-6xl mx-auto pt-4">
          <div className="w-full">
            <Accordion 
              type="multiple" 
              className="space-y-4"
              value={openAccordions}
              onValueChange={handleAccordionChange}
            >
              {categories.map((category) => (
                <AccordionItem 
                  key={category} 
                  value={category} 
                  className="border-0"
                  data-accordion-item
                  ref={(el) => { accordionRefs.current[category] = el; }}
                >
                  <Card className="overflow-hidden border-0 shadow-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                    <AccordionTrigger className="hover:no-underline p-0 [&>svg]:hidden [&[data-state=open]>div>div>div:last-child>div:last-child>svg]:rotate-180">
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
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/30">
                              {categoryIcons[category as keyof typeof categoryIcons]}
                            </div>
                            <div>
                              <h2 className="text-xl font-bold text-white drop-shadow-lg">
                                {category}
                              </h2>
                              <p className="text-white/80 text-xs">
                                {loadingCategories[category] 
                                  ? "Loading events..." 
                                  : historicalEvents[category] 
                                    ? `${historicalEvents[category].length} events`
                                    : "No events found"
                                }
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {/* Custom subtle expand/collapse arrow */}
                            <div className="w-6 h-6 bg-white/15 backdrop-blur-sm rounded-md flex items-center justify-center border border-white/20">
                              <svg className="w-3 h-3 text-white/90 transition-transform duration-300 ease-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 9l6 6 6-6" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    {/* Content */}
                    <AccordionContent className="p-0">
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
                        ) : historicalEvents[category] && historicalEvents[category].length > 0 ? (
                          <div className="space-y-3">
                            {historicalEvents[category].map((event: any, index: number) => (
                              <Card key={index} className="group border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-700 hover:shadow-md transition-all duration-200 hover:scale-[1.005]">
                                <CardContent className="p-4">
                                  <div className="space-y-3">
                                    {/* Header with title and calendar icon as source link */}
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 pr-3">
                                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
                                          {event.title}
                                        </h3>
                                        <div className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium px-2 py-0.5 rounded-md inline-block">
                                          {event.date}
                                        </div>
                                      </div>
                                      <div className="flex-shrink-0">
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
                            ))}
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
      </div>
      <Footer />
      <Toaster />
    </div>
  );
}

