import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

// ==========================================
// 1. VARIABLES DE ESTADO Y ALMACENAMIENTO
// ==========================================
let client = null; 
let apiId = localStorage.getItem("user_api_id") || "";
let apiHash = localStorage.getItem("user_api_hash") || "";
const savedSession = localStorage.getItem("telegram_session") || "";
const stringSession = new StringSession(savedSession);

// ==========================================
// 2. REFERENCIAS A ELEMENTOS DEL DOM
// ==========================================
const apiCredentialsStep = document.getElementById("api-credentials-step");
const loginMethodsContainer = document.getElementById("login-methods-container");
const inputApiId = document.getElementById("user-api-id");
const inputApiHash = document.getElementById("user-api-hash");
const btnSaveApi = document.getElementById("btn-save-api");

const loginSection = document.getElementById("login-section");
const videoContainer = document.getElementById("video-container");

const stepPhone = document.getElementById("step-phone");
const phoneInput = document.getElementById("phone-input"); 
const btnSendCode = document.getElementById("btn-send-code");

const stepCode = document.getElementById("step-code");
const codeInput = document.getElementById("code-input"); 
const btnVerifyCode = document.getElementById("btn-verify-code");

const btnLogout = document.getElementById("btn-logout");

// ==========================================
// 3. INICIALIZACIÓN DEL CLIENTE Y FUNCIONES AUXILIARES
// ==========================================
function inicializarCliente() {
    if (!apiId || !apiHash) return;

    client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
        connectionRetries: 5,
        deviceModel: "AnimeKaergsty Web",
        systemVersion: "1.0.0",
        appVersion: "1.0.0",
        useWSS: true,
    });
}

// Funciones para cargar el contenido de tus canales de Telegram
async function obtenerPortadasDelCanal() {
    console.log("Obteniendo portadas del canal...");
    // Agrega aquí tu lógica para consultar los mensajes/imágenes del canal
}

async function cargarContenidoInicial() {
    console.log("Cargando contenido inicial...");
    // Agrega aquí tu lógica para listar tus videos/reproductor
}

// ==========================================
// 4. LÓGICA DE ARRANQUE AUTOMÁTICO
// ==========================================
if (apiId && apiHash) {
    if (apiCredentialsStep) apiCredentialsStep.classList.add("hidden");
    if (loginMethodsContainer) loginMethodsContainer.classList.remove("hidden");

    inicializarCliente();

    // Si existe una sesión guardada, reconectamos automáticamente sin pedir login
    if (savedSession) {
        console.log("Credenciales y sesión encontradas. Conectando silenciosamente...");

        if (loginSection) loginSection.classList.add("hidden");
        if (videoContainer) videoContainer.classList.remove("hidden");

        client.connect().then(async () => {
            console.log("¡Reconexión exitosa!");
            await obtenerPortadasDelCanal();
            await cargarContenidoInicial();
        }).catch(error => {
            console.error("Error al reconectar. Volviendo al login...", error);
            if (loginSection) loginSection.classList.remove("hidden");
            if (videoContainer) videoContainer.classList.add("hidden");
        });
    }
} else {
    // Si no hay credenciales API guardadas
    console.log("No hay API configurada. Pidiendo credenciales...");
    if (loginSection) loginSection.classList.remove("hidden");
    if (videoContainer) videoContainer.classList.add("hidden");
    if (loginMethodsContainer) loginMethodsContainer.classList.add("hidden");
    if (apiCredentialsStep) apiCredentialsStep.classList.remove("hidden");
}

// ==========================================
// 5. EVENTOS DE INTERACCIÓN DE USUARIO
// ==========================================

// --- PASO A: Guardar API ID y API HASH ---
if (btnSaveApi) {
    btnSaveApi.addEventListener("click", () => {
        const enteredId = inputApiId ? inputApiId.value.trim() : "";
        const enteredHash = inputApiHash ? inputApiHash.value.trim() : "";

        if (!enteredId || !enteredHash) {
            return alert("Debes ingresar tanto el API ID como el API HASH.");
        }

        apiId = enteredId;
        apiHash = enteredHash;
        localStorage.setItem("user_api_id", apiId);
        localStorage.setItem("user_api_hash", apiHash);

        inicializarCliente();

        if (apiCredentialsStep) apiCredentialsStep.classList.add("hidden");
        if (loginMethodsContainer) loginMethodsContainer.classList.remove("hidden");
    });
}

// --- PASO B: Login con Número y Código ---
if (btnSendCode) {
    btnSendCode.addEventListener("click", async () => {
        if (!client) {
            return alert("El cliente de Telegram no se ha inicializado correctamente.");
        }

        const phoneNumber = phoneInput ? phoneInput.value.trim() : "";
        if (!phoneNumber) return alert("Ingresa un número de teléfono válido.");

        btnSendCode.textContent = "Cargando...";
        btnSendCode.disabled = true;

        try {
            await client.start({
                phoneNumber: async () => phoneNumber,

                phoneCode: async () => {
                    if (stepPhone) stepPhone.classList.add("hidden");
                    if (stepCode) stepCode.classList.remove("hidden");

                    return new Promise((resolve) => {
                        if (btnVerifyCode) {
                            btnVerifyCode.onclick = () => {
                                const code = codeInput ? codeInput.value.trim() : "";
                                resolve(code);
                            };
                        }
                    });
                },

                password: async () => {
                    if (stepCode) stepCode.classList.add("hidden");
                    const stepPassword = document.getElementById("step-password");
                    if (stepPassword) stepPassword.classList.remove("hidden");

                    alert("⚠️ El inicio de sesión con Verificación en 2 Pasos (2FA) no está soportado.\n\nPor favor, cambia a la pestaña de 'Código QR' para iniciar sesión.");

                    throw new Error("2FA_NOT_SUPPORTED");
                },

                onError: (err) => {
                    console.error("Error en login:", err);
                    alert("Ocurrió un error: " + err.message);
                },
            });

            console.log("¡Conectado exitosamente!");

            // Guardamos la llave de sesión para no pedir login nuevamente
            localStorage.setItem("telegram_session", client.session.save());

            // Cambio de vistas en la interfaz
            if (loginSection) loginSection.classList.add("hidden");
            if (videoContainer) videoContainer.classList.remove("hidden");

            // Carga de videos/imágenes
            await obtenerPortadasDelCanal();
            await cargarContenidoInicial();

        } catch (error) {
            console.error("Fallo de conexión:", error);
            btnSendCode.textContent = "Enviar Código";
            btnSendCode.disabled = false;
        }
    });
}

// --- PASO C: Cerrar Sesión y Limpieza ---
if (btnLogout) {
    btnLogout.addEventListener("mouseenter", () => {
        btnLogout.style.backgroundColor = "rgba(255, 85, 85, 0.1)";
    });

    btnLogout.addEventListener("mouseleave", () => {
        btnLogout.style.backgroundColor = "transparent";
    });

    btnLogout.addEventListener("click", async () => {
        const confirmar = confirm("¿Estás seguro de que deseas cerrar sesión?");
        if (confirmar) {
            // Borramos todo de la memoria local
            localStorage.removeItem("telegram_session");
            localStorage.removeItem("user_api_id");
            localStorage.removeItem("user_api_hash");

            if (client) {
                try {
                    await client.disconnect();
                } catch (e) {
                    console.error("Error al desconectar:", e);
                }
            }

            window.location.reload();
        }
    });
}