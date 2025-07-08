"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigation, Footer } from "@/components/navigation";

interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  hitRate: number;
  expirationInfo?: {
    today: {
      expiresAt: string;
      description: string;
      ttlSeconds: number;
    };
    week: {
      expiresAt: string;
      description: string;
      ttlSeconds: number;
    };
  };
  timestamp: string;
}

export default function CacheAdmin() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cache-stats-enhanced');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch cache stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      const response = await fetch('/api/cache-stats', { method: 'DELETE' });
      if (response.ok) {
        await fetchStats(); // Refresh stats after clearing
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <>
      <Navigation />
      <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 antialiased">
      {/* Modern animated background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]"></div>
      </div>
      
      <div className="container mx-auto p-6 max-w-6xl relative z-10">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
                Cache Administration
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-lg">
                Monitor and manage the server-side cache for historical events
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>Cache Statistics</span>
              </CardTitle>
              <CardDescription>
                Performance metrics for the historical events cache
              </CardDescription>
            </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ) : stats ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Cached Keys:</span>
                  <Badge variant="secondary">{stats.keys}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Cache Hits:</span>
                  <Badge variant="default">{stats.hits}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Cache Misses:</span>
                  <Badge variant="outline">{stats.misses}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Hit Rate:</span>
                  <Badge variant={stats.hitRate > 0.7 ? "default" : "destructive"}>
                    {(stats.hitRate * 100).toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date(stats.timestamp).toLocaleString()}
                </div>
                
                {stats.expirationInfo && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Cache Expiration</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>Today view expires:</span>
                        <span className="text-muted-foreground">
                          {new Date(stats.expirationInfo.today.expiresAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Week view expires:</span>
                        <span className="text-muted-foreground">
                          {new Date(stats.expirationInfo.week.expiresAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Failed to load cache statistics</p>
            )}
          </CardContent>
        </Card>

          <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
                <span>Cache Management</span>
              </CardTitle>
              <CardDescription>
                Actions to manage the cache system
              </CardDescription>
            </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Button 
                onClick={fetchStats} 
                disabled={loading}
                className="w-full"
                variant="outline"
              >
                {loading ? "Refreshing..." : "Refresh Statistics"}
              </Button>
            </div>
            <div>
              <Button 
                onClick={clearCache} 
                disabled={clearing}
                className="w-full"
                variant="destructive"
              >
                {clearing ? "Clearing..." : "Clear All Cache"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Warning: This will force fresh API calls for all subsequent requests.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Cache Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Cache Strategy:</strong> Server-side adaptive cache using node-cache</p>
            <p><strong>TTL Policy:</strong></p>
            <ul className="ml-4 space-y-1">
              <li>• <strong>Today view:</strong> Cache expires at midnight (daily refresh)</li>
              <li>• <strong>Week view:</strong> Cache expires at end of week/Sunday (weekly refresh)</li>
            </ul>
            <p><strong>Cache Keys:</strong> Format: events_[viewType]_[category]_[date]</p>
            <p><strong>Benefits:</strong> Minimizes Gemini API requests, shared cache across all users</p>
            <p><strong>Storage:</strong> In-memory cache (resets on server restart)</p>
          </div>
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
    </>
  );
}
