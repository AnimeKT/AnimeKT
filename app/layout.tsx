import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Navbar from '@/components/layout/Navbar';
import { TelegramProvider } from '@/context/TelegramContext';
import { AnimeDataProvider } from '@/context/AnimeDataContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnimeKT',
  description: 'Descubre y disfruta de tu próximo anime favorito.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body>
        <TelegramProvider>
          <AnimeDataProvider>
            <Navbar />
            {children}
          </AnimeDataProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
