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
  title: {
    default: 'Weevil — bug reports that answer their own questions',
    template: '%s · Weevil',
  },
  description:
    'Weevil records the screen, console, network, and every action on one scrubbable timeline — so bug reports come with the evidence, not a follow-up question.',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'Weevil — bug reports that answer their own questions',
    description:
      'Weevil records the screen, console, network, and every action on one scrubbable timeline — so bug reports come with the evidence, not a follow-up question.',
    url: 'https://theweevil.space',
    siteName: 'Weevil',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Weevil — bug reports that answer their own questions',
    description:
      'Weevil records the screen, console, network, and every action on one scrubbable timeline.',
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
