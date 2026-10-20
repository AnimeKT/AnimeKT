'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AnimeCatalogGrid from '@/components/anime/AnimeCatalogGrid';
import { useSharedAnimeData } from '@/context/AnimeDataContext';

const letters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function CatalogContent() {
  const searchParams = useSearchParams();
  const { animes, isLoading, error } = useSharedAnimeData();
  const [search, setSearch] = useState('');
  const [letter, setLetter] = useState('');
  const [type, setType] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState('default');

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '');
    setGenre(searchParams.get('genero') ?? '');
  }, [searchParams]);

  const types = useMemo(() => [...new Set(animes.map((anime) => anime.type).filter(Boolean))].sort(), [animes]);
  const genres = useMemo(
    () => [...new Set(animes.flatMap((anime) => anime.genres.map((value) => value.trim()).filter(Boolean)))]
      .sort((first, second) => first.localeCompare(second)),
    [animes],
  );
  const years = useMemo(
    () => [...new Set(animes.map((anime) => anime.year).filter(Boolean))].sort((first, second) => Number(second) - Number(first)),
    [animes],
  );
  const statuses = useMemo(() => [...new Set(animes.map((anime) => anime.status).filter(Boolean))].sort(), [animes]);

  const filteredAnimes = useMemo(() => {
    const query = normalize(search.trim());
    const filtered = animes.filter((anime) => {
      if (query && !normalize(anime.searchableText || `${anime.title} ${anime.status} ${anime.genresText} ${anime.type}`).includes(query)) return false;

      if (letter) {
        const initial = normalize(anime.title.charAt(0)).toUpperCase();
        if (letter === '#') {
          if (/[A-Z]/.test(initial)) return false;
        } else if (initial !== letter) return false;
      }

      if (type && !normalize(anime.type).includes(normalize(type))) return false;
      if (genre && !anime.genres.some((value) => normalize(value).includes(normalize(genre)))) return false;
      if (year && anime.year !== year) return false;
      if (status && !normalize(anime.status).includes(normalize(status))) return false;
      return true;
    });

    if (order === 'az') filtered.sort((first, second) => first.title.localeCompare(second.title));
    else if (order === 'za') filtered.sort((first, second) => second.title.localeCompare(first.title));
    else if (order === 'recientes') filtered.sort((first, second) => Number(second.id) - Number(first.id));
    return filtered;
  }, [animes, genre, letter, order, search, status, type, year]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-10 sm:px-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">
        Explora y descubre
      </p>
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Catálogo
      </h1>
      <div className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          aria-label="Buscar en el catálogo"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar anime..."
          className="min-h-11 rounded-lg border border-white/10 bg-[#1f2937] px-3 text-sm text-white outline-none transition focus:border-primary"
        />
        {[
          { label: 'Tipo', value: type, setValue: setType, options: types },
          { label: 'Género', value: genre, setValue: setGenre, options: genres },
          { label: 'Año', value: year, setValue: setYear, options: years },
          { label: 'Estado', value: status, setValue: setStatus, options: statuses },
        ].map(({ label, value, setValue, options }) => (
          <select
            key={label}
            aria-label={`Filtrar por ${label.toLocaleLowerCase()}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-11 rounded-lg border border-white/10 bg-[#1f2937] px-3 text-sm text-gray-200 outline-none transition focus:border-primary"
          >
            <option value="">{label}: Seleccionar</option>
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ))}
        <select
          aria-label="Ordenar resultados"
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          className="min-h-11 rounded-lg border border-white/10 bg-[#1f2937] px-3 text-sm text-gray-200 outline-none transition focus:border-primary"
        >
          <option value="default">Orden: Predeterminado</option>
          <option value="az">Título A–Z</option>
          <option value="za">Título Z–A</option>
          <option value="recientes">Más recientes</option>
        </select>
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5" aria-label="Filtrar por letra">
        {letters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={letter === value}
            onClick={() => setLetter((current) => current === value ? '' : value)}
            className={`grid h-8 min-w-8 place-items-center rounded-md px-2 text-xs font-semibold transition-colors ${
              letter === value ? 'bg-primary text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          No se pudo cargar el catálogo de Telegram: {error}
        </p>
      )}
      {!isLoading && !error && (
        <p className="mb-4 text-sm text-gray-400" aria-live="polite">
          {filteredAnimes.length} {filteredAnimes.length === 1 ? 'resultado' : 'resultados'}
        </p>
      )}
      <AnimeCatalogGrid animes={filteredAnimes} isLoading={isLoading} />
    </main>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-7xl px-5 py-10 text-gray-400 sm:px-8">Cargando catálogo...</main>}>
      <CatalogContent />
    </Suspense>
  );
}
