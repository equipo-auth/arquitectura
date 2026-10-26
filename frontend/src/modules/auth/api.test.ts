import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthApiError,
  loginAdmin,
  provisionAccount,
  registerBuyer,
  requestPasswordRecovery,
  resetPassword,
  setInitialPassword,
  validateResetToken,
} from "./api";

const fetchMock = vi.fn();

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function lastBody() {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("HU-F1: registerBuyer", () => {
  const payload = {
    rut: "12.345.678-5",
    email: "n@t.cl",
    password: "password123",
    nombre: "N",
  };

  it("envía el registro al endpoint correcto con credentials include", async () => {
    respond(201, { message: "ok", user: { email: payload.email } });
    await expect(registerBuyer(payload)).resolves.toMatchObject({
      message: "ok",
      user: { email: payload.email },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/register$/);
    expect((init as RequestInit).credentials).toBe("include");
    expect(lastBody()).toEqual(payload);
  });

  it("muestra la validación del backend si la contraseña es demasiado corta", async () => {
    respond(400, { message: ["La contraseña debe tener al menos 8 caracteres"] });
    await expect(registerBuyer({ ...payload, password: "123456" })).rejects.toMatchObject({
      status: 400,
      message: "La contraseña debe tener al menos 8 caracteres",
    });
  });
});

describe("HU-F3: loginAdmin", () => {
  it("envía admin=true y credentials include", async () => {
    respond(200, { message: "ok" });
    await expect(loginAdmin({ email: "s@t.cl", password: "x" })).resolves.toEqual({ kind: "ok" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/login$/);
    expect((init as RequestInit).credentials).toBe("include");
    expect(lastBody()).toEqual({ email: "s@t.cl", password: "x", admin: true });
  });

  it("intercepta el primer inicio (primer_inicio=true)", async () => {
    respond(403, { primer_inicio: true, action: "REDIRECT", url: "/crear-clave?token=abc" });
    await expect(loginAdmin({ email: "n@t.cl", password: "x" })).resolves.toEqual({
      kind: "password_change",
      url: "/crear-clave?token=abc",
    });
  });

  it("rechaza con 403 una cuenta de comprador", async () => {
    respond(403, { message: "Acceso no autorizado" });
    await expect(loginAdmin({ email: "c@t.cl", password: "x" })).rejects.toMatchObject({
      status: 403,
      message: "Acceso no autorizado para esta área.",
    });
  });

  it("muestra solo 'Credenciales inválidas' en 401", async () => {
    respond(401);
    await expect(loginAdmin({ email: "c@t.cl", password: "x" })).rejects.toMatchObject({
      status: 401,
      message: "Credenciales inválidas",
    });
  });

  it("propaga 429 para bloquear el botón", async () => {
    respond(429);
    const error = await loginAdmin({ email: "c@t.cl", password: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(AuthApiError);
    expect(error.status).toBe(429);
  });
});

describe("HU-F4: recuperación", () => {
  it("la solicitud nunca falla, aunque el backend o la red fallen", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(requestPasswordRecovery("a@t.cl")).resolves.toBeUndefined();
  });

  it("valida el enlace al abrir la página", async () => {
    respond(200, { valido: true });
    await expect(validateResetToken("abc")).resolves.toBe(true);
    expect(lastBody()).toEqual({ token: "abc" });

    respond(401);
    await expect(validateResetToken("viejo")).resolves.toBe(false);
  });

  it("restablecer envía nueva_clave y muestra error genérico en 401/410", async () => {
    respond(410);
    await expect(resetPassword("t", "password123")).rejects.toMatchObject({
      message: "El enlace no es válido. Solicita uno nuevo.",
    });
    expect(lastBody()).toEqual({ token: "t", nueva_clave: "password123" });
  });

  it("crear clave usa /update-password con newPassword", async () => {
    respond(200);
    await setInitialPassword("t", "password123");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/update-password$/);
    expect(lastBody()).toEqual({ token: "t", newPassword: "password123" });
  });
});

describe("HU-B4: provisionAccount", () => {
  const payload = { rut: "12.345.678-5", email: "n@t.cl", nombre: "N", rol: "STAFF" as const };

  it("mapea 403 y 409 a mensajes claros", async () => {
    respond(403);
    await expect(provisionAccount(payload)).rejects.toMatchObject({ status: 403 });
    respond(409);
    await expect(provisionAccount(payload)).rejects.toMatchObject({
      status: 409,
      message: "Los datos ingresados ya se encuentran registrados.",
    });
  });
});
