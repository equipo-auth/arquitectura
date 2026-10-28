// src/auth/rol-contrato.ts
import { UnauthorizedException } from '@nestjs/common';

/** Roles internos válidos en la BD de Auth. */
export const ROLES_INTERNOS = ['COMPRADOR', 'ORGANIZADOR', 'STAFF'] as const;
export type RolInterno = (typeof ROLES_INTERNOS)[number];

/** Roles expuestos en los contratos de integración (Panel, Entradas). */
export type RolContrato = 'usuario' | 'organizador' | 'staff';

const MAPA_ROLES: Record<RolInterno, RolContrato> = {
  COMPRADOR: 'usuario',
  ORGANIZADOR: 'organizador',
  STAFF: 'staff',
};

/** Mapeo estricto. Un rol desconocido invalida la sesión (Fail-Secure). */
export function mapRolContrato(rolInterno: string): RolContrato {
  const rol = MAPA_ROLES[rolInterno as RolInterno];
  if (!rol) {
    throw new UnauthorizedException('Rol de usuario no reconocido');
  }
  return rol;
}
