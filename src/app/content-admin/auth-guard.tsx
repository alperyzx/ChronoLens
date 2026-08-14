'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigation, NavigationShell, Footer } from '@/components/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
  onAuthenticationChange?: (authenticated: boolean) => void;
}

export function ContentAdminAuthGuard({ children, onAuthenticationChange }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/content-admin-auth')
      .then(response => response.json())
      .then(data => {
        const authenticated = data.authenticated === true;
        setIsAuthenticated(authenticated);
        onAuthenticationChange?.(authenticated);
      })
      .catch(() => {
        setIsAuthenticated(false);
        onAuthenticationChange?.(false);
      });
  }, [onAuthenticationChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/content-admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.authenticated) {
        setIsAuthenticated(true);
        onAuthenticationChange?.(true);
        setPassword('');
        setError('');
      } else {
        setError(data.message || 'Authentication failed');
        setPassword('');
      }
    } catch (err) {
      setError('Failed to authenticate. Please try again.');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/content-admin-auth', { method: 'DELETE' });
    setIsAuthenticated(false);
    onAuthenticationChange?.(false);
    setPassword('');
    setError('');
  };

  if (!isAuthenticated) {
    return (
      <>
        <Navigation />
        <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 antialiased flex items-center justify-center">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]"></div>
          </div>

          <div className="w-full max-w-md px-4">
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader className="space-y-2">
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                </div>
                <CardTitle className="text-2xl text-center">Content Administration</CardTitle>
                <CardDescription className="text-center">
                  Enter your password to access the content administration panel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="bg-white/50 dark:bg-slate-700/50"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <div
                      className={`p-3 rounded-lg text-sm ${
                        'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700'
                      }`}
                    >
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !password}
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Verifying...' : 'Unlock Admin Panel'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <div className="relative">
      <NavigationShell>
        <Button
          onClick={handleLogout}
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-red-200 bg-red-50 px-3 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
        >
          Logout
        </Button>
      </NavigationShell>
      {children}
    </div>
  );
}
