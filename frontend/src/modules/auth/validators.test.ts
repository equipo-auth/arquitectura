import { describe, expect, it } from "vitest";
import {
  formatRut,
  homeForRole,
  isValidEmail,
  isValidRut,
  validateNewPassword,
} from "./validators";

describe("validators", () => {
  it("HU-F1: valida el dígito verificador del RUT", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("abc")).toBe(false);
  });

  it("formatea el RUT mientras se escribe", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });

  it("HU-F1: rechaza emails mal formados", () => {
    expect(isValidEmail("a@b.cl")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("HU-F4: aplica la misma política de contraseñas del registro", () => {
    expect(validateNewPassword("corta", "corta").password).toBeDefined();
    expect(validateNewPassword("password123", "otra").confirmation).toBeDefined();
    expect(validateNewPassword("password123", "password123")).toEqual({});
  });

  it("HU-F3: redirige según rol y rechaza compradores", () => {
    expect(homeForRole("STAFF")).toBe("/checkin");
    expect(homeForRole("ORGANIZADOR")).toBe("/organizador");
    expect(homeForRole("staff")).toBe("/checkin");
    expect(homeForRole("usuario")).toBeNull();
    expect(homeForRole("ADMIN")).toBeNull();
  });
});
