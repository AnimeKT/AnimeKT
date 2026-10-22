'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTelegram } from '@/context/TelegramContext';

export default function AuthGuard({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading } = useTelegram();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = pathname === '/';

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicRoute) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  if (isPublicRoute) return children;

  if (isLoading) {
    return (
      <main
        role="status"
        aria-live="polite"
        className="grid min-h-[60vh] place-items-center text-sm text-gray-400"
      >
        Verificando sesión...
      </main>
    );
  }

  if (!isAuthenticated) return null;

  return children;
}
