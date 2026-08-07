import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// 1. Verificación de seguridad: Si no hay sesión, regresarlo al Login
const savedSession = localStorage.getItem("telegram_session");
if (!savedSession) {
    window.location.href = "/";
}

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

const episodesContainer = document.getElementById("episodes-container");
const episodesGrid = document.getElementById("episodes-grid");
const videoTitle = document.getElementById("video-title");
const btnLogoutNav = document.getElementById("btn-logout-nav");

// ==========================================
// LIMPIEZA AUTOMÁTICA DE CACHÉ (CADA 24 HORAS)
// ==========================================
const ultimaLimpieza = localStorage.getItem('ultima_limpieza_cache');
const ahora = new Date().getTime();

// 86400000 milisegundos equivalen exactamente a 24 horas
if (!ultimaLimpieza || ahora - parseInt(ultimaLimpieza) > 86400000) { 
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('catalog_img_') || key.startsWith('hero_img_') || key.startsWith('thumb_')) {
            localStorage.removeItem(key);
        }
    });
    localStorage.setItem('ultima_limpieza_cache', ahora.toString());
    console.log("🧹 Caché de imágenes limpiado automáticamente por el ciclo de 24 horas.");
}

// Botón de Cerrar Sesión
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


// Capturamos los elementos que ya tienes en tu HTML
const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');
const navSearchInput = document.getElementById('navSearchInput');
const navSearchResults = document.getElementById('navSearchResults');
const miniResultsList = document.getElementById('miniResultsList');
const seeMoreBtn = document.getElementById('seeMoreBtn');
const navSearchContainer = document.getElementById('navSearchContainer');

// 👇 NUEVO: Condicional para proteger el código
if (btnSearch && searchInput) {
    // Le decimos al botón de la lupa qué hacer al hacerle clic
    btnSearch.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            window.location.href = `/buscador.html?q=${encodeURIComponent(query)}`;
        }
    });

    // Hacemos que también funcione si el usuario presiona la tecla "Enter"
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnSearch.click();
        }
    });
}

// Búsqueda reactiva en el mini buscador del navbar
if (navSearchInput) {
    let debounceTimer;

    navSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            if (navSearchResults) navSearchResults.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => {
            ejecutarMiniBusqueda(query);
        }, 400);
    });

    navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = navSearchInput.value.trim();
            if (query) {
                window.location.href = `/buscador.html?q=${encodeURIComponent(query)}`;
            }
        }
    });
}

async function ejecutarMiniBusqueda(query) {
    if (!miniResultsList || !navSearchResults) return;

    // Usamos el catálogo real cargado en la página para buscar las tarjetas
    const datos = Array.isArray(catalogPhotos) ? catalogPhotos : [];
    const resultados = datos
        .filter(item => {
            const texto = (item.datos.textoBuscable || `${item.datos.titulo} ${item.datos.meta}`).toLowerCase();
            return texto.includes(query);
        })
        .slice(0, 4);

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
            
            // 👇 AQUÍ ESTÁ LA CORRECCIÓN 👇
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
        seeMoreBtn.onclick = () => {
            window.location.href = `/buscador.html?q=${encodeURIComponent(navSearchInput.value.trim())}`;
        };
    }

    navSearchResults.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
    if (navSearchContainer && !navSearchContainer.contains(e.target)) {
        if (navSearchResults) navSearchResults.classList.add('hidden');
    }
});

if (navSearchInput) {
    navSearchInput.addEventListener('focus', () => {
        if (navSearchInput.value.trim().length >= 2 && navSearchResults) {
            navSearchResults.classList.remove('hidden');
        }
    });
}

async function iniciarAplicacion() {
    try {
        await client.connect();
        console.log("¡Cliente de Telegram conectado en Home!");
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }

        // 🚀 Cargar perfil del usuario en paralelo a las imágenes (no retrasa la carga de la página)
        cargarPerfilUsuario();
        
        cargarHero("AnimeKT1", 16);

    } catch (error) {
        console.error("Error al conectar en el Home:", error);
    }
}

