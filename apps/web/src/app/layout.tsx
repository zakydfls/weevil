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
  title: 'Weevil',
  description: 'Bug recording dashboard',
  icons: {
    icon: '/icon.svg',
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
