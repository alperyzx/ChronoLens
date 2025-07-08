import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';
import ClientComponent from './ClientComponent';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ChronoLens - Historical Events Discovery',
  description: 'Discover significant historical events across different subjects. Explore daily and weekly historical moments in Sociology, Technology, Philosophy, Science, Politics, and Art.',
  keywords: ['history', 'historical events', 'education', 'timeline', 'today in history'],
  authors: [{ name: 'ChronoLens Team' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  openGraph: {
    title: 'ChronoLens - Historical Events Discovery',
    description: 'Discover significant historical events across different subjects',
    type: 'website',
    locale: 'en_US',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClientComponent>{children}</ClientComponent>
      </body>
    </html>
  );
}


