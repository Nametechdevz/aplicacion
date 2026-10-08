import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { cookies } from 'next/headers';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'PROMPTFORGE AI', template: '%s · PROMPTFORGE AI' },
  description: 'Genera prompts maestros, detallados y optimizados para que Claude Code construya proyectos web y sistemas completos.',
  applicationName: 'PROMPTFORGE AI',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

// Aplica el tema antes del primer pintado para evitar parpadeos.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )pf_theme=([^;]+)/);var t=m?decodeURIComponent(m[1]):'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('pf_theme')?.value;
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}${theme === 'dark' ? ' dark' : ''}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
