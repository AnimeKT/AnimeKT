'use client';

const comments = [
  {
    name: 'Mika Sato',
    time: 'Hace 2 horas',
    text: 'La animación de este episodio estuvo increíble. Ya quiero ver cómo continúa la historia.',
    initials: 'MS',
    color: 'from-fuchsia-500 to-violet-700',
  },
  {
    name: 'Ren K.',
    time: 'Hace 5 horas',
    text: 'La banda sonora y el ritmo de la serie combinan perfecto. De mis favoritos de la temporada.',
    initials: 'RK',
    color: 'from-cyan-500 to-blue-700',
  },
  {
    name: 'Yuki Tanaka',
    time: 'Ayer',
    text: 'Vine por la historia y me quedé por sus personajes. ¡Recomendadísimo!',
    initials: 'YT',
    color: 'from-amber-500 to-rose-700',
  },
];

function FormatIcon({ kind }: { kind: 'bold' | 'italic' | 'link' | 'emoji' }) {
  if (kind === 'bold') return <span className="font-black">B</span>;
  if (kind === 'italic') return <span className="font-serif italic">I</span>;
  if (kind === 'link') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M8 12 12 8m-6.5 6.5-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m3-3 1-1a3.5 3.5 0 1 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" transform="translate(2 2)" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return <span aria-hidden="true">☺</span>;
}

export default function CommentSection() {
  return (
    <section aria-labelledby="comments-heading" className="mt-12">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">Comunidad</p>
          <h2 id="comments-heading" className="mt-1 text-2xl font-bold text-white">Comentarios</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-sm text-gray-400">{comments.length}</span>
      </div>

      <form onSubmit={(event) => event.preventDefault()} className="rounded-2xl border border-white/10 bg-[#1a1c23] p-4 sm:p-5">
        <label htmlFor="comment-input" className="sr-only">Escribe algo...</label>
        <textarea
          id="comment-input"
          rows={3}
          placeholder="Escribe algo..."
          className="w-full resize-y bg-transparent text-sm leading-6 text-white outline-none placeholder:text-gray-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="flex items-center gap-1 text-gray-400">
            {(['bold', 'italic', 'link', 'emoji'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-label={`Formato ${kind}`}
                className="grid h-8 w-8 place-items-center rounded-md text-sm hover:bg-white/10 hover:text-white"
              >
                <FormatIcon kind={kind} />
              </button>
            ))}
          </div>
          <button
            type="submit"
            className="min-h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          >
            Responder
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-5">
        {comments.map((comment) => (
          <article key={comment.name} className="flex gap-3 sm:gap-4">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br ${comment.color} text-xs font-bold text-white shadow-lg`}>
              {comment.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-sm font-semibold text-white">{comment.name}</h3>
                <time className="text-xs text-gray-500">{comment.time}</time>
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-300">{comment.text}</p>
              <div className="mt-2 flex items-center gap-4">
                <button type="button" className="text-xs font-medium text-gray-400 transition-colors hover:text-primary-light">♡ Me gusta</button>
                <button type="button" className="text-xs font-medium text-gray-400 transition-colors hover:text-white">Responder</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
