"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Cache Administration</h1>
        <p className="text-muted-foreground">
          Monitor and manage the server-side cache for historical events
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cache Statistics</CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle>Cache Management</CardTitle>
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
  );
}
