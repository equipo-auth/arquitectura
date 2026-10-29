import { BadRequestException } from '@nestjs/common';
import { assertValidRut, formatRut, normalizeRut, validRut } from './rut';

describe('RUT contractual con puntos', () => {
  it.each([
    ['12345678-5', '12.345.678-5'],
    ['12.345.678-5', '12.345.678-5'],
    [' 12 345 678 - 5 ', '12.345.678-5'],
    ['11111111-1', '11.111.111-1'],
  ])('normaliza %s como %s', (input, output) => {
    expect(assertValidRut(input)).toBe(output);
  });
  it('admite 7 dígitos y K mayúscula', () => {
    expect(formatRut('1234567-k')).toBe('1.234.567-K');
  });
  it('conserva cálculo sin puntos para validar DV', () => {
    expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
    expect(validRut('12.345.678-5')).toBe(true);
  });
  it.each(['12.345.678-0', '', 'abc', '12345678-9'])('rechaza RUT inválido %s', (value) => {
    expect(() => assertValidRut(value)).toThrow(BadRequestException);
  });
});
