"use client";

import { useState, useEffect } from 'react';

export function useHeaderShrink(threshold: number = 100) {
  const [isShrunken, setIsShrunken] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      
      // Add hysteresis to prevent rapid toggling
      if (!isShrunken && scrollY > threshold) {
        setIsShrunken(true);
      } else if (isShrunken && scrollY < threshold - 20) {
        setIsShrunken(false);
      }
    };

    // Add scroll event listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Check initial scroll position
    handleScroll();

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [threshold, isShrunken]);

  return isShrunken;
}