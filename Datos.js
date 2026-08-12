import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import localforage from "localforage";

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
// 2. LÓGICA DE LA BARRA DE NAVEGACIÓN Y MINI BUSCADOR
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
const navSearchResults = document.getElementById('navSearchResults');
const miniResultsList = document.getElementById('miniResultsList');
const seeMoreBtn = document.getElementById('seeMoreBtn');
const navSearchContainer = document.getElementById('navSearchContainer');

let catalogoParaBuscador = []; 

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
    await renderizarMiniResultados(resultados, query);
}

async function renderizarMiniResultados(resultados, query) {
    if (!miniResultsList || !navSearchResults || !seeMoreBtn) return;
    miniResultsList.innerHTML = '';

    if (resultados.length === 0) {
        miniResultsList.innerHTML = '<p style="color:#7b88a1; text-align:center; margin:10px 0;">No se encontraron animes</p>';
        seeMoreBtn.style.display = 'none';
    } else {
        for (const anime of resultados) {
            const a = document.createElement('a');
            a.className = 'mini-result-item';
            a.href = `/Datos.html?id=${anime.mensaje.id}`;

            const imgId = `mini-img-${anime.mensaje.id}`;
            const cachedBlob = await localforage.getItem(`catalog_img_${anime.mensaje.id}`);
            let imgStyle = `background-color: #2c2d3e; background-size: cover; background-position: center;`;

            if (cachedBlob) {
                const objectURL = URL.createObjectURL(cachedBlob);
                imgStyle = `background-image: url('${objectURL}'); background-size: cover; background-position: center;`;
            }

            a.innerHTML = `
                <div id="${imgId}" class="mini-result-img" style="${imgStyle}"></div>
                <div class="mini-result-info">
                    <h4 class="mini-result-title">${anime.datos.titulo}</h4>
                    <p class="mini-result-type">${anime.datos.tipo || 'TV'}</p>
                </div>
            `;
            miniResultsList.appendChild(a);

            if (!cachedBlob) {
                cargarImagenMini(anime.mensaje, imgId);
            }
        }
        seeMoreBtn.style.display = 'block';
        seeMoreBtn.onclick = () => { window.location.href = `/buscador.html?q=${encodeURIComponent(navSearchInput.value.trim())}`; };
    }
    navSearchResults.classList.remove('hidden');
}

async function cargarImagenMini(msg, elementId) {
    const divImagen = document.getElementById(elementId);
    if (!divImagen) return;

    try {
        const buffer = await client.downloadMedia(msg);
        if (buffer) {
            const blob = new Blob([buffer], { type: 'image/jpeg' });
            const imageURL = URL.createObjectURL(blob);
            const img = new Image();
            img.src = imageURL;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const targetWidth = 80;
                const targetHeight = Math.round((img.height * targetWidth) / img.width);
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                canvas.toBlob(async (resizedBlob) => {
                    try {
                        await localforage.setItem(`catalog_img_${msg.id}`, resizedBlob);
                    } catch (e) {
                        console.error("Error guardando en IndexedDB:", e);
                    }
                    const finalURL = URL.createObjectURL(resizedBlob);
                    divImagen.style.backgroundImage = `url('${finalURL}')`;
                    URL.revokeObjectURL(imageURL);
                }, 'image/webp', 0.8);
            };
        }
    } catch (error) {
        console.error("Error descargando imagen para el mini buscador:", error);
    }
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
    const estado = extraerRegex(/Estado:\s*([^\n\r]+)/i) || "Desconocido";
    const estudio = extraerRegex(/Estudio:\s*([^\n\r]+)/i) || "Desconocido";
    const autor = extraerRegex(/Autor:\s*([^\n\r]+)/i) || "Desconocido";
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
// 4. CARGA DE DATOS EN LA PÁGINA
// ==========================================
async function iniciarPaginaDatos() {
    const urlParams = new URLSearchParams(window.location.search);
    const animeId = urlParams.get('id');

    if (!animeId) {
        alert("No se proporcionó un ID de anime.");
        window.location.href = "/buscador.html";
        return;
    }

    try {
        await client.connect();
        console.log("✅ Conectado a Telegram. Buscando anime...");
        cargarPerfilUsuario();

        const nombreGrupo = "AnimeKT1"; 
        const topicId = 16;             

        // 👇 SOLUCIÓN 1: Aumentamos el límite a 500 para encontrar animes antiguos
        const mensajes = await client.getMessages(nombreGrupo, {
            replyTo: parseInt(topicId),
            limit: 500, 
        });

        let animesAgrupados = {};
        mensajes.forEach(msg => {
            let isImage = false;
            if (msg.media && (msg.media.className === 'MessageMediaPhoto' || msg.photo)) isImage = true;
            else if (msg.media && msg.media.className === 'MessageMediaDocument' && msg.media.document) {
                const mimeType = msg.media.document.mimeType || '';
                if (mimeType.startsWith('image/')) isImage = true;
            }

            if (isImage) {
                const idGrupo = msg.groupedId ? msg.groupedId.toString() : msg.id.toString();
                if (!animesAgrupados[idGrupo]) animesAgrupados[idGrupo] = [];
                animesAgrupados[idGrupo].push(msg);
            }
        });

        let albumSeleccionado = null;
        
        Object.values(animesAgrupados).forEach(album => {
            album.sort((a, b) => a.id - b.id);
            
            let textoCompleto = "";
            album.forEach(m => { if (m.message) textoCompleto += m.message + "\n"; });
            const datosExtraidos = extraerDatosAnime(textoCompleto.trim());
            
            const fotoVertical = album[1] || album[0]; 
            catalogoParaBuscador.push({
                mensaje: fotoVertical,
                datos: datosExtraidos
            });

            if (album.some(m => m.id.toString() === animeId)) {
                albumSeleccionado = album;
            }
        });

        if (!albumSeleccionado) {
            console.error("Anime no encontrado en los últimos mensajes.");
            return;
        }

        albumSeleccionado.sort((a, b) => a.id - b.id);

// 📱 Detectamos si el usuario está entrando desde un celular (ancho menor o igual a 768px)
const esMobile = window.innerWidth <= 768;

// Si es celular y hay segunda foto (vertical), usa esa. Si es PC, usa siempre la primera (horizontal).
const fotoParaHero = (esMobile && albumSeleccionado.length > 1) 
    ? albumSeleccionado[1] 
    : albumSeleccionado[0];

let textoCompleto = "";
albumSeleccionado.forEach(m => { if (m.message) textoCompleto += m.message + "\n"; });

const datos = extraerDatosAnime(textoCompleto.trim());

setTimeout(() => renderizarUI(datos), 500); 

// Cargará la vertical en celulares y la horizontal en computadoras
cargarFondoHero(fotoParaHero);

        const btnHeroFav = document.getElementById("btn-hero-fav");
        if (btnHeroFav) {
            let favoritos = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
            const isFav = favoritos.includes(animeId);
            const svgIcon = btnHeroFav.querySelector("svg");

            if (isFav) {
                if (svgIcon) svgIcon.setAttribute("fill", "currentColor");
                btnHeroFav.style.color = "#a855f7"; 
            }

            btnHeroFav.onclick = () => window.toggleFavorito(animeId, btnHeroFav);
        }

        const btnComenzarVer = document.getElementById("btn-comenzar-ver");
        if (btnComenzarVer) {
            btnComenzarVer.onclick = () => {
                window.location.href = `/Ver.html?id=${animeId}`;
            };
        }

    } catch (error) {
        console.error("❌ Error cargando los datos:", error);
    }
}

