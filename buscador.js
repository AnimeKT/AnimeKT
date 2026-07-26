import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

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
// 2. LÓGICA DE LA BARRA DE NAVEGACIÓN
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

const btnGenres = document.getElementById("btn-genres");
const genresDropdown = document.getElementById("genres-dropdown");
const profileMenu = document.getElementById("profile-menu");
const dropdownContent = document.getElementById("dropdown-content");

if (btnGenres && genresDropdown) {
    btnGenres.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (dropdownContent) dropdownContent.classList.remove("show");
        genresDropdown.classList.toggle("show");
    });
    genresDropdown.addEventListener("click", (e) => e.stopPropagation());
}

if (profileMenu && dropdownContent) {
    profileMenu.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (genresDropdown) genresDropdown.classList.remove("show");
        dropdownContent.classList.toggle("show");
    });
    dropdownContent.addEventListener("click", (e) => e.stopPropagation());
}

document.addEventListener("click", () => {
    if (genresDropdown) genresDropdown.classList.remove("show");
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
// 3. BASE DE DATOS LOCAL Y ESTADO DE FILTROS
// ==========================================
let todosLosAnimes = []; 
let filtrosActuales = {
    texto: "",
    letra: "",
    tipo: "",
    genero: "",
    año: "",
    estado: "",
    orden: "default"
};

function normalizar(texto) {
    return texto ? texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
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
    
    // Para Favoritos y Buscador (Mantiene la compatibilidad con tu código actual)
    const generosTexto = extraerRegex(/G[ée]neros:\s*(.+)/i) || "Desconocido";
    const generos = generosTexto !== "Desconocido" ? generosTexto.split(",").map(g => g.trim()).filter(Boolean) : [];

    const añoMatch = texto.match(/A[ñn]o\s*:\s*(\d{4})/i) || texto.match(/\b(19\d{2}|20\d{2})\b/);
    const año = añoMatch ? (añoMatch[1] || añoMatch[0]).trim() : "";
    
    // Búsqueda flexible de Topics
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
// 5. CONTROLES DE LA UI
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const busquedaQuery = urlParams.get('q');
const massiveInput = document.getElementById("massive-search-input");
const massiveBtn = document.getElementById("massive-search-btn");
const alphabetContainer = document.getElementById('alphabet-container');

if (massiveInput && massiveBtn) {
    massiveBtn.addEventListener('click', () => {
        filtrosActuales.texto = massiveInput.value.trim();
        aplicarFiltros();
    });
    massiveInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') massiveBtn.click();
    });
    massiveInput.addEventListener('input', () => {
        filtrosActuales.texto = massiveInput.value.trim();
        aplicarFiltros();
    });
}

if (alphabetContainer) {
    const characters = ['#', ...Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i))];
    characters.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'alpha-btn';
        btn.textContent = char;
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                filtrosActuales.letra = "";
            } else {
                document.querySelectorAll('.alpha-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filtrosActuales.letra = char;
            }
            aplicarFiltros();
        });
        alphabetContainer.appendChild(btn);
    });
}

const btnFiltrar = document.getElementById("btn-apply-filters");
if (btnFiltrar) {
    btnFiltrar.addEventListener("click", () => {
        filtrosActuales.tipo = document.getElementById("filter-tipo").value;
        filtrosActuales.genero = document.getElementById("filter-genero").value;
        filtrosActuales.año = document.getElementById("filter-ano").value;
        filtrosActuales.estado = document.getElementById("filter-estado").value;
        aplicarFiltros();
    });
}

const sortSelect = document.getElementById("sort-select");
if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
        filtrosActuales.orden = e.target.value;
        aplicarFiltros();
    });
}

