"use client";

import { useState, useEffect, useCallback } from 'react';

export function useHeaderShrink(threshold: number = 100) {
  const [isShrunken, setIsShrunken] = useState(false);

  const handleScroll = useCallback(() => {
    // Add error handling for mobile browsers
    try {
      const scrollY = window?.scrollY ?? 0;
      
      // Get the sticky header element to determine its height
      const stickyHeader = document.querySelector('[class*="sticky top-0"]') as HTMLElement;
      const headerHeight = stickyHeader?.offsetHeight || 80; // fallback to 80px
      
      // Check if any content is intersecting with the header area
      // Look for accordion items or other main content elements
      const contentElements = document.querySelectorAll('[data-accordion-item], .accordion-item, main > div > div, [class*="AccordionItem"], [class*="Card"]');
      let hasContentUnderHeader = false;
      
      if (contentElements.length > 0) {
        for (const element of contentElements) {
          const rect = element.getBoundingClientRect();
          // Check if element is intersecting with header area (top of viewport + header height)
          // Add a small buffer (10px) to trigger shrinking slightly before content actually touches header
          if (rect.top < headerHeight + 10 && rect.bottom > 0) {
            hasContentUnderHeader = true;
            break;
          }
        }
      }
      
      // Combine scroll position and content intersection logic
      const shouldShrink = scrollY > threshold || hasContentUnderHeader;
      
      // Use hysteresis to prevent rapid toggling
      if (!isShrunken && shouldShrink) {
        setIsShrunken(true);
      } else if (isShrunken && scrollY < threshold - 30 && !hasContentUnderHeader) {
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