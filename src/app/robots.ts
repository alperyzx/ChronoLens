import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chronolens.alperyz.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/content-admin', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}