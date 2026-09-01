import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SPOH 2027 Ops',
  description: 'Volunteer operations for the SP School of Computing Open House, 6–9 January 2027.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SPOH Ops' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled. Locking it would fail WCAG and this app is read in a
  // bright hall by people who may need to pinch in.
  maximumScale: 5,
  themeColor: '#0066cc',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ServiceWorkerRegistration />
          {children}
        </Providers>
      </body>
    </html>
  );
}
