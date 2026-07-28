import './reproductor.js';
import { Buffer } from "buffer";
import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// ==========================================
// 0. REGISTRO INICIAL DEL SERVICE WORKER 
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then((registration) => console.log('✅ Service Worker registrado con éxito'))
        .catch((error) => console.error('❌ Error al registrar el Service Worker:', error));
}

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let videoSeleccionado = null; 
let catalogoParaBuscador = []; 
let animeIdGlobal = null;          // Para saber qué anime estamos viendo
let progresoGuardado = null;       // Para cargar el tiempo y episodio guardado
let currentTopicIdGlobal = null;
let datosAnimeGlobal = null;   // Para saber en qué temporada estamos
let currentSeasonIndexGlobal = 0;      // Saber qué temporada (índice) estamos viendo
let currentEpisodeIndexGlobal = 0;     // Saber qué episodio (índice) estamos viendo
let currentIdiomaGlobal = "sub";       // Idioma actual
let tiempoRestaurarGlobal = 0;         // El segundo exacto del video al cambiar
let cambiandoIdiomaEnCaliente = false; // Interruptor mágico

// ==========================================
// 1. VERIFICACIÓN DE SESIÓN Y CLIENTE
// ==========================================
const savedSession = localStorage.getItem("telegram_session");
if (!savedSession) window.location.href = "/";

const apiId = localStorage.getItem("user_api_id");
const apiHash = localStorage.getItem("user_api_hash");
const stringSession = new StringSession(savedSession);

let client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
    connectionRetries: 5,
    deviceModel: "AnimeKaergsty Web", 
    systemVersion: "1.0.0",
    appVersion: "1.0.0",
    useWSS: true, 
});

// ==========================================
// 2. LÓGICA DEL NAVBAR Y MENÚ DE PERFIL
// ==========================================
const btnLogoutNav = document.getElementById("btn-logout-nav");

if(btnLogoutNav) {
    btnLogoutNav.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Borras la sesión de Telegram
        localStorage.removeItem("telegram_session");
        
        // 👇 CORRECCIÓN: Ahora sí coinciden con los nombres de arriba
        localStorage.removeItem("user_api_id"); 
        localStorage.removeItem("user_api_hash"); 
        
        window.location.href = "/";
    });
}

const profileMenu = document.getElementById("profile-menu");
const dropdownContent = document.getElementById("dropdown-content");

if (profileMenu && dropdownContent) {
    profileMenu.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        dropdownContent.classList.toggle("show");
    });
    dropdownContent.addEventListener("click", (e) => e.stopPropagation());
}
document.addEventListener("click", () => {
    if (dropdownContent) dropdownContent.classList.remove("show");
});

