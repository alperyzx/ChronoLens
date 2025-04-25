'use client';

import {useEffect, useState} from "react";

export default function ClientComponent({ children }: { children: React.ReactNode }) {
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        // Check if the user's system preference is dark mode
        if (typeof window !== 'undefined') {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setIsDarkMode(systemPrefersDark);

            // Listen for changes in system preference
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = (event: MediaQueryListEvent) => {
                setIsDarkMode(event.matches);
            };
            mediaQuery.addEventListener('change', handleChange);

            // Cleanup the listener when the component unmounts
            return () => {
                mediaQuery.removeEventListener('change', handleChange);
            };
        }
    }, []);

    return (
        <div className={isDarkMode ? 'dark' : ''}>
            {children}
        </div>
    );
}
