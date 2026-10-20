'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegram } from '@/context/TelegramContext';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import type { TelegramAnimeMessage } from '@/hooks/anime';

export type NavbarSearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  message?: TelegramAnimeMessage;
};

type NavbarProps = {
  searchItems?: NavbarSearchItem[];
  userName?: string;
};

const navigation = [
  { href: '/home', label: 'Inicio' },
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/favoritos', label: 'Mi lista' },
];

function SearchResultLink({ item, onClick }: { item: NavbarSearchItem; onClick: () => void }) {
  const { imageUrl: telegramImageUrl } = useTelegramImage(item.message);
  const imageSrc = telegramImageUrl ?? item.imageUrl;

  return (
    <Link
      href={`/anime/${encodeURIComponent(item.id)}`}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          width={56}
          height={80}
          unoptimized
          className="h-16 w-12 shrink-0 rounded-md object-cover shadow-sm md:h-20 md:w-14"
        />
      ) : (
        <span aria-hidden="true" className="h-16 w-12 shrink-0 rounded-md bg-surface shadow-sm md:h-20 md:w-14" />
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-semibold leading-tight text-white">{item.title}</span>
        {item.subtitle && (
          <span className="block truncate text-xs text-gray-400">{item.subtitle}</span>
        )}
      </span>
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Navbar({ searchItems = [], userName = 'Usuario' }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { animes } = useSharedAnimeData();
  const { profilePhotoUrl } = useTelegram();

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 12);
    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollState);
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setSearchOpen(false);
        setProfileOpen(false);
        setMobileOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setProfileOpen(false);
        setMobileOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    if (normalizedQuery.length < 2) return [];
    const animeResults: NavbarSearchItem[] = animes
      .filter((anime) => anime.searchableText.includes(normalizedQuery))
      .slice(0, 4)
      .map((anime) => ({
        id: anime.id,
        title: anime.title,
        subtitle: anime.type,
        message: anime.message,
      }));
    if (animeResults.length > 0 || animes.length > 0) return animeResults;
    return searchItems
      .filter((item) => item.title.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 4);
  }, [animes, query, searchItems]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const searchTerm = query.trim();
    if (!searchTerm) return;
    router.push(`/catalogo?search=${encodeURIComponent(searchTerm)}`);
    setSearchOpen(false);
    setMobileOpen(false);
  };

  const closeMenus = () => {
    setSearchOpen(false);
    setProfileOpen(false);
    setMobileOpen(false);
  };

  if (pathname === '/') return null;

  return (
    <>
      <style jsx>{`
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-dropdown {
          animation: slideDownFade 0.2s ease-out forwards;
          transform-origin: top center;
        }
      `}</style>
    <header
      ref={rootRef}
      className={`fixed top-0 z-50 w-full border-b border-white/5 bg-[#0d0e14]/90 backdrop-blur-sm ${
        scrolled ? 'shadow-lg shadow-black/10' : ''
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-gradient-xy bg-gradient-to-r from-purple-900/30 via-transparent to-indigo-900/30 opacity-20 motion-reduce:animate-none"
      />
      <div className="relative z-10 mx-auto flex h-16 max-w-7xl items-center gap-5 px-5 sm:px-8">
        <Link
          href="/home"
          onClick={closeMenus}
          className="shrink-0 text-xl font-black tracking-tight text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          aria-label="AnimeKT, ir al inicio"
        >
          ANIME<span className="text-primary-light">KT</span>
        </Link>

        <nav aria-label="Navegación principal" className="hidden items-center gap-6 md:flex">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`text-sm font-medium transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light ${
                  active ? 'text-white' : 'text-gray-300'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <form
              role="search"
              onSubmit={submitSearch}
              className={`flex h-10 items-center rounded-full border transition-all duration-200 ${
                searchOpen
                  ? 'w-[min(16rem,52vw)] border-white/20 bg-black/55 pl-3'
                  : 'w-10 justify-center border-transparent bg-white/5'
              }`}
            >
              {searchOpen && (
                <input
                  autoFocus
                  aria-label="Buscar anime"
                  aria-controls="navbar-search-results"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Buscar anime..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-400"
                />
              )}
              <button
                type={searchOpen ? 'submit' : 'button'}
                aria-label={searchOpen ? 'Buscar' : 'Abrir búsqueda'}
                aria-expanded={searchOpen}
                onClick={() => {
                  if (!searchOpen) setSearchOpen(true);
                }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
              >
                <SearchIcon />
              </button>
            </form>

            {searchOpen && query.trim().length >= 2 && (
              <div
                id="navbar-search-results"
                className="animate-dropdown absolute right-0 top-12 z-50 w-[min(21rem,90vw)] overflow-hidden rounded-2xl border border-white/10 bg-[#171820] p-2 shadow-2xl shadow-black/50"
              >
                {filteredItems.length > 0 ? (
                  <>
                    <ul aria-label="Resultados de búsqueda" className="space-y-1">
                      {filteredItems.map((item) => (
                        <li key={item.id}>
                          <SearchResultLink item={item} onClick={closeMenus} />
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 border-t border-gray-700/50 p-2">
                      <Link
                        href={`/catalogo?search=${encodeURIComponent(query.trim())}`}
                        onClick={closeMenus}
                        className="block w-full rounded-md py-2 text-center text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                      >
                        Ver más resultados
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="px-3 py-4 text-sm text-gray-400">
                    No hay coincidencias en las sugerencias. Presiona Enter para buscar en el catálogo.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              aria-label={`Abrir menú de perfil de ${userName}`}
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((open) => !open);
                setSearchOpen(false);
              }}
              className="flex h-10 items-center gap-2 rounded-full p-1 pr-2 text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              {profilePhotoUrl ? (
                <Image
                  src={profilePhotoUrl}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/25 font-bold text-primary-light">
                  {userName.trim().charAt(0).toLocaleUpperCase() || 'U'}
                </span>
              )}
              <span className="hidden max-w-24 truncate sm:block">{userName}</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="hidden h-4 w-4 sm:block">
                <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
              </svg>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-50 w-48 rounded-xl border border-white/10 bg-[#171820] p-2 shadow-2xl shadow-black/50">
                <p className="truncate px-3 py-2 text-xs text-gray-400">{userName}</p>
                <Link
                  href="/favoritos"
                  onClick={closeMenus}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                >
                  Mi lista
                </Link>
                <Link
                  href="/"
                  onClick={closeMenus}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                >
                  Cambiar cuenta
                </Link>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label={mobileOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light md:hidden"
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
        </div>

        {mobileOpen && (
          <nav aria-label="Navegación móvil" className="relative z-10 border-t border-white/10 bg-background/95 px-5 py-3 backdrop-blur-xl md:hidden">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                onClick={closeMenus}
                className="block rounded-lg px-3 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
    </header>
    <div aria-hidden="true" className="h-16" />
    </>
  );
}
