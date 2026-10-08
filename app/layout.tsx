import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegistration } from '@/features/offline/ServiceWorkerRegistration';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'WarungKasir', template: '%s — WarungKasir' },
  description: 'Sistem kasir internal untuk warung makan.',
  applicationName: 'WarungKasir',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the bottom navigation extend under the Android gesture bar and use safe-area insets.
  viewportFit: 'cover',
  themeColor: '#ea580c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
