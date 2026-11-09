import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { lightColors, darkColors } from '@precisari/design-tokens';
import '@precisari/design-tokens/dist/tokens.css';
import './globals.css';
import { Providers } from '@/components/providers';
import { buildDerivedCss, themeInitScript } from '@/lib/theme-css';
import { t } from '@/i18n';

const manrope = Manrope({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: t('landing.metaTitle'),
  description: t('landing.metaDescription'),
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/icon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: '/icon-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: lightColors.bg },
    { media: '(prefers-color-scheme: dark)', color: darkColors.bg },
  ],
};

const derivedCss = buildDerivedCss();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style dangerouslySetInnerHTML={{ __html: derivedCss }} />
      </head>
      <body>
        <a className="skip-link" href="#conteudo">
          {t('common.skipToContent')}
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
