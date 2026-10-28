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

// ============================================================================
// Sprint 2: HU-F3 (login administrativo), HU-F4 (recuperación),
// /crear-clave (HU-B4 / HU-B9) y provisión de cuentas (HU-B4).
// ============================================================================

export type SessionProfile = {
  valido: boolean;
  usuario: {
    id_usuario: string;
    nombre_completo: string;
    rut: string;
    correo_electronico: string;
    rol: string;
  };
};

export type AdminLoginResult =
  | { kind: "ok" }
  | { kind: "password_change"; url: string };

const GENERIC_LINK_ERROR = "El enlace no es válido. Solicita uno nuevo.";

function postJson(path: string, body?: unknown) {
  assertSecureGateway();
  return fetch(`${GATEWAY_URL}${BASE_PATH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** HU-F3: mismo endpoint de login, distinto manejo de la respuesta. */
export async function loginAdmin(payload: LoginPayload): Promise<AdminLoginResult> {
  // admin: true → el backend responde 403 si la cuenta no es ORGANIZADOR/STAFF.
  const response = await postJson("/login", { ...payload, admin: true });

  if (response.status === 403) {
    // Primer inicio: 403 + primer_inicio=true + url /crear-clave?token=...
    const body = (await response.json().catch(() => ({}))) as {
      primer_inicio?: boolean;
      url?: string;
    };
    if (body.primer_inicio === true && body.url) {
      return { kind: "password_change", url: body.url };
    }
    // Cuenta de comprador en el portal administrativo.
    throw new AuthApiError(403, "Acceso no autorizado para esta área.");
  }

  if (response.status === 401) {
    throw new AuthApiError(401, "Credenciales inválidas");
  }

  if (response.status === 429) {
    throw new AuthApiError(
      429,
      "Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.",
    );
  }

  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      "No fue posible iniciar sesión. Intenta nuevamente.",
    );
  }

  return { kind: "ok" };
}

/** HU-B6: la cookie HttpOnly viaja sola; el front solo lee el perfil normalizado. */
export async function getSession(): Promise<SessionProfile | null> {
  assertSecureGateway();
  const response = await fetch(`${GATEWAY_URL}${BASE_PATH}/validar-sesion`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new AuthApiError(response.status, "No fue posible validar la sesión.");
  }
  return response.json() as Promise<SessionProfile>;
}

/** HU-B3 */
export async function logout() {
  await postJson("/logout").catch(() => undefined);
}

/** HU-F4: siempre devuelve el mismo mensaje, exista o no el correo. */
export async function requestPasswordRecovery(email: string) {
  try {
    await postJson("/recover", { email });
  } catch {
    // Se ignora a propósito: la respuesta visible es siempre la misma.
  }
}

/** HU-F4: valida el enlace al abrir la página, sin consumir el token. */
export async function validateResetToken(token: string): Promise<boolean> {
  try {
    const response = await postJson("/validar-token", { token });
    return response.ok;
  } catch {
    return false;
  }
}

/** HU-F4: compradores (POST /reset-password). */
export async function resetPassword(token: string, nuevaClave: string) {
  const response = await postJson("/reset-password", {
    token,
    nueva_clave: nuevaClave,
  });
  if (response.status === 429) {
    throw new AuthApiError(429, "Demasiados intentos. Espera unos minutos.");
  }
  if (!response.ok) {
    // 400/401/410: error genérico sin revelar el motivo.
    throw new AuthApiError(response.status, GENERIC_LINK_ERROR);
  }
}

/** Primer inicio Staff/Organizador (POST /update-password → Keycloak). */
export async function setInitialPassword(token: string, newPassword: string) {
  const response = await postJson("/update-password", { token, newPassword });
  if (response.status === 429) {
    throw new AuthApiError(429, "Demasiados intentos. Espera unos minutos.");
  }
  if (!response.ok) {
    throw new AuthApiError(response.status, GENERIC_LINK_ERROR);
  }
}
