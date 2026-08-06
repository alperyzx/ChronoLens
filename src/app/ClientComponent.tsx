'use client';

import {useEffect} from "react";
import { Toaster } from "@/components/ui/toaster";

export default function ClientComponent({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = (isDark: boolean) => {
            document.documentElement.classList.toggle('dark', isDark);
        };

        const handleChange = (event: MediaQueryListEvent) => applyTheme(event.matches);
        applyTheme(mediaQuery.matches);
        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return (
        <>
            {children}
            <Toaster />
        </>
    );
}
