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
    // CAPTURA DE BOTONES CENTRALES (ESTILO YOUTUBE)
    // ==========================================
    const centerControls = document.getElementById("center-controls");
    const btnCenterPlay = document.getElementById("btn-center-play");
    const btnPrevVideo = document.getElementById("btn-prev-video");
    const btnNextVideo = document.getElementById("btn-next-video");
    const iconPlayCenter = btnCenterPlay ? btnCenterPlay.querySelector(".icon-play") : null;
    const iconPauseCenter = btnCenterPlay ? btnCenterPlay.querySelector(".icon-pause") : null;

    // ==========================================
    // CREACIÓN Y LÓGICA DEL SPINNER DE CARGA
    // ==========================================
    const spinner = document.createElement("div");
    spinner.id = "loading-spinner";
    
    if (videoWrapper) {
        videoWrapper.appendChild(spinner);
    }

    video.addEventListener("waiting", () => {
        spinner.classList.add("active");
    });

    video.addEventListener("playing", () => {
        spinner.classList.remove("active");
    });

    video.addEventListener("canplay", () => {
        spinner.classList.remove("active");
    });
    
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
            if (iconPlayCenter && iconPauseCenter) {
                iconPlayCenter.style.display = 'none';
                iconPauseCenter.style.display = 'block';
            }
        } else {
            video.pause();
            playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
            if (iconPlayCenter && iconPauseCenter) {
                iconPlayCenter.style.display = 'block';
                iconPauseCenter.style.display = 'none';
            }
        }
    }

    if (btnCenterPlay) {
        btnCenterPlay.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePlay();
            mostrarControles(); // Asegura que los controles sigan visibles un rato
        });
    }

    btnPlay.addEventListener("click", togglePlay);
    // REMOVIDO: video.addEventListener("click", togglePlay); -> Se maneja en la sección táctil.

    // ==========================================
    // 2. BARRA DE PROGRESO (Slider superior)
    // ==========================================
    let isDraggingProgress = false;

    video.addEventListener("timeupdate", () => {
        if (!isDraggingProgress && video.duration) {
            const percent = (video.currentTime / video.duration) * 100;
            progressSlider.value = percent;
            progressSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`;
        }
        timeCurrent.textContent = formatTime(video.currentTime);
    });

    video.addEventListener("loadedmetadata", () => {
        timeDuration.textContent = formatTime(video.duration);
    });

    progressSlider.addEventListener("input", (e) => {
        isDraggingProgress = true;
        const percent = e.target.value;
        progressSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`;
        if (video.duration) {
            timeCurrent.textContent = formatTime((percent / 100) * video.duration);
        }
    });

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

    volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${volumeSlider.value * 100}%, rgba(255, 255, 255, 0.3) ${volumeSlider.value * 100}%)`;

    // ==========================================
    // 5. PANTALLA COMPLETA
    // ==========================================
    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            videoWrapper.requestFullscreen().then(() => {
                // 🔄 Magia: Intenta girar el celular a horizontal automáticamente
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock("landscape").catch(e => console.log("Rotación automática no soportada en este navegador"));
                }
            }).catch(err => console.error(err));
        } else {
            document.exitFullscreen().then(() => {
                // 🔄 Desbloquea la rotación al salir de pantalla completa
                if (screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                }
            });
        }
    }
    btnFullscreen.addEventListener("click", toggleFullScreen);
    // Doble click para pantalla completa solo en PC
    if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        video.addEventListener("dblclick", toggleFullScreen);
    }

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

    btnLanguage.addEventListener("click", (e) => {
        e.stopPropagation();
        languageMenu.classList.toggle("active");
        speedMenu.classList.remove("active"); 
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".speed-container")) {
            speedMenu.classList.remove("active");
        }
        if (!e.target.closest(".language-container")) {
            languageMenu.classList.remove("active");
        }
    });

    languageOptions.forEach(option => {
        option.addEventListener("click", () => {
            languageOptions.forEach(opt => opt.classList.remove("active"));
            option.classList.add("active");
            
            const lang = option.getAttribute("data-lang");
            console.log("Idioma seleccionado:", lang);
            document.dispatchEvent(new CustomEvent("cambioIdioma", { detail: { lang: lang } }));
            
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

    function ocultarControles() {
        customControls.style.opacity = '0';
        customControls.classList.remove('active');
        if (centerControls) centerControls.classList.remove('active');
        if (!esDispositivoMovil) {
            videoWrapper.style.cursor = 'none';
        }
    }

    function mostrarControles() {
        customControls.style.opacity = '1';
        customControls.classList.add('active');
        if (centerControls) centerControls.classList.add('active');
        videoWrapper.style.cursor = 'default';
        
        clearTimeout(controlesTimeout);
        
        // Desaparece más rápido (1.5s) para diseño limpio en móvil
        if (!video.paused) {
            controlesTimeout = setTimeout(ocultarControles, 1500); 
        }
    }

    video.addEventListener('pause', () => {
        mostrarControles();
        clearTimeout(controlesTimeout); // Mantiene los controles visibles en pausa
    });

    video.addEventListener('play', () => {
        mostrarControles(); 
    });

    if (esDispositivoMovil) {
        const contenedorVolumen = document.querySelector(".volume-container");
        if (contenedorVolumen) contenedorVolumen.style.display = "none";

        let tiempoUltimoToque = 0;

        videoWrapper.addEventListener('click', (e) => {
            const esControl = e.target.closest('button, input, a, .custom-controls, .center-controls-overlay');
            if (esControl) return;

            const tiempoActual = new Date().getTime();
            const diferenciaTiempo = tiempoActual - tiempoUltimoToque;

            // Detectar doble toque
            if (diferenciaTiempo < 300 && diferenciaTiempo > 0) {
                const toqueX = e.clientX || e.changedTouches?.[0]?.clientX;
                const tercio = window.innerWidth / 3;

                if (toqueX < tercio) {
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    mostrarControles();
                } else if (toqueX > tercio * 2) {
                    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                    mostrarControles();
                } else {
                    toggleFullScreen(); // Doble toque central = Pantalla completa
                }
            } else {
                // Toque simple: Solo Muestra/Oculta menús
                setTimeout(() => {
                    const diferencia = new Date().getTime() - tiempoUltimoToque;
                    if (diferencia > 250) { 
                        if (customControls.classList.contains('active')) {
                            ocultarControles();
                        } else {
                            mostrarControles();
                        }
                    }
                }, 250);
            }
            tiempoUltimoToque = tiempoActual;
        });

        video.addEventListener('playing', () => {
             mostrarControles();
        });

    } else {
        videoWrapper.addEventListener('mousemove', mostrarControles);
        
        videoWrapper.addEventListener('mouseleave', () => {
            clearTimeout(controlesTimeout);
            videoWrapper.style.cursor = 'default';
            if (!video.paused) {
                ocultarControles();
            }
        });
        
        // En PC, un click en cualquier parte del video hace play/pause
        video.addEventListener('click', togglePlay);
    }
} // Aquí cierra la función iniciarReproductor()

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarReproductor);
} else {
    iniciarReproductor();
}