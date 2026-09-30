import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { ServiceWorkerRegistration } from '@/shared/shell/ServiceWorkerRegistration';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Volunteer operations',
  description: 'Shifts, capture, safety and reports for the volunteers who run an event.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Ops' },
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
