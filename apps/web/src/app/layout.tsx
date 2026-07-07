import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { CommandPalette } from '@/components/command-palette';
import { QueryProvider } from '@/components/providers/query-provider';
import { DialogProvider } from '@/components/ui/dialog';
import { AppToaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/features/auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://theweevil.space'),
  applicationName: 'Weevil',
  title: {
    default: 'Weevil — bug recorder for debuggable reports',
    template: '%s · Weevil',
  },
  description:
    'Weevil is a bug recorder for Chrome and web teams. Capture screen recordings, console logs, network requests, runtime errors, and user actions on one scrubbable timeline.',
  keywords: [
    'Weevil',
    'bug recorder',
    'bug report recorder',
    'Chrome bug recorder',
    'screen recording for bug reports',
    'console log recorder',
    'network request recorder',
    'debugging session',
    'developer tools',
    'QA bug reporting',
  ],
  authors: [{ name: 'Weevil' }],
  creator: 'Weevil',
  publisher: 'Weevil',
  category: 'developer tools',
  icons: {
    icon: '/icon.svg',
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title: 'Weevil — bug recorder for debuggable reports',
    description:
      'Capture screen recordings, console logs, network requests, runtime errors, and user actions on one scrubbable timeline.',
    url: '/',
    siteName: 'Weevil',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/marketing/panel-network.png',
        width: 1840,
        height: 1054,
        alt: 'Weevil capture detail view showing network requests synced to a bug recording timeline',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Weevil — bug recorder for debuggable reports',
    description:
      'Capture screen recordings, console logs, network requests, runtime errors, and user actions on one timeline.',
    images: ['/marketing/panel-network.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <QueryProvider>
          <DialogProvider>
            <AuthProvider>
              {children}
              <CommandPalette />
              <AppToaster />
            </AuthProvider>
          </DialogProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
