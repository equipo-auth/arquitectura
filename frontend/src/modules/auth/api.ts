// ============================================================================
// modules/auth/api.ts
// ----------------------------------------------------------------------------
// HU-F1 / HU-F2. Todas las llamadas salen por el API Gateway.
// La sesión viaja como cookie HttpOnly administrada por el navegador; el
// frontend nunca intenta leer, guardar ni decodificar el JWT.
// ============================================================================

import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/auth";

export type RegisterPayload = {
  rut: string;
  email: string;
  password: string;
  nombre: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthUser = {
  uuid: string;
  nombre: string;
  email: string;
  rol: string;
  cambio_obligatorio?: boolean;
};

export class AuthApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

function assertSecureGateway() {
  // En producción las credenciales solo deben viajar por HTTPS.
  // Se permite HTTP exclusivamente para localhost durante desarrollo local.
  const url = new URL(GATEWAY_URL);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

  if (url.protocol !== "https:" && !isLocal) {
    throw new AuthApiError(
      0,
      "Configuración insegura: el Gateway debe utilizar HTTPS.",
    );
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message[0] ?? fallback;
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function registerBuyer(payload: RegisterPayload) {
  assertSecureGateway();

  const response = await fetch(`${GATEWAY_URL}${BASE_PATH}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // HU-F1 exige no revelar si la colisión fue de RUT o email.
    if (response.status === 409) {
      throw new AuthApiError(
        409,
        "No fue posible completar el registro con los datos ingresados.",
      );
    }

    const message = await readErrorMessage(
      response,
      "No fue posible completar el registro. Intenta nuevamente.",
    );
    throw new AuthApiError(response.status, message);
  }

  return response.json() as Promise<{
    message: string;
    user: AuthUser;
  }>;
}

export async function loginBuyer(payload: LoginPayload) {
  assertSecureGateway();

  const response = await fetch(`${GATEWAY_URL}${BASE_PATH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Texto exacto solicitado por HU-F2.
      throw new AuthApiError(401, "Credenciales inválidas");
    }

    if (response.status === 429) {
      throw new AuthApiError(
        429,
        "Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.",
      );
    }

    const message = await readErrorMessage(
      response,
      "No fue posible iniciar sesión. Intenta nuevamente.",
    );
    throw new AuthApiError(response.status, message);
  }

  // No se lee ninguna cookie ni token desde JavaScript. El navegador conserva
  // la cookie HttpOnly entregada por el backend gracias a credentials: include.
  return response.json() as Promise<{
    message: string;
    user: AuthUser;
  }>;
}
