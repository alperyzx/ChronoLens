"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/navigation";
import { ContentAdminAuthGuard } from "./auth-guard";

interface CacheStats {
  keys: number;
  expired?: number;
  totalFiles?: number;
  totalSizeBytes?: number;
  totalSizeMB?: number;
  hits: number;
  misses: number;
  hitRate: number;
  backend?: 'mongodb' | 'file';
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

interface ReportStats {
  totalReported: number;
  hiddenContent: number;
  currentWeek: number;
  currentYear: number;
  lastClearWeek: number;
  lastClearYear: number;
}

interface ReportedContentItem {
  title: string;
  category: string;
  date: string;
  reportCount: number;
  reportedAt: number;
  weekNumber: number;
  year: number;
}

export default function ContentAdmin() {
  const { toast } = useToast();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [reportStats, setReportStats] = useState<ReportStats | null>(null);
  const [reportedContent, setReportedContent] = useState<ReportedContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingReportedContent, setLoadingReportedContent] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearingReports, setClearingReports] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [recoveringKey, setRecoveringKey] = useState<string | null>(null);

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

  const fetchReportStats = async () => {
    setLoadingReports(true);
    try {
      const response = await fetch('/api/report-stats');
      if (response.ok) {
        const data = await response.json();
        setReportStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch report stats:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchReportedContent = async () => {
    setLoadingReportedContent(true);
    try {
      const response = await fetch('/api/report-stats?action=all');
      if (response.ok) {
        const data = await response.json();
        const items: ReportedContentItem[] = Array.isArray(data.reportedContent) ? data.reportedContent : [];
        setReportedContent(
          [...items].sort((a, b) => {
            if (b.reportCount !== a.reportCount) {
              return b.reportCount - a.reportCount;
            }
            return b.reportedAt - a.reportedAt;
          })
        );
      }
    } catch (error) {
      console.error('Failed to fetch reported content:', error);
    } finally {
      setLoadingReportedContent(false);
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

  const cleanupExpiredCache = async () => {
    setCleaning(true);
    try {
      const response = await fetch('/api/cache-stats-enhanced', { method: 'POST' });
      if (response.ok) {
        await fetchStats(); // Refresh stats after cleanup
      }
    } catch (error) {
      console.error('Failed to cleanup expired cache:', error);
    } finally {
      setCleaning(false);
    }
  };

  const clearAllReports = async () => {
    setClearingReports(true);
    try {
      const response = await fetch('/api/report-stats', { method: 'DELETE' });
      if (response.ok) {
        await fetchReportStats(); // Refresh stats after clearing
        setReportedContent([]);
      }
    } catch (error) {
      console.error('Failed to clear reports:', error);
    } finally {
      setClearingReports(false);
    }
  };

  const recoverReportedItem = async (item: ReportedContentItem) => {
    const key = `${item.title}::${item.category}::${item.date}`;
    setRecoveringKey(key);
    try {
      const response = await fetch('/api/report-stats', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: item.title,
          category: item.category,
          date: item.date,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Content Recovered",
          description: `"${item.title}" is now visible. Report count: ${data.reportCount || 0}`,
        });
        await Promise.all([fetchReportStats(), fetchReportedContent()]);
      } else {
        toast({
          title: "Recovery Failed",
          description: "Unable to recover the content. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to recover reported content:', error);
      toast({
        title: "Error",
        description: "An error occurred while recovering the content.",
        variant: "destructive",
      });
    } finally {
      setRecoveringKey(null);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchReportStats();
    fetchReportedContent();
  }, []);

  const adminContent = (
    <>
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
                Content Administration
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-lg">
                Monitor and manage content reporting, moderation, and cache behavior
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
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
                  <span className="text-sm font-medium">Valid Keys:</span>
                  <Badge variant="secondary">{stats.keys}</Badge>
                </div>
                {stats.expired !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Expired Keys:</span>
                    <Badge variant="outline">{stats.expired}</Badge>
                  </div>
                )}
                {stats.totalSizeMB !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Cache Size:</span>
                    <Badge variant="secondary">{stats.totalSizeMB} MB</Badge>
                  </div>
                )}
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
                {stats.backend && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Storage Backend:</span>
                    <Badge variant="outline">{stats.backend === 'mongodb' ? 'Firestore Enterprise' : 'File Cache'}</Badge>
                  </div>
                )}
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
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Report Statistics</span>
              </CardTitle>
              <CardDescription>
                Content moderation and reporting metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingReports ? (
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ) : reportStats ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Reported:</span>
                    <Badge variant="secondary">{reportStats.totalReported}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Hidden Content:</span>
                    <Badge variant={reportStats.hiddenContent > 0 ? "destructive" : "default"}>
                      {reportStats.hiddenContent}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Current Week:</span>
                    <Badge variant="outline">{reportStats.currentYear}-W{reportStats.currentWeek}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Last Cache Clear:</span>
                    <Badge variant="outline">{reportStats.lastClearYear}-W{reportStats.lastClearWeek}</Badge>
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-xs text-muted-foreground">
                      Report cache automatically clears each week
                    </div>
                  </div>
                  <div className="pt-4 border-t space-y-2">
                    <Button
                      onClick={fetchReportStats}
                      disabled={loadingReports}
                      className="w-full"
                      variant="outline"
                    >
                      {loadingReports ? "Refreshing..." : "Refresh Report Stats"}
                    </Button>
                    <Button
                      onClick={fetchReportedContent}
                      disabled={loadingReportedContent}
                      className="w-full"
                      variant="outline"
                    >
                      {loadingReportedContent ? 'Refreshing...' : 'Refresh Review Panel'}
                    </Button>
                    <Button
                      onClick={clearAllReports}
                      disabled={clearingReports}
                      className="w-full"
                      variant="destructive"
                    >
                      {clearingReports ? "Clearing..." : "Clear All Reports"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Warning: This will unhide all reported content until re-reported.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Failed to load report statistics</p>
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
                {loading ? "Refreshing..." : "Refresh Cache Stats"}
              </Button>
            </div>
            <div>
              <Button 
                onClick={cleanupExpiredCache} 
                disabled={cleaning}
                className="w-full mb-2"
                variant="outline"
              >
                {cleaning ? "Cleaning..." : "Cleanup Expired Cache"}
              </Button>
              <p className="text-xs text-muted-foreground mb-4">
                Removes only expired cache files while keeping valid ones.
              </p>
            </div>
            <div>
              <Button 
                onClick={clearCache} 
                disabled={clearing}
                className="w-full mb-2"
                variant="destructive"
              >
                {clearing ? "Clearing..." : "Clear All Cache"}
              </Button>
              <p className="text-xs text-muted-foreground mb-4">
                Warning: This will force fresh API calls for all subsequent requests.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Reported Content Review</span>
          </CardTitle>
          <CardDescription>
            Review all reports, recover hidden items, and keep moderation transparent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingReportedContent ? (
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : reportedContent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reported content found for this week.</p>
          ) : (
            <div className="space-y-3">
              {reportedContent.map((item) => {
                const key = `${item.title}::${item.category}::${item.date}`;
                const isHidden = item.reportCount >= 5;
                const isRecovering = recoveringKey === key;

                return (
                  <div key={key} className="rounded-lg border border-slate-200/70 dark:border-slate-700/70 p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-slate-800 dark:text-slate-100">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.category} • {item.date} • Last report: {new Date(item.reportedAt).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Reports: {item.reportCount}</Badge>
                          <Badge variant={isHidden ? 'destructive' : 'outline'}>
                            {isHidden ? 'Hidden' : 'Visible'}
                          </Badge>
                        </div>
                      </div>

                      <Button
                        onClick={() => recoverReportedItem(item)}
                        disabled={isRecovering}
                        variant="outline"
                        className="min-w-24"
                      >
                        {isRecovering ? 'Recovering...' : 'Recover'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Content & Reporting Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Cache Strategy:</strong> Persistent cache with Firestore Enterprise as the primary backend when enabled</p>
            <p><strong>TTL Policy:</strong></p>
            <ul className="ml-4 space-y-1">
              <li>• <strong>Today view:</strong> Cache expires at midnight (daily refresh)</li>
              <li>• <strong>Week view:</strong> Cache expires at end of week/Sunday (weekly refresh)</li>
            </ul>
            <p><strong>Cache Keys:</strong> Format: chronolens_events_[viewType]_[category]_[date]</p>
            <p><strong>Benefits:</strong> Minimizes Gemini API requests, survives server restarts, shared cache across all users</p>
            <p><strong>Storage:</strong> Firestore Enterprise cache with file fallback for local development and outages</p>
            <p><strong>Solution:</strong> Fixes Google Cloud server restart cache reset issues</p>
            
            <div className="mt-4 pt-4 border-t">
              <p><strong>Report System:</strong> Content moderation through user reporting</p>
              <ul className="ml-4 space-y-1">
                <li>• <strong>Threshold:</strong> Content hidden after 5 reports</li>
                <li>• <strong>Auto-clear:</strong> Report cache clears every Sunday (new week)</li>
                <li>• <strong>Filtering:</strong> Reported content filtered from both day and week views</li>
                <li>• <strong>Persistence:</strong> Report data persists across server restarts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
    </>
  );

  return (
    <ContentAdminAuthGuard>
      {adminContent}
    </ContentAdminAuthGuard>
  );
}
