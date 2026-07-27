// ==========================================
// LÓGICA DEL REPRODUCTOR PERSONALIZADO
// ==========================================
function iniciarReproductor() {
    // Capturamos los elementos de la UI
    const video = document.getElementById("main-video-player");
    const videoWrapper = document.getElementById("custom-video-wrapper");
    const customControls = document.getElementById("custom-controls");
    const btnPlay = document.getElementById("btn-play");
    const playIcon = document.getElementById("play-icon");
    const progressSlider = document.getElementById("progress-slider");
    const progressWrapper = document.getElementById("progress-wrapper");
    const timeTooltip = document.getElementById("time-tooltip");
    const timeCurrent = document.getElementById("time-current");
    const timeDuration = document.getElementById("time-duration");
    const btnMute = document.getElementById("btn-mute");
    const volumeSlider = document.getElementById("volume-slider");
    const btnFullscreen = document.getElementById("btn-fullscreen");

    // ==========================================
    // CREACIÓN Y LÓGICA DEL SPINNER DE CARGA
    // ==========================================
    
    // 1. Crear el elemento div para el spinner dinámicamente
    const spinner = document.createElement("div");
    spinner.id = "loading-spinner";
    
    // 2. Inyectarlo dentro del contenedor del video[cite: 6]
    if (videoWrapper) {
        videoWrapper.appendChild(spinner);
    }

    // 3. Mostrar el spinner cuando el video está cargando/esperando datos
    video.addEventListener("waiting", () => {
        spinner.classList.add("active");
    });

    // 4. Ocultar el spinner cuando el video vuelve a reproducirse
    video.addEventListener("playing", () => {
        spinner.classList.remove("active");
    });

    // Ocultarlo también cuando haya cargado suficiente para reproducir
    video.addEventListener("canplay", () => {
        spinner.classList.remove("active");
    });
    
    // Formatear segundos a minutos (Ej: 03:10)
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // ==========================================
    // 1. PLAY / PAUSA
    // ==========================================
    function togglePlay() {
        if (video.paused) {
            video.play();
            playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        } else {
            video.pause();
            playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        }
    }

    btnPlay.addEventListener("click", togglePlay);
    video.addEventListener("click", togglePlay);

    // ==========================================
    // 2. BARRA DE PROGRESO (Slider superior)
    // ==========================================
    let isDraggingProgress = false;

    // Actualizar barra mientras se reproduce
    video.addEventListener("timeupdate", () => {
        if (!isDraggingProgress && video.duration) {
            const percent = (video.currentTime / video.duration) * 100;
            progressSlider.value = percent;
            progressSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`;
        }
        timeCurrent.textContent = formatTime(video.currentTime);
    });

    // Mostrar tiempo total al cargar
    video.addEventListener("loadedmetadata", () => {
        timeDuration.textContent = formatTime(video.duration);
    });

    // Control al arrastrar la bolita
    progressSlider.addEventListener("input", (e) => {
        isDraggingProgress = true;
        const percent = e.target.value;
        progressSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`;
        
        if (video.duration) {
            timeCurrent.textContent = formatTime((percent / 100) * video.duration);
        }
    });

    // Al soltar la bolita, saltar en el video
    progressSlider.addEventListener("change", (e) => {
        if (video.duration) {
            const percent = e.target.value;
            video.currentTime = (percent / 100) * video.duration;
        }
        isDraggingProgress = false;
    });

    // ==========================================
    // 3. TOOLTIP DE TIEMPO (Flotante)
    // ==========================================
    progressWrapper.addEventListener("mousemove", (e) => {
        if (!video.duration) return;

        const sliderRect = progressSlider.getBoundingClientRect();
        let pos = (e.clientX - sliderRect.left) / sliderRect.width;
        pos = Math.max(0, Math.min(1, pos)); 

        const hoverTime = pos * video.duration;
        timeTooltip.textContent = formatTime(hoverTime);

        const wrapperRect = progressWrapper.getBoundingClientRect();
        const mouseX = e.clientX - wrapperRect.left;
        timeTooltip.style.left = `${mouseX}px`; 
    });

    // ==========================================
    // 4. CONTROL DE VOLUMEN
    // ==========================================
    volumeSlider.addEventListener("input", (e) => {
        const valor = e.target.value;
        video.volume = valor;
        video.muted = valor === "0";
        volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${valor * 100}%, rgba(255, 255, 255, 0.3) ${valor * 100}%)`;
    });

    btnMute.addEventListener("click", () => {
        video.muted = !video.muted;
        const nuevoValor = video.muted ? 0 : video.volume;
        volumeSlider.value = nuevoValor;
        volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${nuevoValor * 100}%, rgba(255, 255, 255, 0.3) ${nuevoValor * 100}%)`;
    });

    // Pintar volumen al inicio
    volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${volumeSlider.value * 100}%, rgba(255, 255, 255, 0.3) ${volumeSlider.value * 100}%)`;

    // ==========================================
    // 5. PANTALLA COMPLETA
    // ==========================================
    
    // 1. Creamos una función reutilizable para la pantalla completa
    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            videoWrapper.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    }

    // 2. Se la asignamos al botón de la esquina
    btnFullscreen.addEventListener("click", toggleFullScreen);

    // 3. Se la asignamos al doble clic sobre el video
    video.addEventListener("dblclick", toggleFullScreen);

    // ==========================================
    // 6. VELOCIDAD DE REPRODUCCIÓN
    // ==========================================
    const btnSpeed = document.getElementById("btn-speed");
    const speedMenu = document.getElementById("speed-menu");
    const speedOptions = document.querySelectorAll(".speed-option");

    btnSpeed.addEventListener("click", (e) => {
        e.stopPropagation();
        speedMenu.classList.toggle("active");
    });

    speedOptions.forEach(option => {
        option.addEventListener("click", () => {
            const speed = parseFloat(option.getAttribute("data-speed"));
            video.playbackRate = speed;
            btnSpeed.textContent = speed === 1 ? "1x" : speed + "x";
            speedMenu.classList.remove("active");
        });
    });

    // ==========================================
    // 6.5 IDIOMAS Y SUBTÍTULOS
    // ==========================================
    const btnLanguage = document.getElementById("btn-language");
    const languageMenu = document.getElementById("language-menu");
    const languageOptions = document.querySelectorAll(".language-option");

    // Abrir/Cerrar menú de idiomas
    btnLanguage.addEventListener("click", (e) => {
        e.stopPropagation();
        languageMenu.classList.toggle("active");
        speedMenu.classList.remove("active"); // Cierra el de velocidad si estaba abierto
    });

    // REEMPLAZA EL DOCUMENT.CLICK ANTERIOR POR ESTE:
    // Oculta cualquier menú si haces clic fuera de ellos
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".speed-container")) {
            speedMenu.classList.remove("active");
        }
        if (!e.target.closest(".language-container")) {
            languageMenu.classList.remove("active");
        }
    });

    // Acción al seleccionar un idioma
    languageOptions.forEach(option => {
        option.addEventListener("click", () => {
            // 1. Quitar la clase "active" (color morado) de todas las opciones
            languageOptions.forEach(opt => opt.classList.remove("active"));
            
            // 2. Poner la clase "active" solo a la opción clickeada
            option.classList.add("active");
            
            // 3. Obtener qué idioma se seleccionó
            const lang = option.getAttribute("data-lang");
            console.log("Idioma seleccionado:", lang);
            
            // 🔥 AQUÍ ESTÁ LA MAGIA: Volvemos a activar la alerta global que Ver_4.js escucha
            document.dispatchEvent(new CustomEvent("cambioIdioma", { detail: { lang: lang } }));
            
            // 4. Cerrar el menú
            languageMenu.classList.remove("active");
        });
    });

    // Acción al seleccionar un idioma
    languageOptions.forEach(option => {
        option.addEventListener("click", () => {
            // 1. Quitar la clase "active" (color morado) de todas las opciones
            languageOptions.forEach(opt => opt.classList.remove("active"));
            
            // 2. Poner la clase "active" solo a la opción clickeada
            option.classList.add("active");
            
            // 3. Obtener qué idioma se seleccionó
            const lang = option.getAttribute("data-lang");
            console.log("Idioma seleccionado:", lang);
            
            // 🔥 AQUÍ ESTÁ LA MAGIA: Volvemos a activar la alerta global que Ver_4.js escucha
            document.dispatchEvent(new CustomEvent("cambioIdioma", { detail: { lang: lang } }));
            
            // 4. Cerrar el menú
            languageMenu.classList.remove("active");
        });
    });

    // 👇 AQUÍ PEGAS EL CÓDIGO NUEVO (COMPLETO) 👇
    document.addEventListener("syncIdioma", (e) => {
        const langGuardado = e.detail.lang; 
        
        languageOptions.forEach(opt => {
            opt.classList.remove("active");
            if (opt.getAttribute("data-lang") === langGuardado) {
                opt.classList.add("active");
            }
        });
    });

    // ==========================================
    // 7. ATAJOS DE TECLADO
    // ==========================================
    document.addEventListener("keydown", (e) => {
        if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
        
        // Solo actuar si el video está visible
        if (videoWrapper.offsetWidth === 0) return;

        if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
        }

        const saltarSegundos = 5;

        switch (e.key) {
            case "ArrowRight":
                video.currentTime = Math.min(video.duration || 0, video.currentTime + saltarSegundos);
                break;
            case "ArrowLeft":
                video.currentTime = Math.max(0, video.currentTime - saltarSegundos);
                break;
            case " ":
                togglePlay();
                break;
            case "ArrowUp":
                video.volume = Math.min(1, video.volume + 0.1);
                video.muted = video.volume === 0;
                actualizarBarraVolumen(video.volume);
                break;
            case "ArrowDown":
                video.volume = Math.max(0, video.volume - 0.1);
                video.muted = video.volume === 0;
                actualizarBarraVolumen(video.volume);
                break;
            case "f":
            case "F":
                if (!document.fullscreenElement) {
                    videoWrapper.requestFullscreen().catch(err => console.error(err));
                } else {
                    document.exitFullscreen();
                }
                break;
        }
    });

    function actualizarBarraVolumen(valor) {
        volumeSlider.value = valor;
        volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${valor * 100}%, rgba(255, 255, 255, 0.3) ${valor * 100}%)`;
    }

    // ==========================================
    // 8. CONTROLES MÓVILES (Doble Tap)
    // ==========================================
    const esDispositivoMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (esDispositivoMovil) {
        const contenedorVolumen = document.querySelector(".volume-container");
        if (contenedorVolumen) contenedorVolumen.style.display = "none";

        let tiempoUltimoToque = 0;
        
        // Evitamos que los controles desaparezcan en móviles sin hacer tap
        customControls.classList.add('active'); 

        videoWrapper.addEventListener('touchstart', (e) => {
            const esControl = e.target.closest('button, input, a') || 
                              e.target.id.includes('slider') || 
                              e.target.id.includes('btn') || 
                              e.target.id.includes('progress');
            if (esControl) return; 

            const tiempoActual = new Date().getTime();
            const diferenciaTiempo = tiempoActual - tiempoUltimoToque;

            if (diferenciaTiempo < 300 && diferenciaTiempo > 0) {
                e.preventDefault(); 
                const toqueX = e.changedTouches[0].clientX;
                const anchoPantalla = window.innerWidth;
                const tercio = anchoPantalla / 3;

                if (toqueX < tercio) {
                    video.currentTime = Math.max(0, video.currentTime - 10);
                } else if (toqueX > tercio * 2) {
                    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                } else {
                    if (!document.fullscreenElement) {
                        videoWrapper.requestFullscreen().catch(err => console.error(err));
                    } else {
                        document.exitFullscreen();
                    }
                }
            }
            tiempoUltimoToque = tiempoActual;
        }, { passive: false });
        
        // Mostrar/Ocultar controles en móvil al hacer un solo tap (opcional, útil para móviles)
        videoWrapper.addEventListener('click', (e) => {
            const esControl = e.target.closest('button, input, a, .custom-controls');
            if (!esControl) {
                if (customControls.style.opacity === '0') {
                    customControls.style.opacity = '1';
                } else {
                    customControls.style.opacity = '0';
                }
            }
        });
    } else {
        // En PC, que los controles desaparezcan si el mouse se queda quieto
        let timeout;
        
        videoWrapper.addEventListener('mousemove', () => {
            customControls.style.opacity = '1';
            // 🔥 CAMBIO 1: Aplicamos el cursor normal SOLO al reproductor, no al body entero
            videoWrapper.style.cursor = 'default'; 
            clearTimeout(timeout);
            
            timeout = setTimeout(() => {
                if (!video.paused) {
                    customControls.style.opacity = '0';
                    // 🔥 CAMBIO 2: Ocultamos el cursor SOLO dentro del reproductor
                    videoWrapper.style.cursor = 'none'; 
                }
            }, 3000);
        });
        
        videoWrapper.addEventListener('mouseleave', () => {
            // 🔥 CAMBIO 3: Cancelamos la cuenta regresiva si el mouse sale del reproductor
            clearTimeout(timeout); 
            // 🔥 CAMBIO 4: Nos aseguramos de que el mouse sea visible siempre que salga
            videoWrapper.style.cursor = 'default'; 
            
            if (!video.paused) {
                customControls.style.opacity = '0';
            }
        });
    }
} // Aquí cierra la función iniciarReproductor()

// Esta validación asegura que el código corra siempre, sin importar qué tan rápido cargue Vercel
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarReproductor);
} else {
    iniciarReproductor();
}