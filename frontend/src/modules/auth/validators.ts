export function normalizeRut(value: string) {
  return value.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

export function isValidRut(value: string) {
  const normalized = normalizeRut(value);
  if (!/^\d{7,8}-[0-9K]$/.test(normalized)) return false;

  const [body, verifier] = normalized.split("-");
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const result = 11 - (sum % 11);
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return verifier === expected;
}

export function formatRut(value: string) {
  const cleaned = value.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (cleaned.length <= 1) return cleaned;

  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${verifier}`;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Misma política que el registro (HU-F1) y el backend: mínimo 8 caracteres. */
export const PASSWORD_MIN_LENGTH = 8;

export function validateNewPassword(password: string, confirmation: string) {
  const errors: Record<string, string> = {};
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password !== confirmation) {
    errors.confirmation = "Las contraseñas no coinciden.";
  }
  return errors;
}

/** Destino posterior al login administrativo (HU-F3). */
export function homeForRole(rol: string) {
  // Acepta el rol del contrato ("organizador", "staff") o el interno.
  switch (rol.toUpperCase()) {
    case "ORGANIZADOR":
      return "/organizador";
    case "STAFF":
      return "/checkin";
    default:
      return null;
  }
}
