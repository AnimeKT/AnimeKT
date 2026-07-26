import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// ==========================================
// 1. VERIFICACIÓN DE SESIÓN
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
// 2. NAVBAR Y PERFIL
// ==========================================
const btnLogoutNav = document.getElementById("btn-logout-nav");
if(btnLogoutNav) {
    btnLogoutNav.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("telegram_session");
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

const navSearchInput = document.getElementById('navSearchInput');
if (navSearchInput) {
    navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = navSearchInput.value.trim();
            if (query) window.location.href = `/buscador.html?q=${encodeURIComponent(query)}`;
        }
    });
}

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
// FUNCIÓN MAESTRA UNIVERSAL DE EXTRACCIÓN
// ==========================================
function extraerDatosAnime(texto) {
    if (!texto) return {
        titulo: "Título Desconocido", titulosAlternativos: "", meta: "• Subtitulado • Género desconocido",
        sinopsis: "No hay sinopsis disponible.", estado: "Desconocido", tipo: "TV", año: "", 
        dia: "", audio: "Subtitulado", estudio: "Desconocido", autor: "", generosTexto: "Desconocido",
        textoBuscable: "", topicsArray: [] 
    };

    const extraerRegex = (regex) => {
        const match = texto.match(regex);
        return match ? match[1].trim() : "";
    };

    const tituloMatch = texto.match(/Título:\s*(.+)/i);
    const tituloBruto = tituloMatch ? tituloMatch[1].trim() : "Título Desconocido";
    const partesTitulo = tituloBruto.split('|').map(t => t.trim());
    const titulo = partesTitulo[0];
    const titulosAlternativos = partesTitulo.length > 1 ? partesTitulo.slice(1).join(' - ') : "";

    const audio = extraerRegex(/Audio:\s*(.+)/i) || "Subtitulado";
    const estado = extraerRegex(/Estado:\s*(.+)/i) || "Desconocido";
    const estudio = extraerRegex(/Estudio:\s*(.+)/i) || "Desconocido";
    const autor = extraerRegex(/Autor:\s*(.+)/i) || "Desconocido";
    const dia = extraerRegex(/D[íi]a:\s*(.+)/i) || "";
    const tipo = extraerRegex(/Tipo:\s*(.+)/i) || "TV";
    
    const generosTexto = extraerRegex(/G[ée]neros:\s*(.+)/i) || "Desconocido";
    const generos = generosTexto !== "Desconocido" ? generosTexto.split(",").map(g => g.trim()).filter(Boolean) : [];

    const añoMatch = texto.match(/A[ñn]o\s*:\s*(\d{4})/i) || texto.match(/\b(19\d{2}|20\d{2})\b/);
    const año = añoMatch ? (añoMatch[1] || añoMatch[0]).trim() : "";
    
    let topicsArray = [];
    const topicLineMatch = texto.match(/(?:📁|\b)\s*(?:Topic|Topics|Carpeta|ID)\s*[:=]?\s*([\d\s\|]+)/i);
    if (topicLineMatch) {
        topicsArray = topicLineMatch[1].split('|').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
    } else {
        const numbersMatch = texto.match(/(\d+(?:\s*\|\s*\d+)+)/);
        if (numbersMatch) {
            topicsArray = numbersMatch[1].split('|').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
        }
    }
    
    const meta = `• ${audio} • ${generosTexto} • ${año}`;
    const sinopsis = extraerRegex(/Sinopsis:\s*([\s\S]+)/i) || "No hay sinopsis disponible.";

    const textoBuscable = [tituloBruto, titulo, titulosAlternativos, estado, audio, estudio, autor, generosTexto, dia, tipo, año, sinopsis]
        .filter(Boolean).join(" ").toLowerCase();

    return { 
        titulo, titulosAlternativos, meta, sinopsis, estado, tipo, año, 
        dia, audio, estudio, autor, generos, generosTexto, textoBuscable, topicsArray 
    };
}

// ==========================================
// VARIABLES DE CONTROL PARA SCROLL INFINITO
// ==========================================
let listaFavoritosGlobal = [];
let currentIndexToRender = 0;
const itemsPerLoad = 20; // Carga de 20 en 20
let scrollObserver;

async function iniciarFavoritos() {
    try {
        await client.connect();
        cargarPerfilUsuario();

        let favoritosIDs = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
        const emptyState = document.getElementById("empty-state");
        const favoritesCount = document.getElementById("favorites-count");

        if (favoritosIDs.length === 0) {
            if(emptyState) emptyState.style.display = "block";
            if(favoritesCount) favoritesCount.textContent = "0 Guardados";
            return;
        }

        // 👇 AUMENTADO EL LÍMITE A 500 PARA REVISAR HASTA 250 ANIMES
        const mensajes = await client.getMessages("AnimeKT1", { replyTo: 16, limit: 500 });
        let animesAgrupados = {};
        
        mensajes.forEach(msg => {
            let isImage = false;
            if (msg.media && (msg.media.className === 'MessageMediaPhoto' || msg.photo)) isImage = true;
            else if (msg.media && msg.media.className === 'MessageMediaDocument' && msg.media.document) {
                if ((msg.media.document.mimeType || '').startsWith('image/')) isImage = true;
            }

            if (isImage) {
                const idGrupo = msg.groupedId ? msg.groupedId.toString() : msg.id.toString();
                if (!animesAgrupados[idGrupo]) animesAgrupados[idGrupo] = [];
                animesAgrupados[idGrupo].push(msg);
            }
        });

        listaFavoritosGlobal = [];

        Object.values(animesAgrupados).forEach(album => {
            album.sort((a, b) => a.id - b.id);
            const estaGuardado = album.some(m => favoritosIDs.includes(m.id.toString()));
            
            if (estaGuardado) {
                let textoCompleto = "";
                album.forEach(m => { if (m.message) textoCompleto += m.message + "\n"; });
                
                listaFavoritosGlobal.push({
                    mensaje: album[1] || album[0], 
                    datos: extraerDatosAnime(textoCompleto.trim())
                });
            }
        });

        if (favoritesCount) favoritesCount.textContent = `${listaFavoritosGlobal.length} Guardados`;
        
        // Iniciar el renderizado progresivo
        iniciarRenderizadoProgresivo();

    } catch (error) {
        console.error("Error cargando favoritos:", error);
    }
}

