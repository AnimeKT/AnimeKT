import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// ==========================================
// 1. CAPTURAR ELEMENTOS DE LA INTERFAZ
// ==========================================
const apiCredentialsStep = document.getElementById("api-credentials-step");
const loginMethodsContainer = document.getElementById("login-methods-container");
const inputApiId = document.getElementById("user-api-id");
const inputApiHash = document.getElementById("user-api-hash");
const btnSaveApi = document.getElementById("btn-save-api");

const phoneInput = document.getElementById("phone-input");
const btnSendCode = document.getElementById("btn-send-code");
const stepPhone = document.getElementById("step-phone");
const stepCode = document.getElementById("step-code");
const codeInput = document.getElementById("code-input");
const btnVerifyCode = document.getElementById("btn-verify-code");

const inputsTexto = document.querySelectorAll('input[type="text"], input[type="number"]');

function medirAnchoTexto(texto, fuente) {
    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('2d');
    contexto.font = fuente;
    return contexto.measureText(texto).width;
}

function actualizarChispa(input) {
    const estilos = window.getComputedStyle(input);
    const fuente = `${estilos.fontWeight} ${estilos.fontSize} ${estilos.fontFamily}`;
    const textoHastaCursor = input.value.substring(0, input.selectionStart || 0);
    const anchoTexto = medirAnchoTexto(textoHastaCursor, fuente);
    const desplazamiento = input.scrollLeft;
    const chispa = input.parentElement.querySelector('.portal-spark');
    if (!chispa) return;
    chispa.style.left = `calc(20px + ${anchoTexto - desplazamiento}px)`;
    chispa.classList.remove('activo');
    void chispa.offsetWidth;
    chispa.classList.add('activo');
}

inputsTexto.forEach(input => {
    input.addEventListener('input', function(evento) {
        if (evento.inputType && evento.inputType.startsWith('delete')) {
            return;
        }
        actualizarChispa(this);
    });
});

// ==========================================
// 2. CONFIGURACIÓN Y VARIABLES DE SESIÓN
// ==========================================
let client = null; 

let apiId = localStorage.getItem("user_api_id") || "";
let apiHash = localStorage.getItem("user_api_hash") || "";
const savedSession = localStorage.getItem("telegram_session") || "";
const stringSession = new StringSession(savedSession);

function inicializarCliente() {
    client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
        connectionRetries: 5,
        deviceModel: "AnimeKaergsty Web", 
        systemVersion: "1.0.0",
        appVersion: "1.0.0",
        useWSS: true, 
    });
}

// ==========================================
// 3. ESTADO INICIAL (Redirigir si ya hay sesión)
// ==========================================
if (apiId && apiHash) {
    if (apiCredentialsStep) apiCredentialsStep.classList.add("hidden");
    if (loginMethodsContainer) loginMethodsContainer.classList.remove("hidden");
    
    inicializarCliente();
    
    if (savedSession) {
        console.log("Sesión encontrada. Redirigiendo al Home...");
        window.location.href = "/home.html"; // Nos vamos directo al Home
    }
}

// ==========================================
// 4. LÓGICA DEL BOTÓN: GUARDAR API
// ==========================================
btnSaveApi.addEventListener("click", () => {
    const enteredId = inputApiId.value.trim();
    const enteredHash = inputApiHash.value.trim();

    // 1. Validar que los campos no estén vacíos
    if (!enteredId || !enteredHash) {
        return alert("Debes ingresar API ID y API HASH.");
    }

    // 2. Validar que el API ID contenga SOLAMENTE números
    const esApiIdValido = /^\d+$/.test(enteredId);
    if (!esApiIdValido) {
        return alert("El API ID es inválido. Debe contener solo números.");
    }

    // 3. Validar que el API HASH sea exactamente de 32 caracteres hexadecimales
    const esApiHashValido = /^[a-fA-F0-9]{32}$/.test(enteredHash);
    if (!esApiHashValido) {
        return alert("El API HASH es inválido. Debe tener exactamente 32 caracteres (números y letras de la A a la F).");
    }

    // Si pasa todas las validaciones, procedemos a guardar y avanzar
    apiId = enteredId;
    apiHash = enteredHash;
    localStorage.setItem("user_api_id", apiId);
    localStorage.setItem("user_api_hash", apiHash);

    inicializarCliente();

    // Ocultar paso 1 y mostrar paso 2
    apiCredentialsStep.classList.add("hidden");
    loginMethodsContainer.classList.remove("hidden");
});

// ==========================================
// 5. LÓGICA DE INICIO DE SESIÓN CON NÚMERO
// ==========================================
btnSendCode.addEventListener("click", async () => {
    const phoneNumber = phoneInput.value;
    if (!phoneNumber) return alert("Ingresa un número válido");

    btnSendCode.textContent = "Cargando...";
    btnSendCode.disabled = true;
    
    try {
        await client.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async () => {
                stepPhone.classList.add("hidden");
                stepCode.classList.remove("hidden");
                return new Promise((resolve) => {
                    btnVerifyCode.onclick = () => resolve(codeInput.value);
                });
            },
            password: async () => {
                stepCode.classList.add("hidden");
                document.getElementById("step-password").classList.remove("hidden");
                throw new Error("2FA_NOT_SUPPORTED");
            },
            onError: (err) => {
                console.error("Error en login:", err);
                alert("Ocurrió un error: " + err.message);
            },
        });

        console.log("¡Conectado exitosamente!");
        localStorage.setItem("telegram_session", client.session.save());
        
        // ¡LOGIN EXITOSO! Nos vamos a la página principal
        window.location.href = "/home.html";

    } catch (error) {
        console.error("Fallo de conexión:", error);
        btnSendCode.textContent = "Enviar Código";
        btnSendCode.disabled = false;
    }
});