async function cargarPerfilUsuario() {
    try {
        // Pedimos a Telegram la foto pequeña del usuario actual ("me")
        const profilePhotoBuffer = await client.downloadProfilePhoto("me", { isBig: false });
        
        if (profilePhotoBuffer && profilePhotoBuffer.length > 0) {
            const blob = new Blob([profilePhotoBuffer], { type: 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);
            
            // Reemplazamos el icono por la foto real
            const profileIconDiv = document.getElementById("profile-icon");
            if (profileIconDiv) {
                profileIconDiv.innerHTML = `<img src="${imageUrl}" alt="Mi Perfil">`;
            }
        }
    } catch (error) {
        console.error("⚠️ Error obteniendo la foto de perfil o el usuario no tiene una:", error);
    }
}

// --- LÓGICA: MENÚ DE PERFIL ---
const profileMenu = document.getElementById("profile-menu");
const dropdownContent = document.getElementById("dropdown-content");

if (profileMenu && dropdownContent) {
    profileMenu.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdownContent.classList.toggle("show");
    });

    dropdownContent.addEventListener("click", (e) => {
        e.stopPropagation();
    });
}

// Cerrar el menú si el usuario hace clic fuera de él
document.addEventListener("click", () => {
    if (dropdownContent) {
        dropdownContent.classList.remove("show");
    }
});

