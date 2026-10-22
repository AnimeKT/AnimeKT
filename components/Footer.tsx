'use client';

import { useEffect, useState } from 'react';

type ActiveModal = 'terminos' | 'privacidad' | null;

export default function Footer() {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  useEffect(() => {
    if (!activeModal) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveModal(null);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeModal]);

  return (
    <>
      <footer className="border-t border-gray-800 bg-[#121212]/80 px-4 py-6 text-center">
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={() => setActiveModal('terminos')}
            className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          >
            Términos y condiciones
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('privacidad')}
            className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          >
            Política de privacidad
          </button>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          © {new Date().getFullYear()} AnimeKT. Todos los derechos reservados.
        </p>
        <p className="mt-2 text-xs italic text-gray-500">
          Hecho con ❤️ para disfrutar sin límites.
        </p>
      </footer>

      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setActiveModal(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#151720] p-6 text-gray-300 shadow-2xl shadow-black/50 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="legal-modal-title" className="mb-6 text-xl font-bold text-white">
              {activeModal === 'terminos' ? 'Términos y condiciones' : 'Política de privacidad'}
            </h2>
            {activeModal === 'terminos' ? (
              <div className="space-y-5 text-sm leading-relaxed">
                <p>
                  <strong className="text-white">1. Uso del Sitio:</strong> AnimeKT es estrictamente una
                  interfaz visual (frontend). NO alojamos, subimos ni distribuimos archivos de video,
                  imágenes o contenido protegido por derechos de autor en nuestros servidores. Todo el
                  contenido es extraído en tiempo real desde Telegram utilizando la propia cuenta del usuario.
                </p>
                <p>
                  <strong className="text-white">2. Responsabilidad del Usuario:</strong> Al ingresar tus
                  credenciales (API ID/Hash), te conectas a tu propio entorno de Telegram. Tú eres el único
                  responsable del uso que le des a la plataforma y del contenido que decidas visualizar.
                  AnimeKT no actúa como intermediario de contenido ilegal.
                </p>
                <p>
                  <strong className="text-white">3. Propiedad Intelectual:</strong> No reclamamos propiedad
                  sobre ninguna obra audiovisual ni marca. Todo pertenece a sus respectivos creadores. Si hay
                  reclamos de copyright, deben dirigirse a la plataforma de origen (Telegram), ya que nosotros
                  no tenemos control ni base de datos de los archivos.
                </p>
              </div>
            ) : (
              <div className="space-y-5 text-sm leading-relaxed">
                <p>
                  <strong className="text-white">1. Tus Datos y Credenciales:</strong> Somos 100% transparentes.
                  Tu API ID, API Hash y tu sesión de Telegram se guardan ÚNICA Y EXCLUSIVAMENTE en el
                  almacenamiento local de tu navegador (Local Storage). Nosotros no tenemos acceso a tus
                  credenciales, no usamos bases de datos de usuarios y no podemos ver tu información.
                </p>
                <p>
                  <strong className="text-white">2. Uso de la Información:</strong> No rastreamos tus
                  visualizaciones ni vendemos tus datos. Al utilizar servicios de infraestructura como Vercel,
                  es posible que se recolecten datos técnicos básicos (IP, tipo de navegador) estrictamente para
                  el funcionamiento y seguridad de la página, no para comercialización.
                </p>
                <p>
                  <strong className="text-white">3. Aceptación:</strong> Usar AnimeKT significa que entiendes
                  que tu conexión a Telegram es directa desde tu dispositivo.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              Cerrar
            </button>
          </section>
        </div>
      )}
    </>
  );
}
