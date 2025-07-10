import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';
import ClientComponent from './ClientComponent';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap', // Improve font loading performance
  preload: true,
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap', // Improve font loading performance
  preload: false, // Only preload if actively used
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
      <head>
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-50JBD996K0"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-50JBD996K0');
          `,
        }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClientComponent>{children}</ClientComponent>
      </body>
    </html>
  );
}