async function cargarEpisodios(nombreGrupo, topicId) {
    videoTitle.textContent = "Buscando episodios...";
    episodesGrid.innerHTML = "";

    try {
        const mensajes = await client.getMessages(nombreGrupo, {
            replyTo: parseInt(topicId),
            limit: 100,
        });

        const episodios = mensajes.filter(msg => msg.document);

        if (episodios.length === 0) {
            videoTitle.textContent = "No se encontraron videos en este tema.";
            return;
        }

        videoTitle.textContent = `Se encontraron ${episodios.length} episodios`;

        episodios.reverse().forEach((mensaje, index) => {
            const btnEpisodio = document.createElement("button");
            btnEpisodio.className = "action-btn";
            btnEpisodio.style.margin = "5px";
            btnEpisodio.style.width = "auto";
            btnEpisodio.textContent = `Episodio ${index + 1}`;
            
            btnEpisodio.onclick = () => {
                console.log("Clic en el episodio ID:", mensaje.id);
            };

            episodesGrid.appendChild(btnEpisodio);
        });
    } catch (error) {
        console.error("Error obteniendo mensajes:", error);
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

// --- VARIABLES GLOBALES PARA EL HERO (CON LOCALSTORAGE) ---
let heroPhotos = [];
let catalogPhotos = []; // NUEVO: Para guardar las portadas verticales
let currentHeroIndex = 0;    
let isHeroLoading = false;
let autoSlideInterval;

// --- 1. FUNCIÓN PRINCIPAL DE CARGA (SOPORTA ÁLBUMES) ---
async function cargarHero(nombreGrupo, topicId) {
    console.log("🔍 Iniciando búsqueda de portadas en el topic:", topicId);
    try {
        const mensajes = await client.getMessages(nombreGrupo, {
            replyTo: parseInt(topicId),
            limit: 300, // Aumentamos el límite porque ahora cada anime ocupa 2 mensajes (horizontal y vertical)
        });

        // 1. Agrupar los mensajes que forman parte de un mismo álbum (mismo groupedId)
        let animesAgrupados = {};

        mensajes.forEach(msg => {
            // Verificamos que sea una foto válida
            let isImage = false;
            if (msg.media && (msg.media.className === 'MessageMediaPhoto' || msg.photo)) {
                isImage = true;
            } else if (msg.media && msg.media.className === 'MessageMediaDocument' && msg.media.document) {
                // (Tu lógica de validación de documentos de imagen se mantiene aquí)
                const mimeType = msg.media.document.mimeType || '';
                if (mimeType.startsWith('image/')) isImage = true;
            }

            if (isImage) {
                // Si la imagen fue enviada sola, la agrupamos por su ID normal. 
                // Si fue enviada en álbum, usamos su groupedId.
                const idGrupo = msg.groupedId ? msg.groupedId.toString() : msg.id.toString();

                if (!animesAgrupados[idGrupo]) {
                    animesAgrupados[idGrupo] = [];
                }
                animesAgrupados[idGrupo].push(msg);
            }
        });

        // 2. Extraer portadas HORIZONTALES (Hero) y VERTICALES (Catálogo)
        heroPhotos = [];
        catalogPhotos = []; // Vaciamos el catálogo
        
        // NUEVO: Leer qué día es hoy en el sistema del usuario
        const diasSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
        const diaHoy = diasSemana[new Date().getDay()]; 
        
        let animesEnEmision = []; // Respaldo de seguridad
        
        // Iteramos sobre los álbumes encontrados
        Object.values(animesAgrupados).forEach(album => {
            album.sort((a, b) => a.id - b.id);
            
            const fotoHorizontal = album[0];
            const fotoVertical = album[1]; 
            
            let textoCompleto = "";
            album.forEach(m => { if (m.message) textoCompleto += m.message + "\n"; });
            
            const datosAnime = extraerDatosAnime(textoCompleto.trim());
            
            // 👇 CAMBIO 1: Le asignamos el texto también a la foto vertical para no perder el título
            if (fotoVertical) {
                fotoVertical.textoCombinado = textoCompleto.trim();
            }
            fotoHorizontal.textoCombinado = textoCompleto.trim();
            
            // LÓGICA DEL HERO (Filtro por Emisión y Día)
            const estadoNormalizado = datosAnime.estado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const diaNormalizado = datosAnime.dia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            if (estadoNormalizado.includes("emision")) {
                // Detectamos si está en celular (< 768px) para elegir la vertical, sino la horizontal
                const esCelular = window.innerWidth <= 768;
                const fotoParaHero = esCelular ? (fotoVertical || fotoHorizontal) : fotoHorizontal;
                
                animesEnEmision.push(fotoParaHero); 
                
                if (diaNormalizado.includes(diaHoy)) {
                    heroPhotos.push(fotoParaHero);
                }
            }

            // Para el catálogo, guardamos siempre TODAS las portadas verticales sin importar el día
            if (fotoVertical) {
                catalogPhotos.push({
                    mensaje: fotoVertical,
                    datos: datosAnime
                });
            }
        });

        // SISTEMA ANTIFALLOS: Si hoy (ej. Jueves) no hay ningún anime nuevo para mostrar, 
        // pasamos al Hero todos los animes en Emisión general para que la página no se vea rota.
        if (heroPhotos.length === 0 && animesEnEmision.length > 0) {
            heroPhotos = animesEnEmision;
        }

        heroPhotos.sort((a, b) => b.id - a.id);
        
        catalogPhotos.sort((a, b) => {
            // Aseguramos que los últimos mensajes de Telegram aparezcan primero en las tarjetas
            return b.mensaje.id - a.mensaje.id;
        }); // Mantenemos el mismo orden

        if (heroPhotos.length > 0) {
            console.log(`📸 ¡Hero cargado con ${heroPhotos.length} animes del día!`);
            configurarControlesHero();

            const cachedFirstImage = localStorage.getItem(`hero_img_${heroPhotos[0].id}`);
            if (cachedFirstImage) {
                console.log("⚡ Cargando portada desde caché.");
                ejecutarTransicionDirecta(cachedFirstImage, 0);
            } else {
                await cambiarImagenHero(0);
            }
            precargarYGuardarPortadas();
            iniciarAutoSlide(); // 👇 NUEVO: Inicia el temporizador de 5 segundos
        } else {
            // Si el anime está Finalizado y no hay nada para el Hero, ocultamos la caja negra gigante
            const heroSection = document.querySelector('.hero-section');
            if (heroSection) heroSection.style.display = 'none';

            
        }

        // El catálogo SIEMPRE se debe renderizar al final
        renderizarCatalogo(); // NUEVO: Llamamos a construir las tarjetitas

    } catch (error) {
        console.error("❌ Error general buscando portadas del Hero:", error);
    }
}

// --- 2. CONFIGURAR CONTROLES ---
function configurarControlesHero() {
    const leftArrow = document.querySelector('.hero-arrow.left-arrow');
    const rightArrow = document.querySelector('.hero-arrow.right-arrow');
    const indicatorsContainer = document.querySelector('.hero-indicators');

    if (indicatorsContainer) {
        indicatorsContainer.innerHTML = '';
        heroPhotos.forEach((_, index) => {
            const dot = document.createElement('span');
            dot.className = `indicator ${index === 0 ? 'active' : ''}`;
            dot.onclick = () => {
                cambiarImagenHero(index);
                iniciarAutoSlide(); // 👇 NUEVO: Reinicia el reloj al hacer clic
            };
            indicatorsContainer.appendChild(dot);
        });
    }

    if (leftArrow) {
        leftArrow.onclick = () => {
            let newIndex = currentHeroIndex - 1;
            if (newIndex < 0) newIndex = heroPhotos.length - 1; 
            cambiarImagenHero(newIndex);
            iniciarAutoSlide(); // 👇 NUEVO: Reinicia el reloj al hacer clic
        };
    }

    if (rightArrow) {
        rightArrow.onclick = () => {
            let newIndex = currentHeroIndex + 1;
            if (newIndex >= heroPhotos.length) newIndex = 0; 
            cambiarImagenHero(newIndex);
            iniciarAutoSlide(); // 👇 NUEVO: Reinicia el reloj al hacer clic
        };
    }
}

// --- NUEVO: FUNCIÓN PARA AUTOSLIDE ---
function iniciarAutoSlide() {
    // 1. Limpiamos cualquier temporizador anterior para que no se vuelvan locos
    if (autoSlideInterval) {
        clearInterval(autoSlideInterval);
    }
    
    // 2. Creamos un nuevo ciclo de 5 segundos (5000 milisegundos)
    autoSlideInterval = setInterval(() => {
        // Solo avanza si hay más de 1 imagen y no está a la mitad de una carga
        if (!isHeroLoading && heroPhotos.length > 1) {
            let newIndex = currentHeroIndex + 1;
            if (newIndex >= heroPhotos.length) newIndex = 0;
            cambiarImagenHero(newIndex);
        }
    }, 5000);
}

// --- FUNCIÓN AUXILIAR PARA CAMBIO DIRECTO ---
function ejecutarTransicionDirecta(url, index) {
    currentHeroIndex = index;
    document.querySelectorAll('.hero-indicators .indicator').forEach((dot, i) => {
        dot.className = `indicator ${i === index ? 'active' : ''}`;
    });

    // NUEVO: Capturar todos los elementos de texto del Hero
    const tituloAnime = document.querySelector('.hero-title-img');
    const metaTagsAnime = document.querySelector('.meta-tags');
    const descripcionAnime = document.querySelector('.hero-description');

    if (heroPhotos[index]) {
        // ATENCIÓN AQUÍ: Usamos .textoCombinado en lugar de .message
        const datos = extraerDatosAnime(heroPhotos[index].textoCombinado);
        
        // Inyectamos cada dato en su lugar correspondiente del HTML
        if (tituloAnime) {
            // Si hay títulos alternativos, los ponemos debajo con letra más pequeña usando HTML
            if (datos.titulosAlternativos) {
                tituloAnime.innerHTML = `${datos.titulo}<br><span style="font-size: 0.5em; font-weight: normal; color: #cbd5e1; display: block; margin-top: 5px;">${datos.titulosAlternativos}</span>`;
            } else {
                tituloAnime.textContent = datos.titulo;
            }
        }
        if (metaTagsAnime) metaTagsAnime.textContent = datos.meta;
        if (descripcionAnime) descripcionAnime.textContent = datos.sinopsis;

        actualizarBotonFavHero(heroPhotos[index].id);
        actualizarBotonPlayHero(heroPhotos[index].id);
    }

    const layer1 = document.querySelector('.hero-layer.layer-1');
    const layer2 = document.querySelector('.hero-layer.layer-2');
    if (!layer1 || !layer2) return;

    const activeLayer = layer1.classList.contains('active') ? layer1 : layer2;
    const nextLayer = activeLayer === layer1 ? layer2 : layer1;

    nextLayer.style.backgroundImage = `url('${url}')`;
    nextLayer.classList.add('active');
    activeLayer.classList.remove('active');
}

// --- 3. CAMBIAR IMAGEN (CONSULTANDO LOCALSTORAGE) ---
async function cambiarImagenHero(index) {
    if (isHeroLoading || !heroPhotos[index]) return;
    
    isHeroLoading = true;
    currentHeroIndex = index;

    // Actualizar indicadores visuales
    document.querySelectorAll('.hero-indicators .indicator').forEach((dot, i) => {
        dot.className = `indicator ${i === index ? 'active' : ''}`;
    });

 // NUEVO: Capturar todos los elementos de texto del Hero
    const tituloAnime = document.querySelector('.hero-title-img');
    const metaTagsAnime = document.querySelector('.meta-tags');
    const descripcionAnime = document.querySelector('.hero-description');

    if (heroPhotos[index]) {
        // ATENCIÓN AQUÍ: Usamos .textoCombinado en lugar de .message para leer el álbum entero
        const datos = extraerDatosAnime(heroPhotos[index].textoCombinado);
        
        // Inyectamos cada dato en su lugar correspondiente del HTML
        if (tituloAnime) {
            // Si hay títulos alternativos, los ponemos debajo con letra más pequeña usando HTML
            if (datos.titulosAlternativos) {
                tituloAnime.innerHTML = `${datos.titulo}<br><span style="font-size: 0.5em; font-weight: normal; color: #cbd5e1; display: block; margin-top: 5px;">${datos.titulosAlternativos}</span>`;
            } else {
                tituloAnime.textContent = datos.titulo;
            }
        }
        if (metaTagsAnime) metaTagsAnime.textContent = datos.meta;
        if (descripcionAnime) descripcionAnime.textContent = datos.sinopsis;

        actualizarBotonFavHero(heroPhotos[index].id);  // 👇 CORRECCIÓN PARA FAVORITOS
        actualizarBotonPlayHero(heroPhotos[index].id);
    }

    const layer1 = document.querySelector('.hero-layer.layer-1');
    const layer2 = document.querySelector('.hero-layer.layer-2');
    if (!layer1 || !layer2) return;

    const activeLayer = layer1.classList.contains('active') ? layer1 : layer2;
    const nextLayer = activeLayer === layer1 ? layer2 : layer1;

    const ejecutarTransicion = (url) => {
        nextLayer.style.backgroundImage = `url('${url}')`;
        nextLayer.classList.add('active');
        activeLayer.classList.remove('active');
        isHeroLoading = false;
    };

    // 1. Buscar en el localStorage del navegador
    const cachedImage = localStorage.getItem(`hero_img_${heroPhotos[index].id}`);
    if (cachedImage) {
        ejecutarTransicion(cachedImage);
        return;
    }

    // 2. Si no está, lo descargamos de Telegram
    try {
        console.log(`⏳ Descargando portada ${index + 1} de Telegram...`);
        const buffer = await client.downloadMedia(heroPhotos[index]);
        
        if (buffer) {
            const blob = new Blob([buffer], { type: 'image/jpeg' }); 
            const imageURL = URL.createObjectURL(blob);

            const img = new Image();
            img.src = imageURL;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let targetWidth = img.width;
                let targetHeight = img.height;
                
                // 👇 NUEVO: Detecta si es celular o PC
                const esCelular = window.innerWidth <= 768;
                const maxAllowedWidth = esCelular ? 800 : 1920;

                if (targetWidth > maxAllowedWidth) {
                    targetHeight = Math.round((targetHeight * maxAllowedWidth) / targetWidth);
                    targetWidth = maxAllowedWidth;
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const webpDataUrl = canvas.toDataURL('image/webp', 0.95);
                
                // Guardar permanentemente en el navegador
                try {
                    localStorage.setItem(`hero_img_${heroPhotos[index].id}`, webpDataUrl);
                } catch (e) {
                    console.warn("⚠️ El almacenamiento local está lleno, omitiendo caché.");
                }

                ejecutarTransicion(webpDataUrl);
                URL.revokeObjectURL(imageURL);
            };

            img.onerror = () => {
                console.error("❌ Error al procesar la imagen en el Canvas.");
                isHeroLoading = false;
            };
        }
    } catch (error) {
        console.error("❌ Error descargando la imagen de Telegram:", error);
        isHeroLoading = false;
    }
}

// --- 4. PRECARGA SILENCIOSA EN SEGUNDO PLANO ---
async function precargarYGuardarPortadas() {
    for (let i = 0; i < heroPhotos.length; i++) {
        // Si ya existe en localStorage, lo saltamos
        if (localStorage.getItem(`hero_img_${heroPhotos[i].id}`)) continue;

        try {
            const buffer = await client.downloadMedia(heroPhotos[i]);
            if (buffer) {
                const blob = new Blob([buffer], { type: 'image/jpeg' }); 
                const imageURL = URL.createObjectURL(blob);

                await new Promise((resolve) => {
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
                        try {
                            localStorage.setItem(`hero_img_${heroPhotos[i].id}`, webpDataUrl);
                        } catch (e) {}
                        
                        URL.revokeObjectURL(imageURL);
                        resolve();
                    };
                    img.onerror = () => resolve();
                });
            }
        } catch (e) {}
    }
    console.log("✨ ¡Todas las portadas guardadas en la memoria local del navegador!");
}

// ==========================================
// SISTEMA DE CARGA POR BOTÓN "VER MÁS"
// ==========================================
let currentIndexToRender = 0;
const itemsPerLoad = 14; // 👈 Cuántos animes quieres que carguen cada vez al hacer clic

function renderizarCatalogo() {
    const carouselTrack = document.querySelector('.carousel-track');
    if (!carouselTrack) return;

    carouselTrack.innerHTML = ''; // Limpiar los esqueletos de carga
    currentIndexToRender = 0; // Reiniciar el contador de animes mostrados
    
    // 1. Cargar el primer lote de animes
    cargarMasAnimes();

    // 2. Configurar el botón "Ver más"
    const btnVerMas = document.getElementById('btn-ver-mas');
    if (btnVerMas) {
        // Removemos eventos anteriores clonando el botón (buena práctica para evitar doble carga)
        const nuevoBtn = btnVerMas.cloneNode(true);
        btnVerMas.parentNode.replaceChild(nuevoBtn, btnVerMas);
        
        nuevoBtn.addEventListener('click', () => {
            if (currentIndexToRender < catalogPhotos.length) {
                const textoOriginal = nuevoBtn.textContent;
                nuevoBtn.textContent = "Cargando..."; // Efecto visual
                nuevoBtn.style.opacity = "0.7";
                
                setTimeout(() => {
                    cargarMasAnimes();
                    nuevoBtn.textContent = textoOriginal;
                    nuevoBtn.style.opacity = "1";
                }, 300); // Un pequeño retraso para que se vea natural
            }
        });
    }
}

// Función auxiliar que inyecta el HTML por lotes
function cargarMasAnimes() {
    const carouselTrack = document.querySelector('.carousel-track');
    if (!carouselTrack) return;

    let favoritosGuardados = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
    
    // Calculamos hasta qué número vamos a cargar en este lote
    const limite = Math.min(currentIndexToRender + itemsPerLoad, catalogPhotos.length);

    for (let i = currentIndexToRender; i < limite; i++) {
        const item = catalogPhotos[i];
        const msg = item.mensaje;
        const datos = item.datos;

        const isFav = favoritosGuardados.includes(msg.id.toString());
        const fillAtributo = isFav ? "currentColor" : "none";
        const colorStyle = isFav ? "color: #a855f7;" : "";

        const cardHTML = `
            <div class="anime-card" onclick="window.location.href='/Datos.html?id=${msg.id}'" style="cursor: pointer;">
                <div class="card-image-wrapper">
                    <div class="card-image" id="catalog-img-${msg.id}" style="background-color: #2b2b2b;"></div>
                    
                    <div class="card-hover-content">
                        <h4 class="hover-title">${datos.titulo}</h4>
                        ${datos.titulosAlternativos ? `<p style="font-size: 0.75rem; color: #9ca3af; margin-top: -5px; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${datos.titulosAlternativos}</p>` : ''}
                        
                        <div class="hover-meta">
                            <span>${datos.meta}</span>
                        </div>
                        <p class="hover-description">${datos.sinopsis}</p>
                        <div class="hover-actions">
                            <button class="action-icon" title="Ver" onclick="event.stopPropagation(); window.location.href='/Ver.html?id=${msg.id}';">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </button>
                            
                            <button class="action-icon" title="Añadir a lista" style="${colorStyle}" onclick="event.stopPropagation(); window.toggleFavorito('${msg.id}', this);">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="${fillAtributo}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
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
        
        carouselTrack.insertAdjacentHTML('beforeend', cardHTML);
        cargarImagenCatalogo(msg); // Descarga la imagen de este anime específico
    }

    // Actualizamos el índice donde nos quedamos para el próximo lote
    currentIndexToRender = limite;
    
    // 👇 Control de visibilidad del botón "Ver más"
    const btnVerMas = document.getElementById('btn-ver-mas');
    if (btnVerMas) {
        if (currentIndexToRender >= catalogPhotos.length) {
            btnVerMas.style.display = 'none'; // Ya no hay más, lo escondemos
        } else {
            btnVerMas.style.display = 'inline-block'; // Aún hay, lo mostramos
        }
    }
}

// --- NUEVA FUNCIÓN: DESCARGAR IMAGEN VERTICAL (CON CACHÉ) ---
async function cargarImagenCatalogo(msg) {
    const divImagen = document.getElementById(`catalog-img-${msg.id}`);
    if (!divImagen) return;

    // Revisamos si ya tenemos la portada vertical guardada en el navegador
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
                // Reducimos el tamaño a 300px de ancho porque es una tarjeta pequeña
                // Esto ahorra muchísima memoria y hace que la web cargue rapidísimo
                const targetWidth = 600; 
                const targetHeight = Math.round((img.height * targetWidth) / img.width);
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const webpDataUrl = canvas.toDataURL('image/webp', 0.85);
                try { 
                    localStorage.setItem(`catalog_img_${msg.id}`, webpDataUrl); 
                } catch (e) {
                    console.warn("⚠️ Caché del catálogo lleno.");
                }

                divImagen.style.backgroundImage = `url('${webpDataUrl}')`;
                URL.revokeObjectURL(imageURL);
            };
        }
    } catch (error) {
        console.error("Error descargando imagen del catálogo:", error);
    }
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

