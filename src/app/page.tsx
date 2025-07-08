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

// Category Icons
const categoryIcons = {
  Sociology: <Icons.user className="mr-2 h-4 w-4" />,
  Technology: <Icons.workflow className="mr-2 h-4 w-4" />,
  Philosophy: <Icons.help className="mr-2 h-4 w-4" />,
  Science: <Icons.shield className="mr-2 h-4 w-4" />,
  Politics: <Icons.shield className="mr-2 h-4 w-4" />,
  Art: <Icons.edit className="mr-2 h-4 w-4" />,
};

// Add the missing link icon definition
const linkIcon = <Icons.edit className="h-3 w-3 mr-1" />; // Using the edit icon as a replacement

// Category Background Images
const categoryBackgrounds = {
  Sociology: "https://picsum.photos/1920/300",
  Technology: "https://picsum.photos/1920/301",
  Philosophy: "https://picsum.photos/1920/302",
  Science: "https://picsum.photos/1920/303",
  Politics: "https://picsum.photos/1920/304",
  Art: "https://picsum.photos/1920/305",
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
    <div className="relative min-h-screen bg-background text-foreground antialiased">
      {/* Stylish SVG Background */}
      <div className="absolute inset-0 -z-10">
        <svg viewBox="0 0 1440 320" className="w-full h-full">
          <path fill="#9d4edd" fillOpacity="0.15" d="M0,256L48,240C96,224,192,192,288,165.3C384,139,480,117,576,112C672,107,768,117,864,144C960,171,1056,213,1152,213.3C1248,213,1344,171,1392,149.3L1440,128L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"></path>
        </svg>
      </div>
      
      <div className="container mx-auto p-4 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">ChronoLens</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="today-view" className="text-sm">
                {isTodayView ? "Today" : "This Week"}
              </Label>
              <Switch id="today-view" checked={isTodayView} onCheckedChange={toggleView} />
            </div>
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-10rem)] w-full">
          <Accordion type="single" collapsible>
            {categories.map((category) => (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger
                  className="rounded-lg overflow-hidden relative mb-2"
                  style={{
                    backgroundImage: `url(${categoryBackgrounds[category as keyof typeof categoryBackgrounds]})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    padding: '20px',
                  }}
                >
                  <div className="absolute inset-0 bg-black/20"></div>
                  <h2 className="text-xl font-semibold flex items-center mb-2 text-white relative z-10 drop-shadow-md">
                    {categoryIcons[category as keyof typeof categoryIcons]}
                    {category}
                    {cacheStatus[category] && (
                      <span className="ml-2 text-xs bg-green-500/80 px-2 py-1 rounded-full">
                        Cached
                      </span>
                    )}
                  </h2>
                </AccordionTrigger>
                <AccordionContent>
                  {loadingCategories[category] ? (
                    <div className="grid gap-2">
                      {[...Array(3)].map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-md" />
                      ))}
                    </div>
                  ) : historicalEvents[category] && historicalEvents[category].length > 0 ? (
                    <div className="grid gap-2">
                      {historicalEvents[category].map((event: any, index: number) => (
                        <Card key={index} className="bg-card text-card-foreground rounded-lg shadow-md overflow-hidden">
                          <CardHeader>
                            <CardTitle>{event.title}</CardTitle>
                            <CardDescription className="flex items-center">
                              {event.date}
                              {event.source && (
                                <a 
                                  href={event.source} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="ml-2 text-xs text-blue-500 hover:underline flex items-center"
                                >
                                  {linkIcon}
                                  Source
                                </a>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <p>{event.description}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <p className="text-gray-500">No historical events found.</p>
                      <Button 
                        onClick={() => fetchCategoryEvents(category)} 
                        variant="outline" 
                        className="mt-2"
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
      </div>
      <Toaster />
    </div>
  );
}

