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
    
    // 2. Inyectarlo dentro del contenedor del video
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
    // REMOVEMOS el click de pausa en el video general para que no interfiera con los gestos táctiles móviles
    // video.addEventListener("click", togglePlay);

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
                toggleFullScreen();
                break;
        }
    });

    function actualizarBarraVolumen(valor) {
        volumeSlider.value = valor;
        volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${valor * 100}%, rgba(255, 255, 255, 0.3) ${valor * 100}%)`;
    }

    // ==========================================
    // 8. CONTROLES TÁCTILES Y OCULTAMIENTO (MÓVIL Y PC)
    // ==========================================
    const esDispositivoMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let controlesTimeout;

    // Función para mostrar controles y reiniciar temporizador
    function mostrarControles() {
        customControls.style.opacity = '1';
        customControls.classList.add('active'); // Opcional, pero asegura consistencia
        videoWrapper.style.cursor = 'default';
        
        clearTimeout(controlesTimeout);
        
        // Solo oculta si el video se está reproduciendo
        if (!video.paused) {
            controlesTimeout = setTimeout(() => {
                customControls.style.opacity = '0';
                customControls.classList.remove('active');
                if (!esDispositivoMovil) {
                    videoWrapper.style.cursor = 'none';
                }
            }, 3000); // Se ocultan después de 3 segundos
        }
    }

    // Mostrar controles cuando el video se pausa
    video.addEventListener('pause', () => {
        mostrarControles();
        clearTimeout(controlesTimeout); // Mantiene los controles visibles si está en pausa
    });

    // Ocultar controles al reanudar la reproducción
    video.addEventListener('play', () => {
        mostrarControles(); // Reinicia el contador de 3 segundos
    });

    if (esDispositivoMovil) {
        // En móviles ocultamos el slider de volumen
        const contenedorVolumen = document.querySelector(".volume-container");
        if (contenedorVolumen) contenedorVolumen.style.display = "none";

        let tiempoUltimoToque = 0;

        // Gestor de toques en el área del video
        videoWrapper.addEventListener('click', (e) => {
            // Evitar interferencia si se tocó un botón o slider
            const esControl = e.target.closest('button, input, a, .custom-controls');
            if (esControl) return;

            const tiempoActual = new Date().getTime();
            const diferenciaTiempo = tiempoActual - tiempoUltimoToque;

            // Detectar doble toque (menos de 300ms entre toques)
            if (diferenciaTiempo < 300 && diferenciaTiempo > 0) {
                // Es un doble toque
                const toqueX = e.clientX || e.changedTouches?.[0]?.clientX;
                const anchoPantalla = window.innerWidth;
                const tercio = anchoPantalla / 3;

                if (toqueX < tercio) {
                    // Doble toque izquierda: Retroceder 10s
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    mostrarControles();
                } else if (toqueX > tercio * 2) {
                    // Doble toque derecha: Adelantar 10s
                    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                    mostrarControles();
                } else {
                    // Doble toque centro: Fullscreen (Opcional, lo cambiamos a nada si prefieres)
                    toggleFullScreen();
                }
            } else {
                // Es un toque simple
                // Retrasamos un poco la acción del toque simple para dar tiempo a ver si es un doble toque
                setTimeout(() => {
                    const diferencia = new Date().getTime() - tiempoUltimoToque;
                    if (diferencia > 250) { // Si no hubo segundo toque
                        const toqueX = e.clientX || e.changedTouches?.[0]?.clientX;
                        const anchoPantalla = window.innerWidth;
                        const tercio = anchoPantalla / 3;

                        // Si el toque fue en el medio, pausar/reproducir
                        if (toqueX >= tercio && toqueX <= tercio * 2) {
                             togglePlay();
                        } else {
                            // Si fue a los lados, solo mostrar/ocultar controles
                            if (customControls.style.opacity === '1' || customControls.classList.contains('active')) {
                                customControls.style.opacity = '0';
                                customControls.classList.remove('active');
                            } else {
                                mostrarControles();
                            }
                        }
                    }
                }, 250);
            }
            tiempoUltimoToque = tiempoActual;
        });

        // Aseguramos que inicie ocultándose si reproduce
        video.addEventListener('playing', () => {
             mostrarControles();
        });

    } else {
        // Lógica PC original mejorada con la misma función de timeout
        videoWrapper.addEventListener('mousemove', mostrarControles);
        
        videoWrapper.addEventListener('mouseleave', () => {
            clearTimeout(controlesTimeout);
            videoWrapper.style.cursor = 'default';
            if (!video.paused) {
                customControls.style.opacity = '0';
                customControls.classList.remove('active');
            }
        });
        
        // En PC, un click en el video hace play/pause
        video.addEventListener('click', togglePlay);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarReproductor);
} else {
    iniciarReproductor();
}