// ==========================================
// 6. MOTOR DE FILTRADO Y ORDENAMIENTO
// ==========================================
function aplicarFiltros() {
    let resultados = todosLosAnimes.filter(anime => {
        const datos = anime.datos;
        
        if (filtrosActuales.texto) {
            const query = normalizar(filtrosActuales.texto);
            const textoBuscable = normalizar(datos.textoBuscable || `${datos.titulo} ${datos.estado} ${datos.generosTexto} ${datos.tipo}`);
            if (!textoBuscable.includes(query)) return false;
        }

        if (filtrosActuales.letra) {
            const inicial = datos.titulo.charAt(0).toUpperCase();
            if (filtrosActuales.letra === '#') {
                if (/[A-Z]/.test(inicial)) return false; 
            } else {
                if (inicial !== filtrosActuales.letra) return false;
            }
        }

        if (filtrosActuales.tipo) {
            if (!normalizar(datos.tipo).includes(normalizar(filtrosActuales.tipo))) return false;
        }

        if (filtrosActuales.genero) {
            const generoFiltro = normalizar(filtrosActuales.genero);
            const coincideGenero = datos.generos.some(genero => normalizar(genero).includes(generoFiltro));
            if (!coincideGenero) return false;
        }

        if (filtrosActuales.año) {
            if (datos.año !== filtrosActuales.año) return false;
        }

        if (filtrosActuales.estado) {
            if (!normalizar(datos.estado).includes(normalizar(filtrosActuales.estado))) return false;
        }

        return true; 
    });

    if (filtrosActuales.orden === 'az') {
        resultados.sort((a, b) => a.datos.titulo.localeCompare(b.datos.titulo));
    } else if (filtrosActuales.orden === 'za') {
        resultados.sort((a, b) => b.datos.titulo.localeCompare(a.datos.titulo));
    } else if (filtrosActuales.orden === 'recientes') {
        resultados.sort((a, b) => b.mensaje.id - a.mensaje.id);
    }

    renderizarResultados(resultados);
}

// ==========================================
// 7. RENDERIZADO VISUAL DEL CATÁLOGO
// ==========================================
const resultsGrid = document.getElementById("search-results-grid");
const resultsCount = document.getElementById("results-count");

