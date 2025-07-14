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
        {/* Google Tag Manager */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-MSZZLH8P');
          `,
        }} />
        {/* End Google Tag Manager */}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MSZZLH8P"
                  height="0" width="0" style={{display:'none',visibility:'hidden'}}></iframe>
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <ClientComponent>{children}</ClientComponent>
      </body>
    </html>
  );
}


