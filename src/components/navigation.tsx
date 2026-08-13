"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function useNavigationVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsVisible(currentScrollY < 24 || currentScrollY <= lastScrollY);
      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return isVisible;
}

export function Navigation() {
  const pathname = usePathname();
  const isVisible = useNavigationVisibility();

  // Don't render navigation if on home page (no content to show)
  if (pathname === "/") {
    return null;
  }

  return (
    <nav className={`fixed left-1/2 top-4 z-50 w-full max-w-6xl -translate-x-1/2 px-6 transition-all duration-200 ${isVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
      <div className="ml-auto flex w-fit items-center gap-1 rounded-full border border-white/50 bg-white/60 p-1 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/70">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </Button>
          </Link>
          {/* Admin button hidden as requested */}
      </div>
    </nav>
  );
}

export function NavigationShell({
  children,
}: {
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isVisible = useNavigationVisibility();

  if (pathname === "/") {
    return null;
  }

  return (
    <nav className={`fixed left-1/2 top-4 z-50 w-full max-w-6xl -translate-x-1/2 px-6 transition-all duration-200 ${isVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
      <div className="ml-auto flex w-fit items-center gap-1 rounded-full border border-white/50 bg-white/60 p-1 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/70">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </Button>
          </Link>
          {children}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                ChronoLens
              </span>
            </div>
            <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-400">
              <span>Powered by Gemini AI</span>
              <span>•</span>
              <span>Built with Next.js</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
