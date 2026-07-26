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
const loginSection = document.getElementById("login-section");

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

    if (!enteredId || !enteredHash) return alert("Debes ingresar API ID y API HASH.");

    apiId = enteredId;
    apiHash = enteredHash;
    localStorage.setItem("user_api_id", apiId);
    localStorage.setItem("user_api_hash", apiHash);

    inicializarCliente();

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