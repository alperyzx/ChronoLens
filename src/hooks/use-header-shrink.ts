"use client";

import { useState, useEffect, useCallback } from 'react';

export function useHeaderShrink(threshold: number = 100) {
  const [isShrunken, setIsShrunken] = useState(false);

  const handleScroll = useCallback(() => {
    // Add error handling for mobile browsers
    try {
      const scrollY = window?.scrollY ?? 0;
      
      // Get actual header height from DOM to be precise
      const headerElement = document.querySelector('div[class*="sticky top-0"]');
      const headerHeight = headerElement?.getBoundingClientRect().height || 80;
      
      // Check if any content is intersecting with the header area
      // Look for accordion items or other main content elements
      const contentElements = document.querySelectorAll('[data-accordion-item]');
      let hasContentUnderHeader = false;
      
      if (contentElements.length > 0) {
        for (const element of contentElements) {
          const rect = element.getBoundingClientRect();
          // Check if element is intersecting with header area (top of viewport + header height)
          // Use a larger buffer (25px) and only check elements that are actually visible
          if (rect.top < headerHeight + 25 && rect.bottom > headerHeight && rect.height > 0) {
            hasContentUnderHeader = true;
            break;
          }
        }
      }
      
      // Primary detection based on scroll position to prevent infinite loops
      // Only use content intersection as secondary confirmation
      const scrollBasedShrink = scrollY > threshold;
      const shouldShrink = scrollBasedShrink || (hasContentUnderHeader && scrollY > 20);
      
      // Use hysteresis with smaller gap for better responsiveness
      if (!isShrunken && shouldShrink) {
        setIsShrunken(true);
      } else if (isShrunken && scrollY < threshold - 20 && !hasContentUnderHeader) {
        setIsShrunken(false);
      }
    } catch (error) {
      console.warn('Error in scroll handler:', error);
    }
  }, [threshold, isShrunken]);

  useEffect(() => {
    // Check if window is available (client-side)
    if (typeof window === 'undefined') return;

    // Disable scroll anchoring to prevent layout shift warnings
    if (document.documentElement) {
      document.documentElement.style.overflowAnchor = 'none';
    }

    // Use requestAnimationFrame for smoother performance
    let rafId: number;
    let isScheduled = false;
    
    const throttledScroll = () => {
      if (!isScheduled) {
        isScheduled = true;
        rafId = requestAnimationFrame(() => {
          handleScroll();
          isScheduled = false;
        });
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    window.addEventListener('resize', throttledScroll, { passive: true }); // Also handle resize events
    
    // Check initial scroll position with delay
    setTimeout(handleScroll, 100);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', throttledScroll);
      window.removeEventListener('resize', throttledScroll);
      // Restore scroll anchoring on cleanup
      if (document.documentElement) {
        document.documentElement.style.overflowAnchor = 'auto';
      }
    };
  }, [handleScroll]);

  return isShrunken;
}