// ==========================================
// RENDERIZADO CON SCROLL INFINITO
// ==========================================
function iniciarRenderizadoProgresivo() {
    const grid = document.getElementById("favorites-grid");
    if (!grid) return;

    grid.innerHTML = '';
    currentIndexToRender = 0;

    cargarMasFavoritos();

    // Crear Centinela para detectar el scroll
    let sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '1px';
        grid.parentNode.appendChild(sentinel);
    }

    if (scrollObserver) scrollObserver.disconnect();

    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            if (currentIndexToRender < listaFavoritosGlobal.length) {
                cargarMasFavoritos();
            }
        }
    }, { rootMargin: '400px' });

    scrollObserver.observe(sentinel);
}

function cargarMasFavoritos() {
    const grid = document.getElementById("favorites-grid");
    if (!grid) return;

    const limite = Math.min(currentIndexToRender + itemsPerLoad, listaFavoritosGlobal.length);

    for (let i = currentIndexToRender; i < limite; i++) {
        const item = listaFavoritosGlobal[i];
        const msg = item.mensaje;
        const datos = item.datos;

        const cardHTML = `
            <div class="anime-card" onclick="window.location.href='/Datos.html?id=${msg.id}'" style="cursor: pointer;">
                <div class="card-image-wrapper">
                    <div class="card-image" id="catalog-img-${msg.id}" style="background-color: #2b2b2b;"></div>
                    <span class="anime-type-badge">${datos.tipo}</span>
                    
                    <div class="card-hover-content">
                        <h4 class="hover-title">${datos.titulo}</h4>
                        ${datos.titulosAlternativos ? `<p style="font-size: 0.75rem; color: #9ca3af; margin-top: -5px; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${datos.titulosAlternativos}</p>` : ''}
                        
                        <div class="hover-meta"><span>${datos.meta}</span></div>
                        <p class="hover-description">${datos.sinopsis}</p>
                        
                        <div class="hover-actions">
                            <button class="action-icon" title="Ver" onclick="event.stopPropagation(); window.location.href='/Datos.html?id=${msg.id}'">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </button>
                            <button class="action-icon" title="Quitar de lista" onclick="event.stopPropagation(); quitarFavoritoLocal('${msg.id}');" style="color: #a855f7;">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="card-info">
                    <h3 class="card-title">${datos.titulo}</h3>
                    ${datos.titulosAlternativos ? `<span style="font-size: 0.75rem; color: #9ca3af; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${datos.titulosAlternativos.split(' - ').slice(0, 2).join(' - ')}</span>` : ''}
                    <span class="card-tags">• ${datos.audio}</span>
                </div>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', cardHTML);
        cargarImagenVertical(msg);
    }

    currentIndexToRender = limite;
}

window.quitarFavoritoLocal = function(id) {
    let favoritos = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
    favoritos = favoritos.filter(favId => favId !== id.toString());
    localStorage.setItem("mis_favoritos", JSON.stringify(favoritos));
    
    // Al quitar uno, refrescamos la lista filtrada
    listaFavoritosGlobal = listaFavoritosGlobal.filter(item => item.mensaje.id.toString() !== id.toString());
    
    const favoritesCount = document.getElementById("favorites-count");
    if (favoritesCount) favoritesCount.textContent = `${listaFavoritosGlobal.length} Guardados`;

    if (listaFavoritosGlobal.length === 0) {
        const emptyState = document.getElementById("empty-state");
        if (emptyState) emptyState.style.display = "block";
    }

    iniciarRenderizadoProgresivo();
};

async function cargarImagenVertical(msg) {
    const divImagen = document.getElementById(`catalog-img-${msg.id}`);
    if (!divImagen) return;

    const cachedImage = localStorage.getItem(`catalog_img_${msg.id}`);
    if (cachedImage) {
        divImagen.style.backgroundImage = `url('${cachedImage}')`;
        return;
    }

    try {
        const buffer = await client.downloadMedia(msg);
        if (buffer) {
            const blob = new Blob([buffer], { type: 'image/jpeg' }); 
            const imageURL = URL.createObjectURL(blob);
            const img = new Image();
            img.src = imageURL;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const targetWidth = 300; 
                canvas.width = targetWidth;
                canvas.height = Math.round((img.height * targetWidth) / img.width);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const webpDataUrl = canvas.toDataURL('image/webp', 0.7);
                try { localStorage.setItem(`catalog_img_${msg.id}`, webpDataUrl); } catch (e) {}
                divImagen.style.backgroundImage = `url('${webpDataUrl}')`;
                URL.revokeObjectURL(imageURL);
            };
        }
    } catch (error) {}
}

iniciarFavoritos();