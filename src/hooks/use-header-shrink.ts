"use client";

import { useState, useEffect, useCallback } from 'react';

export function useHeaderShrink(threshold: number = 100) {
  const [isShrunken, setIsShrunken] = useState(false);

  const handleScroll = useCallback(() => {
    // Add error handling for mobile browsers
    try {
      const scrollY = window?.scrollY ?? 0;
      
      // Use a larger hysteresis gap to prevent shivering
      if (!isShrunken && scrollY > threshold + 10) {
        setIsShrunken(true);
      } else if (isShrunken && scrollY < threshold - 30) {
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

    // Use a longer throttle delay to reduce rapid changes
    let timeoutId: NodeJS.Timeout;
    let isThrottled = false;
    
    const throttledScroll = () => {
      if (!isThrottled) {
        isThrottled = true;
        timeoutId = setTimeout(() => {
          handleScroll();
          isThrottled = false;
        }, 100); // Slower throttling to reduce layout shifts
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    
    // Check initial scroll position with delay
    setTimeout(handleScroll, 100);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', throttledScroll);
      // Restore scroll anchoring on cleanup
      if (document.documentElement) {
        document.documentElement.style.overflowAnchor = 'auto';
      }
    };
  }, [handleScroll]);

  return isShrunken;
}