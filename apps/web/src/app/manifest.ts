import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Weevil - Bug Recorder',
    short_name: 'Weevil',
    description:
      'Record debuggable bug reports with screen recordings, console logs, network requests, runtime errors, and user actions on one timeline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#c64a1f',
    categories: ['developer-tools', 'productivity'],
    icons: [
      {
        src: '/icons/weevil-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/weevil-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