function renderizarUI(datos) {
    const headerContainer = document.getElementById("datos-header");
    if (headerContainer) {
        headerContainer.innerHTML = `
            <h1 class="cr-title">${datos.titulo}</h1>
            ${datos.titulosAlternativos ? `<h3 style="font-size: 16px; color: #a1a1aa; margin-top: 5px; margin-bottom: 15px; font-weight: 400;">${datos.titulosAlternativos}</h3>` : ''}
            <div class="cr-meta-info">
                <span class="cr-age-rating">14+</span>
                <span>${datos.meta}</span>
            </div>
        `;
    }

    const skeletonSynopsis = document.getElementById("synopsis-skeleton");
    const textSynopsis = document.getElementById("synopsis-text");
    if (skeletonSynopsis && textSynopsis) {
        skeletonSynopsis.style.display = "none";
        textSynopsis.style.display = "block";
        textSynopsis.innerHTML = `<p>${datos.sinopsis.replace(/\n/g, '<br>')}</p>`;
    }

    const techData = document.getElementById("technical-data-container");
    if (techData) {
        document.getElementById("data-audio").textContent = datos.audio;
        document.getElementById("data-studio").textContent = datos.estudio;
        document.getElementById("data-status").textContent = datos.estado;
        document.getElementById("data-author").textContent = datos.autor;
        techData.style.display = "block";
    }
}

async function cargarFondoHero(msg) {
    const heroBackground = document.getElementById(`hero-background`);
    if (!heroBackground) return;

    // 👇 SOLUCIÓN 2: Inyectamos estilos CSS perfectos para que la imagen no se mutile
    const aplicarEstilosFondo = (url) => {
    heroBackground.style.backgroundImage = `url('${url}')`;
    
    // Volvemos a 'cover' para rellenar los bordes negros
    heroBackground.style.backgroundSize = 'cover'; 
    
    // Anclamos la imagen arriba al centro para no cortar las cabezas
    heroBackground.style.backgroundPosition = 'top center'; 
    heroBackground.style.backgroundRepeat = 'no-repeat';
};

    const cachedImage = localStorage.getItem(`hero_img_${msg.id}`);
    if (cachedImage) {
        aplicarEstilosFondo(cachedImage);
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
                let targetWidth = img.width;
                let targetHeight = img.height;
                const maxAllowedWidth = 1920; 

                if (targetWidth > maxAllowedWidth) {
                    targetHeight = Math.round((targetHeight * maxAllowedWidth) / targetWidth);
                    targetWidth = maxAllowedWidth;
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const webpDataUrl = canvas.toDataURL('image/webp', 0.95);
                try { localStorage.setItem(`hero_img_${msg.id}`, webpDataUrl); } catch(e){}

                aplicarEstilosFondo(webpDataUrl);
                URL.revokeObjectURL(imageURL);
            };
        }
    } catch (error) {
        console.log("Error cargando imagen de fondo:", error);
    }
}

// ==========================================
// SISTEMA DE FAVORITOS (GUARDADO LOCAL CON CAMBIO VISUAL)
// ==========================================
window.toggleFavorito = function(id, btnElement) {
    let favoritos = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
    const idString = id.toString();
    const index = favoritos.indexOf(idString);
    
    const svgIcon = btnElement.querySelector("svg");

    if (index > -1) {
        favoritos.splice(index, 1);
        if (svgIcon) svgIcon.setAttribute("fill", "none");
        btnElement.style.color = ""; 
    } else {
        favoritos.push(idString);
        if (svgIcon) svgIcon.setAttribute("fill", "currentColor");
        btnElement.style.color = "#a855f7"; 
    }
    
    localStorage.setItem("mis_favoritos", JSON.stringify(favoritos));
};

iniciarPaginaDatos();