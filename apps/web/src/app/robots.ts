import type { MetadataRoute } from 'next';

const SITE_URL = 'https://theweevil.space';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/support', '/privacy'],
        disallow: [
          '/api/',
          '/login',
          '/signup',
          '/accept-invite',
          '/board',
          '/captures',
          '/settings',
          '/platform',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
