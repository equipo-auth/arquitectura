import { BadRequestException } from '@nestjs/common';

/** Forma de cálculo: sin puntos, con guion y DV en mayúscula. */
export function normalizeRut(value: string): string {
  return (value || '').replace(/[.\s]/g, '').toUpperCase();
}

export function validRut(value: string): boolean {
  const rut = normalizeRut(value);
  if (!/^\d{7,8}-[0-9K]$/.test(rut)) return false;
  const [body, digit] = rut.split('-');
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result);
  return digit === expected;
}

/** Formato contractual y de persistencia: 12.345.678-5 / 1.234.567-K. */
export function formatRut(value: string): string {
  const canonical = normalizeRut(value);
  const match = canonical.match(/^(\d{7,8})-([0-9K])$/);
  if (!match) {
    throw new BadRequestException('RUT inválido: verifique formato y dígito verificador');
  }
  const body = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${match[2]}`;
}

export function assertValidRut(value: string): string {
  if (!validRut(value)) {
    throw new BadRequestException('RUT inválido: verifique formato y dígito verificador');
  }
  return formatRut(value);
}
