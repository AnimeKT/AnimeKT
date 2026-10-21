'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTelegram } from '@/context/TelegramContext';

type LoginStep = 'credentials' | 'phone' | 'code';

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('SESSION_PASSWORD_NEEDED')) {
    return 'Tu cuenta requiere una contraseña de verificación en dos pasos, que todavía no está disponible en este flujo.';
  }
  if (message.includes('PHONE_CODE_INVALID')) return 'El código no es correcto. Revísalo e inténtalo de nuevo.';
  if (message.includes('PHONE_CODE_EXPIRED')) return 'El código ha caducado. Solicita uno nuevo.';
  if (message.includes('API_ID_INVALID') || message.includes('API_HASH_INVALID')) {
    return 'El API ID o API HASH no son válidos. Comprueba tus credenciales e inténtalo de nuevo.';
  }
  return message;
}

function isApiCredentialsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /API_(?:ID|HASH)_INVALID/i.test(message);
}

export default function LoginPage() {
  const { isLoading, initClient, sendCode, verifyCode } = useTelegram();
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [codeSentViaApp, setCodeSentViaApp] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    const normalizedApiId = apiId.trim();
    const normalizedApiHash = apiHash.trim();
    if (!/^\d+$/.test(normalizedApiId)) {
      setErrorMessage('El API ID debe contener únicamente números.');
      return;
    }
    if (!/^[a-fA-F0-9]{32}$/.test(normalizedApiHash)) {
      setErrorMessage('El API HASH debe tener exactamente 32 caracteres hexadecimales.');
      return;
    }

    try {
      const alreadyAuthenticated = await initClient(normalizedApiId, normalizedApiHash);
      if (alreadyAuthenticated) router.push('/home');
      else setStep('phone');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const submitPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    try {
      const sentViaApp = await sendCode(phoneNumber);
      setCodeSentViaApp(sentViaApp);
      setStep('code');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      if (isApiCredentialsError(error)) {
        setStep('credentials');
        setApiId('');
        setApiHash('');
      }
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    try {
      await verifyCode(code);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      if (isApiCredentialsError(error)) {
        setStep('credentials');
        setApiId('');
        setApiHash('');
      }
    }
  };

  const inputClassName =
    'h-12 w-full rounded-lg border border-white/10 bg-[#1f2937] px-4 text-white outline-none transition placeholder:text-gray-500 focus:border-primary focus:ring-2 focus:ring-primary/25';
  const buttonClassName =
    'mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light focus-visible:ring-offset-2 focus-visible:ring-offset-[#151720] disabled:cursor-wait disabled:opacity-60';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151720] p-6 shadow-2xl shadow-black/30 sm:p-9">
        <div className="mb-8 text-center">
          <Link href="/" aria-label="AnimeKT" className="text-2xl font-black tracking-tight text-white">
            ANIME<span className="text-primary-light">KT</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-white">
            {step === 'credentials' ? 'Conecta tu cuenta' : 'Inicia sesión en Telegram'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            {step === 'credentials' && 'Introduce tus credenciales de API para comenzar.'}
            {step === 'phone' && 'Indica el número de teléfono asociado a tu cuenta.'}
            {step === 'code' && 'Introduce el código de verificación que te enviamos.'}
          </p>
        </div>

        {errorMessage && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            {errorMessage}
          </p>
        )}

        {step === 'credentials' && (
          <form onSubmit={submitCredentials} className="space-y-5">
            <div>
              <label htmlFor="api-id" className="mb-2 block text-sm font-medium text-gray-200">
                API ID
              </label>
              <input
                id="api-id"
                name="apiId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                value={apiId}
                onChange={(event) => setApiId(event.target.value)}
                placeholder="Ej. 12345678"
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="api-hash" className="mb-2 block text-sm font-medium text-gray-200">
                API HASH
              </label>
              <input
                id="api-hash"
                name="apiHash"
                type="password"
                autoComplete="off"
                required
                value={apiHash}
                onChange={(event) => setApiHash(event.target.value)}
                placeholder="Introduce tu API HASH"
                className={inputClassName}
              />
            </div>
            <button type="submit" disabled={isLoading} className={buttonClassName}>
              {isLoading ? 'Validando...' : 'Continuar'}
            </button>
          </form>
        )}

        {step === 'phone' && (
          <form onSubmit={submitPhone} className="space-y-5">
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-medium text-gray-200">
                Número de teléfono
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+34 600 000 000"
                className={inputClassName}
              />
            </div>
            <button type="submit" disabled={isLoading} className={buttonClassName}>
              {isLoading ? 'Enviando...' : 'Enviar código'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setErrorMessage('');
              }}
              className="w-full py-2 text-sm text-gray-400 transition-colors hover:text-white"
            >
              Cambiar credenciales
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode} className="space-y-5">
            <div>
              <label htmlFor="verification-code" className="mb-2 block text-sm font-medium text-gray-200">
                Código de verificación
              </label>
              <input
                id="verification-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Introduce el código"
                className={inputClassName}
              />
              <p className="mt-2 text-xs text-gray-500">
                {codeSentViaApp
                  ? 'Telegram envió el código a tu aplicación.'
                  : `Código enviado al ${phoneNumber}.`}
              </p>
            </div>
            <button type="submit" disabled={isLoading} className={buttonClassName}>
              {isLoading ? 'Verificando...' : 'Verificar código'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setCode('');
                setErrorMessage('');
              }}
              className="w-full py-2 text-sm text-gray-400 transition-colors hover:text-white"
            >
              Cambiar número
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-500">
          Las credenciales y la sesión se guardan en el almacenamiento local de este navegador.
        </p>
      </section>
    </main>
  );
}
