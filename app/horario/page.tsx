'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import type { AnimeData } from '@/hooks/anime';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const weekdayNames = ['Domingo', ...days.slice(0, 6)];

function normalizeDay(day: string) {
  return day.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

function ScheduleCard({ anime }: { anime: AnimeData }) {
  const { imageUrl } = useTelegramImage(anime.message, anime.messageId);
  const airingTime = anime.time?.trim();
  const hasAiringTime = Boolean(airingTime && airingTime.toLocaleLowerCase() !== 'tba');

  return (
    <article className="min-w-0">
      <Link href={`/anime/${encodeURIComponent(anime.id)}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#1a1a2e]">
          {/* Keep a local fallback while the Telegram cover is loading or unavailable. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl ?? '/anime-placeholder.svg'}
            alt={`${anime.title} poster`}
            className="h-full w-full object-cover"
          />
          {hasAiringTime && (
            <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
              {airingTime}
            </span>
          )}
          <span className="absolute bottom-2 left-2 rounded bg-indigo-600/90 px-2 py-1 text-xs text-white">
            {anime.type || 'TV'}
          </span>
        </div>
        <h2 className="mt-2 truncate text-sm font-semibold text-white" title={anime.title}>
          {anime.title}
        </h2>
      </Link>
    </article>
  );
}

export default function HorarioPage() {
  const { animes, isLoading, error } = useSharedAnimeData();
  const [selectedDay, setSelectedDay] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    setSelectedDay(weekdayNames[new Date().getDay()]);
  }, []);

  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentTime(new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }));
    };

    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 10_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const filteredAnimes = animes.filter((anime) => {
    const matchDay = normalizeDay(anime.day).includes(normalizeDay(selectedDay));
    const isAiring = normalizeDay(anime.status).includes('emisi');
    return matchDay && isAiring;
  });

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-10 sm:px-8">
      <h1 className="text-2xl font-bold text-white">Horario</h1>

      <div className="mt-4 rounded-md border border-yellow-700/50 bg-yellow-900/20 p-3 text-sm text-gray-300">
        <span className="font-bold text-yellow-500">Aviso:</span>{' '}
        Los horarios que se muestran aquí son referenciales y pueden variar.
      </div>

      <div className="my-6 flex flex-col items-center justify-between gap-4 lg:flex-row">
        <div className="flex flex-wrap justify-center gap-2" aria-label="Seleccionar día">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={selectedDay === day}
              onClick={() => setSelectedDay(day)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                selectedDay === day
                  ? 'bg-teal-400 font-semibold text-black'
                  : 'bg-[#2a2a3e] text-gray-300 hover:bg-[#3a3a4e]'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
        <p className="shrink-0 text-sm text-gray-400" aria-live="polite">
          Hora local: {currentTime || '--:--'}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          No se pudo cargar el catálogo de Telegram: {error}
        </p>
      )}

      {isLoading || !selectedDay ? (
        <div aria-label="Cargando horario" aria-busy="true" className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} aria-hidden="true" className="animate-pulse">
              <div className="aspect-[3/4] rounded-lg bg-white/10" />
              <div className="mt-2 h-4 w-3/4 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : filteredAnimes.length > 0 ? (
        <section aria-label={`Animes del día ${selectedDay}`} className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {filteredAnimes.map((anime) => <ScheduleCard key={anime.id} anime={anime} />)}
        </section>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-gray-400">
          No hay animes programados para este día.
        </p>
      )}
    </main>
  );
}
