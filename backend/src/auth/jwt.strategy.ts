import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Request } from 'express';
import { RsaKeyService } from './rsa-key.service'; // <-- Ruta corregida
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  rol: string;
  token_version: number;
  iat?: number;
  exp?: number;
}
export interface SessionUser {
  uuid: string;
  email: string;
  nombre: string;
  rut: string;
  rol: string;
  token_version: number;
}
/** La introspección contractual solo acepta la cookie HttpOnly "jwt". */
export const extractJwtFromCookie = (req: Request): string | null => {
  const value = req?.cookies?.['jwt'];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly rsaKeyService: RsaKeyService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromCookie]),
      ignoreExpiration: false,
      secretOrKey: rsaKeyService.getPublicKey(),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { uuid: payload.sub },
      select: {
        uuid: true,
        email: true,
        nombre: true,
        rut: true,
        rol: true,
        token_version: true,
        cambio_obligatorio: true,
        activo: true,
      },
    });

    if (!user || user.activo === false) {
      throw new UnauthorizedException('El usuario no existe o fue deshabilitado');
    }

    // Una cuenta administrativa sin activación completa no puede operar con JWT.
    if (user.rol !== 'COMPRADOR' && user.cambio_obligatorio === true) {
      throw new UnauthorizedException('Cuenta administrativa pendiente de activación');
    }

    // Verificación de revocación de sesión (HU-B8)
    if (user.token_version !== payload.token_version) {
      throw new UnauthorizedException('Sesión invalidada o revocada');
    }

    return user;
  }
}