async function cargarPerfilUsuario() {
    try {
        const profilePhotoBuffer = await client.downloadProfilePhoto("me", { isBig: false });
        if (profilePhotoBuffer && profilePhotoBuffer.length > 0) {
            const blob = new Blob([profilePhotoBuffer], { type: 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);
            const profileIconDiv = document.getElementById("profile-icon");
            if (profileIconDiv) {
                profileIconDiv.innerHTML = `<img src="${imageUrl}" alt="Mi Perfil" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            }
        }
    } catch (error) {
        console.error("⚠️ Error obteniendo la foto de perfil:", error);
    }
}

// ==========================================
// 3. MINI BUSCADOR INTELIGENTE
// ==========================================
const navSearchInput = document.getElementById('navSearchInput');
const navSearchResults = document.getElementById('navSearchResults');
const miniResultsList = document.getElementById('miniResultsList');
const seeMoreBtn = document.getElementById('seeMoreBtn');
const navSearchContainer = document.getElementById('navSearchContainer');

if (navSearchInput) {
    let debounceTimer;
    navSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        clearTimeout(debounceTimer);
        if (query.length < 2) {
            if (navSearchResults) navSearchResults.classList.add('hidden');
            return;
        }
        debounceTimer = setTimeout(() => { ejecutarMiniBusqueda(query); }, 400);
    });

    navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = navSearchInput.value.trim();
            if (query) window.location.href = `/buscador.html?q=${encodeURIComponent(query)}`;
        }
    });

    navSearchInput.addEventListener('focus', () => {
        if (navSearchInput.value.trim().length >= 2 && navSearchResults) {
            navSearchResults.classList.remove('hidden');
        }
    });
}

document.addEventListener('click', (e) => {
    if (navSearchContainer && !navSearchContainer.contains(e.target)) {
        if (navSearchResults) navSearchResults.classList.add('hidden');
    }
});

async function ejecutarMiniBusqueda(query) {
    if (!miniResultsList || !navSearchResults) return;
    const resultados = catalogoParaBuscador.filter(item => {
        const texto = (item.datos.textoBuscable || `${item.datos.titulo} ${item.datos.meta}`).toLowerCase();
        return texto.includes(query);
    }).slice(0, 4);
    renderizarMiniResultados(resultados, query);
}

function renderizarMiniResultados(resultados, query) {
    if (!miniResultsList || !navSearchResults || !seeMoreBtn) return;
    miniResultsList.innerHTML = '';

    if (resultados.length === 0) {
        miniResultsList.innerHTML = '<p style="color:#7b88a1; text-align:center; margin:10px 0;">No se encontraron animes</p>';
        seeMoreBtn.style.display = 'none';
    } else {
        resultados.forEach(anime => {
            const a = document.createElement('a');
            a.className = 'mini-result-item';
            a.href = `/Datos.html?id=${anime.mensaje.id}`; 
            const cachedImage = localStorage.getItem(`catalog_img_${anime.mensaje.id}`) || '';
            const imgTag = cachedImage
                ? `<img src="${cachedImage}" alt="${anime.datos.titulo}" class="mini-result-img">`
                : `<div class="mini-result-img" style="background:#2c2d3e"></div>`;
            a.innerHTML = `
                ${imgTag}
                <div class="mini-result-info">
                    <h4 class="mini-result-title">${anime.datos.titulo}</h4>
                    <p class="mini-result-type">${anime.datos.tipo || 'TV'}</p>
                </div>
            `;
            miniResultsList.appendChild(a);
        });
        seeMoreBtn.style.display = 'block';
        seeMoreBtn.onclick = () => { window.location.href = `/buscador.html?q=${encodeURIComponent(navSearchInput.value.trim())}`; };
    }
    navSearchResults.classList.remove('hidden');
}

// ==========================================
// 4. EXTRACCIÓN DE DATOS 
// ==========================================
function extraerDatosAnime(texto) {
    if (!texto) return {
        titulo: "Título Desconocido", titulosAlternativos: "", meta: "", sinopsis: "", estado: "", tipo: "TV", año: "", textoBuscable: "", topicsSub: [], topicsDub: []
    };

    const tituloMatch = texto.match(/Título:\s*(.+)/i);
    const titulo = tituloMatch ? tituloMatch[1].split('|')[0].trim() : "Título Desconocido";

    const audioMatch = texto.match(/Audio:\s*(.+)/i);
    const audio = audioMatch ? audioMatch[1].trim() : "Subtitulado";
    const generosMatch = texto.match(/Géneros:\s*(.+)/i);
    const generos = generosMatch ? generosMatch[1].trim() : "Desconocido";
    const añoMatch = texto.match(/A[ñn]o\s*:\s*(\d{4})/i) || texto.match(/\b(19\d{2}|20\d{2})\b/);
    const año = añoMatch ? (añoMatch[1] || añoMatch[0]).trim() : "";
    
    // 🔥 LÓGICA DE EXTRACCIÓN SEPARADA PARA SUB Y DUB 🔥
    let topicsSub = [];
    let topicsDub = [];
    
    // Extrae: 📁Topic : 2 | 19
    const topicSubMatch = texto.match(/(?:📁|\b)\s*Topic\s*[:=]?\s*([\d\s\|]+)/i);
    if (topicSubMatch) {
        topicsSub = topicSubMatch[1].split('|').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
    }
    
    // Extrae: 📁Topic2 : 34 | 40
    const topicDubMatch = texto.match(/(?:📁|\b)\s*Topic2\s*[:=]?\s*([\d\s\|]+)/i);
    if (topicDubMatch) {
        topicsDub = topicDubMatch[1].split('|').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
    }

    const meta = `• ${audio} • ${generos} • ${año}`;
    const textoBuscable = [titulo, meta, año].join(' ').toLowerCase();

    return { titulo, meta, textoBuscable, topicsSub, topicsDub };
}

// ==========================================
// 5. INICIALIZAR LA PÁGINA VER 
// ==========================================
async function iniciarPaginaVer() {
    const urlParams = new URLSearchParams(window.location.search);
    const animeId = urlParams.get('id');

    if (!animeId) {
        alert("No se seleccionó ningún anime.");
        window.location.href = "/buscador.html";
        return;
    }

    animeIdGlobal = animeId;
    
    // 👇 CARGAMOS LA MEMORIA: ¿Vio este anime antes? 👇
    const datosGuardados = localStorage.getItem(`progreso_anime_${animeIdGlobal}`);
    if (datosGuardados) {
        progresoGuardado = JSON.parse(datosGuardados);
        console.log("💾 Progreso encontrado:", progresoGuardado);
    }

    const titleContainer = document.getElementById("video-title");
    const metaContainer = document.getElementById("video-meta");
    const seasonSelect = document.getElementById("season-select");
    
    if (titleContainer) titleContainer.innerHTML = `<div class="skeleton-text skeleton-anim" style="height: 35px; width: 60%; border-radius: 4px;"></div>`;
    if (metaContainer) metaContainer.innerHTML = `<div class="skeleton-text skeleton-anim" style="height: 16px; width: 40%; border-radius: 4px; margin-top: 8px;"></div>`;

    try {
        await client.connect();
        cargarPerfilUsuario();

        // ==========================================
        // 🔥 LLENAR EL CATÁLOGO PARA EL MINI BUSCADOR 🔥
        // ==========================================
        try {
            const mensajesBuscador = await client.getMessages("AnimeKT1", { replyTo: 16, limit: 100 });
            let animesAgrupadosBuscador = {};
            
            mensajesBuscador.forEach(msg => {
                let isImage = false;
                if (msg.media && (msg.media.className === 'MessageMediaPhoto' || msg.photo)) isImage = true;
                else if (msg.media && msg.media.className === 'MessageMediaDocument' && msg.media.document) {
                    if ((msg.media.document.mimeType || '').startsWith('image/')) isImage = true;
                }

                if (isImage) {
                    const idGrupo = msg.groupedId ? msg.groupedId.toString() : msg.id.toString();
                    if (!animesAgrupadosBuscador[idGrupo]) animesAgrupadosBuscador[idGrupo] = [];
                    animesAgrupadosBuscador[idGrupo].push(msg);
                }
            });

            Object.values(animesAgrupadosBuscador).forEach(album => {
                album.sort((a, b) => a.id - b.id);
                let textoCompleto = "";
                album.forEach(m => { if (m.message) textoCompleto += m.message + "\n"; });
                
                const datosExtraidos = extraerDatosAnime(textoCompleto.trim());
                const fotoVertical = album[1] || album[0];

                catalogoParaBuscador.push({
                    mensaje: fotoVertical,
                    datos: datosExtraidos
                });
            });
        } catch (err) {
            console.error("No se pudo cargar el catálogo del mini buscador:", err);
        }
        // ==========================================

        const mensajesCatalogo = await client.getMessages("AnimeKT1", { ids: [parseInt(animeId)] });
        if (!mensajesCatalogo || mensajesCatalogo.length === 0 || !mensajesCatalogo[0]) {
            if (titleContainer) titleContainer.textContent = "Anime no encontrado";
            return;
        }

        let msgAnime = mensajesCatalogo[0];
        let textoAnime = msgAnime.message || "";

        // Lectura de Álbumes
        if (!textoAnime.toLowerCase().includes("título:")) {
            if (msgAnime.groupedId) {
                const history = await client.getMessages("AnimeKT1", { limit: 10, offsetId: msgAnime.id + 5 });
                const mensajeConInfo = history.find(m => m.groupedId?.toString() === msgAnime.groupedId?.toString() && m.message?.toLowerCase().includes("título:"));
                if (mensajeConInfo) { msgAnime = mensajeConInfo; textoAnime = msgAnime.message; }
            }
            if (!textoAnime.toLowerCase().includes("título:") && msgAnime.replyTo) {
                const topId = msgAnime.replyTo.replyToTopId || msgAnime.replyTo.replyToMsgId;
                const topicHistory = await client.getMessages("AnimeKT1", { replyTo: topId, limit: 10 });
                const mensajeConInfo = topicHistory.find(m => m.message?.toLowerCase().includes("título:"));
                if (mensajeConInfo) { msgAnime = mensajeConInfo; textoAnime = msgAnime.message; }
            }
        }

        const datosAnime = extraerDatosAnime(textoAnime);
        datosAnimeGlobal = datosAnime; // Guardamos globalmente

        if (datosAnime.topicsSub.length === 0 && datosAnime.topicsDub.length === 0) {
            if (titleContainer) titleContainer.textContent = "Sin episodios disponibles"; 
            if (metaContainer) metaContainer.textContent = datosAnime.titulo;
            document.getElementById("episodes-grid").innerHTML = "<p style='color:#a1a1aa;'>Este anime no tiene videos asignados.</p>";
            if (seasonSelect) seasonSelect.style.display = "none";
            return;
        }

        // Lógica de apertura del selector de temporadas (Se agrega una sola vez)
        if (seasonSelect && !seasonSelect.dataset.listener) {
            seasonSelect.addEventListener("change", (e) => {
                // 👇 AGREGA ESTA LÍNEA 👇
                currentSeasonIndexGlobal = e.target.selectedIndex; 
                
                cargarListaVideos("AnimeKT2", parseInt(e.target.value));
                Array.from(seasonSelect.options).forEach(opt => {
                    if (opt.selected && opt.dataset.name) opt.textContent = opt.dataset.name;
                });
                seasonSelect.blur();
            });

            const mostrarTodo = () => {
                Array.from(seasonSelect.options).forEach(opt => {
                    if (opt.dataset.name && opt.dataset.count) opt.textContent = `${opt.dataset.name} (${opt.dataset.count} Episodios)`;
                });
            };
            seasonSelect.addEventListener("mousedown", mostrarTodo);
            seasonSelect.addEventListener("touchstart", mostrarTodo);
            seasonSelect.addEventListener("blur", () => {
                Array.from(seasonSelect.options).forEach(opt => {
                    if (opt.selected && opt.dataset.name) opt.textContent = opt.dataset.name;
                });
            });
            seasonSelect.dataset.listener = "true";
        }

        // Detectar si el usuario dejó el anime a medias viendo un cap en DUB
        let idiomaInicial = "sub";
        if (progresoGuardado && progresoGuardado.topicId && datosAnime.topicsDub.includes(progresoGuardado.topicId)) {
            idiomaInicial = "dub";
        } else if (datosAnime.topicsSub.length === 0 && datosAnime.topicsDub.length > 0) {
            idiomaInicial = "dub"; // Si solo existe en Dub
        }

        // Sincronizar el botón visual de reproductor.js
        document.dispatchEvent(new CustomEvent("syncIdioma", { detail: { lang: idiomaInicial } }));
        
        // 🔥 FIX: Actualizamos la variable global para no buguear el botón en el futuro 🔥
        currentIdiomaGlobal = idiomaInicial; 
        
        // Llamar a nuestra nueva función
        llenarTemporadas(idiomaInicial);

    } catch (error) {
        console.error("❌ Error iniciando la página Ver:", error);
        if (titleContainer) titleContainer.textContent = "Error al cargar el reproductor";
    }
}


// ==========================================
// 9. CARGAR DATOS EN EL SELECTOR DE TEMPORADAS (CANTIDAD Y NOMBRE)
// ==========================================
async function cargarDatosTemporadaOption(nombreGrupo, topicId, optionElement, index, totalTopics) {
    try {
        let nombreTema = await obtenerNombreTopic(nombreGrupo, topicId);
        if (!nombreTema || nombreTema === "Temporada") {
            nombreTema = totalTopics === 1 ? "Temporada Única" : `Temporada ${index + 1}`;
        }

        const mensajes = await client.getMessages(nombreGrupo, {
            replyTo: parseInt(topicId),
            limit: 1000 
        });

        const videos = mensajes.filter(msg => {
            if (msg.video) return true;
            if (msg.document && msg.document.mimeType && msg.document.mimeType.startsWith('video/')) return true;
            return false;
        });

        const totalVideos = videos.length;
        
        // Guardamos los datos de forma oculta en la memoria del elemento HTML
        optionElement.dataset.name = nombreTema;
        optionElement.dataset.count = totalVideos;

        // Aplicamos la regla inicial: Si esta es la temporada activa, NO mostramos la cantidad
        if (optionElement.selected) {
            optionElement.textContent = nombreTema;
        } else {
            optionElement.textContent = `${nombreTema} (${totalVideos} Episodios)`;
        }

    } catch (error) {
        console.error("Error cargando info de la temporada:", error);
        optionElement.textContent = totalTopics === 1 ? "Episodios Disponibles" : `Temporada ${index + 1}`;
    }
}


// ==========================================
// 6. CARGAR GRILLA Y AUTOPLAY DESDE MEMORIA
// ==========================================
async function cargarListaVideos(nombreGrupo, topicId) {
    currentTopicIdGlobal = topicId;
    
    const episodesGrid = document.getElementById("episodes-grid");
    const titleContainer = document.getElementById("video-title");
    const metaContainer = document.getElementById("video-meta");

    episodesGrid.innerHTML = Array(8).fill('<div class="skeleton-thumbnail skeleton-anim"></div>').join('');
    if (titleContainer) titleContainer.innerHTML = `<div class="skeleton-text skeleton-anim" style="height: 35px; width: 60%; border-radius: 4px;"></div>`;

    try {
        // 👇 AQUÍ SE OBTIENE EL NOMBRE ACTUALIZADO DEL TEMA EN TELEGRAM 👇
        const nombreTemporada = await obtenerNombreTopic(nombreGrupo, topicId);
        if (metaContainer) metaContainer.textContent = nombreTemporada;

        const mensajes = await client.getMessages(nombreGrupo, {
            replyTo: parseInt(topicId),
            limit: 100
        });

        const videos = mensajes.filter(msg => {
            if (msg.video) return true;
            if (msg.document && msg.document.mimeType && msg.document.mimeType.startsWith('video/')) return true;
            return false;
        });

        if (videos.length === 0) {
            episodesGrid.innerHTML = "<p style='color:#a1a1aa;'>No se encontraron capítulos en esta temporada.</p>";
            if (titleContainer) titleContainer.textContent = "Temporada vacía";
            return;
        }

        videos.reverse();
        episodesGrid.innerHTML = "";

        let videoAReproducir = videos[0];
        let botonAReproducir = null;
        let textoAReproducir = "Episodio 1";
        let tiempoInicio = 0;

        // 🧠 MAGIA 2: Si viene del botón de cambiar idioma, usamos su memoria
        if (cambiandoIdiomaEnCaliente) {
            // Verificamos que el episodio exista (por si el Dub va atrasado)
            if (currentEpisodeIndexGlobal >= videos.length) {
                currentEpisodeIndexGlobal = videos.length - 1; 
            }
            videoAReproducir = videos[currentEpisodeIndexGlobal];
            tiempoInicio = tiempoRestaurarGlobal; // Le inyectamos el minuto guardado!
        } else {
            currentEpisodeIndexGlobal = 0; 
        }

        // 🔥 NUEVO: Contador independiente para los episodios normales
        let contadorEpisodios = 1;

        videos.forEach((vid, index) => {
            let textoMensaje = "";

            // Si el video tiene texto en Telegram (ej: "Episodio 4.5", "OVA", etc.)
            if (vid.message && vid.message.trim() !== "") {
                textoMensaje = vid.message.trim();
            } else {
                // Si no tiene texto, usa el contador actual y luego suma 1
                textoMensaje = `Episodio ${contadorEpisodios}`;
                contadorEpisodios++; 
            }

            const btnEpisodio = document.createElement("button");
            btnEpisodio.className = "episode-card";
            btnEpisodio.innerHTML = `
                <div class="episode-thumbnail-wrapper">
                    <img class="episode-thumbnail-img" id="thumb-${vid.id}">
                    <div class="episode-badge">${textoMensaje}</div>
                </div>
            `;
            
            // Cuando hace clic manual, guardamos qué episodio eligió
            btnEpisodio.onclick = () => {
                currentEpisodeIndexGlobal = index; 
                reproducirVideo(vid, btnEpisodio, textoMensaje, 0); 
            };
            episodesGrid.appendChild(btnEpisodio);
            cargarMiniatura(vid, `thumb-${vid.id}`);

            // 🧠 MAGIA 3: Asignar el botón correcto en el modo Crunchyroll
            if (cambiandoIdiomaEnCaliente && index === currentEpisodeIndexGlobal) {
                botonAReproducir = btnEpisodio;
                textoAReproducir = textoMensaje;
            }
            
            // Carga normal (cuando recién abre la página)
            if (!cambiandoIdiomaEnCaliente && progresoGuardado && progresoGuardado.videoId === vid.id) {
                videoAReproducir = vid;
                botonAReproducir = btnEpisodio;
                textoAReproducir = textoMensaje;
                tiempoInicio = progresoGuardado.tiempo;
                currentEpisodeIndexGlobal = index; 
            }
        });

        if (videos.length > 0) {
            if (!botonAReproducir) {
                botonAReproducir = episodesGrid.firstChild;
                textoAReproducir = videos[0].message ? videos[0].message.trim() : "Episodio 1";
            }
            
            reproducirVideo(videoAReproducir, botonAReproducir, textoAReproducir, tiempoInicio);
            
            progresoGuardado = null; 
            cambiandoIdiomaEnCaliente = false; // Apagamos el interruptor
        }

    } catch (error) {
        console.error("Error cargando episodios:", error);
        episodesGrid.innerHTML = "<p style='color:#ff5555;'>Error al cargar los episodios.</p>";
    }
}

async function cargarMiniatura(mensajeVideo, imgId) {
    const imgElement = document.getElementById(imgId);
    if (!imgElement) return;

    // Verificar si ya está guardada en la caché local
    const cachedThumb = localStorage.getItem(`thumb_${mensajeVideo.id}`);
    if (cachedThumb) {
        imgElement.src = cachedThumb;
        imgElement.style.display = "block";
        return;
    }

    try {
        // Detectar los thumbnails disponibles y seleccionar el de mayor resolución (el último del arreglo)
        const doc = mensajeVideo.media?.document || mensajeVideo.document || mensajeVideo.video;
        const thumbs = doc?.thumbs || [];
        const mejorCalidadIndex = thumbs.length > 0 ? thumbs.length - 1 : 0;

        // Descargamos la miniatura de mayor calidad
        const buffer = await client.downloadMedia(mensajeVideo, { thumb: mejorCalidadIndex });
        if (buffer) {
            const blob = new Blob([buffer], { type: 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);
            
            imgElement.src = imageUrl;
            imgElement.style.display = "block";
            
            const reader = new FileReader();
            reader.onloadend = () => {
                try { localStorage.setItem(`thumb_${mensajeVideo.id}`, reader.result); } catch (e) {}
            };
            reader.readAsDataURL(blob);
        }
    } catch (error) {
        console.error("Error descargando miniatura:", error);
    }
}


// ==========================================
// FUNCIÓN AUXILIAR: OBTENER EL NOMBRE ACTUAL DEL TOPIC EN TIEMPO REAL
// ==========================================
async function obtenerNombreTopic(nombreGrupo, topicId) {
    try {
        const channelEntity = await client.getInputEntity(nombreGrupo);
        const forumTopics = await client.invoke(new Api.channels.GetForumTopics({
            channel: channelEntity,
            offsetDate: 0,
            offsetId: 0,
            offsetTopicId: 0,
            limit: 100
        }));
        
        const foundTopic = forumTopics.topics.find(t => t.id === parseInt(topicId));
        if (foundTopic && foundTopic.title) {
            return foundTopic.title;
        }
    } catch (e) {}

    try {
        const topicMsg = await client.getMessages(nombreGrupo, { ids: [parseInt(topicId)] });
        if (topicMsg && topicMsg.length > 0 && topicMsg[0].action && topicMsg[0].action.title) {
            return topicMsg[0].action.title;
        }
    } catch (e) {}

    return "Temporada";
}

// ==========================================
// 7. MOTOR DE STREAMING (SERVICE WORKER LISTENER)
// ==========================================
navigator.serviceWorker.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'REQUEST_CHUNK') {
        const range = event.data.headers.range || "bytes=0-";
        const port = event.ports[0];
        
        if (!videoSeleccionado) {
            return port.postMessage({ error: "No hay video seleccionado" });
        }

        let start = 0;
        let end = videoSeleccionado.size - 1;
        const parts = range.replace(/bytes=/, "").split("-");
        
        if (parts[0]) start = parseInt(parts[0], 10);
        if (parts[1]) end = parseInt(parts[1], 10); 
        
        const CHUNK_SIZE = 1048576; // 1 MB
        end = Math.min(end, start + CHUNK_SIZE - 1, videoSeleccionado.size - 1);
        
        try {
            const ubicacionArchivo = new Api.InputDocumentFileLocation({
                id: videoSeleccionado.id,
                accessHash: videoSeleccionado.accessHash,
                fileReference: videoSeleccionado.fileReference,
                thumbSize: "" 
            });

            // 👇 VOLVEMOS AL MÉTODO SEGURO (iterDownload) 👇
            const chunks = [];
            for await (const chunk of client.iterDownload({
                file: ubicacionArchivo,
                offset: bigInt(start), 
                requestSize: 1048576, // Le pedimos a Telegram de 1MB en 1MB
            })) {
                chunks.push(chunk);
                const currentSize = chunks.reduce((acc, val) => acc + val.length, 0);
                if (currentSize >= (end - start + 1)) break; 
            }
            
            let finalBuffer = Buffer.concat(chunks);
            finalBuffer = finalBuffer.slice(0, end - start + 1); 
            const realEnd = start + finalBuffer.length - 1; 
            const pureArray = new Uint8Array(finalBuffer);
            
            port.postMessage({
                chunk: pureArray, 
                rangeStart: start,
                rangeEnd: realEnd, 
                size: videoSeleccionado.size.toString()
            });
            
        } catch (error) {
            console.error("Error en streaming:", error); // Añadimos esto para ver si hay errores futuros en la consola
            port.postMessage({ error: error.message });
        }
    }
});

// ==========================================
// 8. REPRODUCTOR Y AUTO-GUARDADO DE PROGRESO
// ==========================================
async function reproducirVideo(mensajeVideo, botonElemento, tituloVideo, tiempoInicio = 0) {
    if (botonElemento) {
        document.querySelectorAll('.episodes-grid .episode-card').forEach(b => b.classList.remove('active-episode'));
        botonElemento.classList.add('active-episode');
    }

    const titleContainer = document.getElementById("video-title");
    if (titleContainer && tituloVideo) titleContainer.textContent = tituloVideo;

    const videoPlayer = document.getElementById("main-video-player");
    videoPlayer.poster = ""; 
    
    videoSeleccionado = mensajeVideo.media && mensajeVideo.media.document 
                        ? mensajeVideo.media.document 
                        : mensajeVideo.document;

    if (!videoSeleccionado) {
        videoPlayer.poster = "https://via.placeholder.com/1920x1080/14151a/ff5555?text=Error:+Archivo+no+soportado";
        return;
    }

    videoPlayer.src = `/stream/${videoSeleccionado.id.toString()}`;
    
    // 👇 1. SALTAMOS AL MINUTO EXACTO CUANDO EL VIDEO CARGA 👇
    videoPlayer.onloadedmetadata = () => {
        if (tiempoInicio > 0) {
            videoPlayer.currentTime = tiempoInicio;
        }
    };

    // 👇 2. GUARDAMOS EL PROGRESO SILENCIOSAMENTE CADA 5 SEGUNDOS 👇
    let ultimoGuardado = 0;
    videoPlayer.ontimeupdate = () => {
        const ahora = Math.floor(videoPlayer.currentTime);
        
        // Guardamos solo si avanzó 5 segundos y no está al final del video
        if (ahora > ultimoGuardado + 5 && ahora < videoPlayer.duration - 10) {
            ultimoGuardado = ahora;
            const progreso = {
                topicId: currentTopicIdGlobal,
                videoId: mensajeVideo.id,
                tiempo: videoPlayer.currentTime
            };
            localStorage.setItem(`progreso_anime_${animeIdGlobal}`, JSON.stringify(progreso));
        }
    };

    // 🔥 NUEVO: FORZAR AUTOPLAY 🔥
    videoPlayer.play().then(() => {
        // Si el navegador permite el autoplay, cambiamos visualmente el botón a "Pausa"
        const playIcon = document.getElementById("play-icon");
        if (playIcon) {
            playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        }
    }).catch(() => {
        console.log("El navegador bloqueó el Autoplay automático.");
    });


    // No forzamos auto-play para no ser bloqueados, pero el usuario ya tiene su minuto cargado.
}

// ==========================================
// NUEVO: CONTROLADOR DE IDIOMAS Y TEMPORADAS
// ==========================================
function llenarTemporadas(idioma) {
    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect || !datosAnimeGlobal) return;
    
    const arregloTopics = idioma === "dub" ? datosAnimeGlobal.topicsDub : datosAnimeGlobal.topicsSub;
    seasonSelect.innerHTML = "";
    
    if (arregloTopics.length === 0) {
        document.getElementById("episodes-grid").innerHTML = "<p style='color:#a1a1aa;'>No hay episodios disponibles en este idioma.</p>";
        return;
    }

    arregloTopics.forEach((topicId, index) => {
        const option = document.createElement("option");
        option.value = topicId;
        option.textContent = arregloTopics.length === 1 ? "Temporada Única" : `Temporada ${index + 1} (Cargando...)`;
        seasonSelect.appendChild(option);
        cargarDatosTemporadaOption("AnimeKT2", topicId, option, index, arregloTopics.length);
    });

    // 🧠 MAGIA 1: Mantener la misma temporada
    if (currentSeasonIndexGlobal >= arregloTopics.length) {
        currentSeasonIndexGlobal = 0; // Por si el Dub tiene menos temporadas que el Sub
    }
    
    let initialTopic = arregloTopics[currentSeasonIndexGlobal];
    seasonSelect.selectedIndex = currentSeasonIndexGlobal; // Lo actualizamos visualmente
    
    // Si recién entra a la página (no en caliente)
    if (!cambiandoIdiomaEnCaliente && progresoGuardado && progresoGuardado.topicId && arregloTopics.includes(progresoGuardado.topicId)) {
        initialTopic = progresoGuardado.topicId;
        seasonSelect.value = initialTopic;
        currentSeasonIndexGlobal = seasonSelect.selectedIndex;
    }
    
    cargarListaVideos("AnimeKT2", initialTopic);
}

// Escuchamos la señal del botón "Sub / Dub" desde reproductor.js
document.addEventListener("cambioIdioma", (e) => {
    const nuevoIdioma = e.detail.lang;
    if (nuevoIdioma === currentIdiomaGlobal) return; // Si toca el mismo, no hace nada
    
    // 1. Congelamos el tiempo exacto del reproductor
    const vp = document.getElementById("main-video-player");
    if (vp) tiempoRestaurarGlobal = vp.currentTime; 
    
    // 2. Activamos el modo Crunchyroll
    cambiandoIdiomaEnCaliente = true;
    currentIdiomaGlobal = nuevoIdioma;
    
    // 3. Ejecutamos el cambio de carpeta
    llenarTemporadas(nuevoIdioma);
});

// Iniciar la página
iniciarPaginaVer();

// ==========================================
// NUEVO: CONTROLES DE SIGUIENTE / ANTERIOR CAPÍTULO
// ==========================================
document.addEventListener("siguienteCapitulo", () => {
    // Busca todas las tarjetas de episodios en pantalla
    const cards = document.querySelectorAll('.episodes-grid .episode-card');
    
    // Si hay un capítulo después del actual, hazle clic virtualmente
    if (currentEpisodeIndexGlobal + 1 < cards.length) {
        cards[currentEpisodeIndexGlobal + 1].click();
    } else {
        console.log("No hay más capítulos hacia adelante");
    }
});

document.addEventListener("anteriorCapitulo", () => {
    const cards = document.querySelectorAll('.episodes-grid .episode-card');
    
    // Si no estamos en el primer capítulo, retrocede uno
    if (currentEpisodeIndexGlobal > 0) {
        cards[currentEpisodeIndexGlobal - 1].click();
    } else {
        console.log("Estás en el primer capítulo");
    }
});