function renderizarResultados(listaAnimes) {
    if(!resultsGrid) return;
    resultsGrid.innerHTML = ''; 

    // 1. Leemos los favoritos actuales
    let favoritosGuardados = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");

    listaAnimes.forEach(anime => {
        const datos = anime.datos;
        const idAnime = anime.mensaje.id.toString();
        
        // 2. Verificamos estado
        const isFav = favoritosGuardados.includes(idAnime);
        const fillAtributo = isFav ? "currentColor" : "none";
        const colorStyle = isFav ? "color: #a855f7;" : "";
        
        const cardHTML = `
            <div class="anime-card" id="card-${idAnime}" onclick="window.location.href='/Datos.html?id=${idAnime}'" style="cursor: pointer;">
                <div class="card-image-wrapper">
                    <div class="card-image" id="catalog-img-${idAnime}" style="background-color: #2b2b2b;"></div>
                    <span class="anime-type-badge">${datos.tipo}</span>
                    
                    <div class="card-hover-content">
                        <h4 class="hover-title">${datos.titulo}</h4>
                        <!-- Nuevo título alternativo en hover -->
                        ${datos.titulosAlternativos ? `<p style="font-size: 0.75rem; color: #9ca3af; margin-top: -5px; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${datos.titulosAlternativos}</p>` : ''}
                        
                        <div class="hover-meta">
                            <span>${datos.meta}</span>
                        </div>
                        <p class="hover-description">${datos.sinopsis}</p>
                        <div class="hover-actions">
                            <button class="action-icon" title="Ver" onclick="event.stopPropagation();">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </button>
                            <!-- 👇 Botón actualizado con el estado de Favorito y pasándole 'this' 👇 -->
                            <button class="action-icon" title="Añadir a lista" style="${colorStyle}" onclick="event.stopPropagation(); window.toggleFavorito('${idAnime}', this);">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="${fillAtributo}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="card-info">
                    <h3 class="card-title">${datos.titulo}</h3>
                    <!-- Cortamos los títulos alternativos para mostrar máximo 2 extra (3 en total) -->
                    ${datos.titulosAlternativos ? `<span style="font-size: 0.75rem; color: #9ca3af; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${datos.titulosAlternativos.split(' - ').slice(0, 2).join(' - ')}</span>` : ''}
                    
                    <!-- Cambiamos "datos.meta" por "datos.audio" para que solo muestre el idioma -->
                    <span class="card-tags">• ${datos.audio}</span>
                </div>
            </div>
        `;
        resultsGrid.insertAdjacentHTML('beforeend', cardHTML);
        cargarImagenBuscador(anime.mensaje);
    });

    if(resultsCount) resultsCount.textContent = `${listaAnimes.length} Resultados`;
}

// AÑADIDO: Ahora se inyecta como 'background-image' igual que en tu Home
async function cargarImagenBuscador(msg) {
    const contenedorImagen = document.getElementById(`catalog-img-${msg.id}`);
    if (!contenedorImagen) return;

    const cachedImage = localStorage.getItem(`catalog_img_${msg.id}`);
    if (cachedImage) {
        contenedorImagen.style.backgroundImage = `url('${cachedImage}')`;
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
                const targetHeight = Math.round((img.height * targetWidth) / img.width);
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
                try { localStorage.setItem(`catalog_img_${msg.id}`, webpDataUrl); } catch(e){}

                contenedorImagen.style.backgroundImage = `url('${webpDataUrl}')`;
                URL.revokeObjectURL(imageURL);
            };
        }
    } catch (error) {
        console.log("Error cargando imagen:", error);
    }
}

// ==========================================
// 8. FUNCIÓN PRINCIPAL DE CONEXIÓN Y DESCARGA
// ==========================================
async function iniciarBuscador() {
    if (busquedaQuery && massiveInput) {
        massiveInput.value = busquedaQuery; 
        filtrosActuales.texto = busquedaQuery;
    }

    try {
        await client.connect();
        console.log("✅ Conectado a Telegram. Descargando base de datos...");
        cargarPerfilUsuario();

        const nombreGrupo = "AnimeKT1"; 
        const topicId = 16;             

        const mensajes = await client.getMessages(nombreGrupo, {
            replyTo: parseInt(topicId),
            limit: 100, 
        });

        let animesAgrupados = {};
        mensajes.forEach(msg => {
            let isImage = false;
            if (msg.media && (msg.media.className === 'MessageMediaPhoto' || msg.photo)) {
                isImage = true;
            } else if (msg.media && msg.media.className === 'MessageMediaDocument' && msg.media.document) {
                const mimeType = msg.media.document.mimeType || '';
                if (mimeType.startsWith('image/')) isImage = true;
            }

            if (isImage) {
                const idGrupo = msg.groupedId ? msg.groupedId.toString() : msg.id.toString();
                if (!animesAgrupados[idGrupo]) animesAgrupados[idGrupo] = [];
                animesAgrupados[idGrupo].push(msg);
            }
        });

        Object.values(animesAgrupados).forEach(album => {
            album.sort((a, b) => a.id - b.id);
            
            const portadaBuscador = album[1] || album[0]; 
            
            let textoCompleto = "";
            album.forEach(m => { if (m.message) textoCompleto += m.message + "\n"; });
            
            portadaBuscador.textoCombinado = textoCompleto.trim();
            const datosExtraidos = extraerDatosAnime(textoCompleto.trim());

            if (portadaBuscador && datosExtraidos.titulo !== "Desconocido") {
                todosLosAnimes.push({
                    mensaje: portadaBuscador,
                    datos: datosExtraidos
                });
            }
        });

        poblarFiltroAnios();
        aplicarFiltros();

    } catch (error) {
        console.error("❌ Error iniciando el buscador:", error);
    }
}

function poblarFiltroAnios() {
    const selectAno = document.getElementById("filter-ano");
    if (!selectAno) return;

    selectAno.innerHTML = '<option value="">Año: Seleccionar</option>';

    const aniosSet = new Set();
    todosLosAnimes.forEach(anime => {
        if (anime.datos.año) {
            aniosSet.add(anime.datos.año);
        }
    });

    const aniosUnicos = Array.from(aniosSet).sort((a, b) => b - a);

    aniosUnicos.forEach(anio => {
        const option = document.createElement("option");
        option.value = anio;
        option.textContent = anio;
        selectAno.appendChild(option);
    });
}

// ==========================================
// SISTEMA DE FAVORITOS (GUARDADO LOCAL CON CAMBIO VISUAL)
// ==========================================
window.toggleFavorito = function(id, btnElement) {
    let favoritos = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
    const idString = id.toString();
    const index = favoritos.indexOf(idString);
    
    // Buscamos el ícono SVG dentro del botón que presionaste
    const svgIcon = btnElement.querySelector("svg");

    if (index > -1) {
        // Si ya estaba, lo quitamos y lo volvemos transparente
        favoritos.splice(index, 1);
        if (svgIcon) svgIcon.setAttribute("fill", "none");
        btnElement.style.color = ""; // Vuelve a su color normal
    } else {
        // Si no estaba, lo guardamos y lo rellenamos de color morado
        favoritos.push(idString);
        if (svgIcon) svgIcon.setAttribute("fill", "currentColor");
        btnElement.style.color = "#a855f7"; // AQUÍ ESTÁ LA CORRECCIÓN (Color morado)
    }
    
    // Guardamos la nueva lista en el navegador
    localStorage.setItem("mis_favoritos", JSON.stringify(favoritos));
};

iniciarBuscador();