// NUEVA FUNCIÓN: Actualiza el botón del Hero cada vez que cambia la imagen
function actualizarBotonFavHero(animeId) {
    const btnHeroFav = document.getElementById("btn-hero-fav");
    if (!btnHeroFav) return;

    let favoritos = JSON.parse(localStorage.getItem("mis_favoritos") || "[]");
    const isFav = favoritos.includes(animeId.toString());
    const svgIcon = btnHeroFav.querySelector("svg");

    // Pintamos el botón según su estado
    if (isFav) {
        if (svgIcon) svgIcon.setAttribute("fill", "currentColor");
        btnHeroFav.style.color = "#a855f7"; // Morado
    } else {
        if (svgIcon) svgIcon.setAttribute("fill", "none");
        btnHeroFav.style.color = ""; // Color por defecto
    }

    // Le damos la función de clic usando tu función global
    btnHeroFav.onclick = () => window.toggleFavorito(animeId, btnHeroFav);
}

function actualizarBotonPlayHero(animeId) {
    const btnHeroPlay = document.getElementById("btn-hero-play");
    if (btnHeroPlay) {
        btnHeroPlay.onclick = () => {
            window.location.href = `/Ver.html?id=${animeId}`;
        };
    }
}


// Iniciar todo
iniciarAplicacion();