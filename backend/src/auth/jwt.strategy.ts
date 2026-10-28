// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { RsaKeyService } from './rsa-key.service';
import { PrismaService } from '../prisma/prisma.service';

/** Nombre único de la cookie de sesión (Contratos Panel v1.1 / Entradas v3.0). */
export const SESSION_COOKIE = 'jwt';

export interface JwtPayload {
  sub: string;
  rol: string;
  token_version: number;
  iat?: number;
  exp?: number;
}

/** Usuario que queda en req.user tras validar la sesión. */
export interface SessionUser {
  uuid: string;
  email: string;
  nombre: string;
  rut: string;
  rol: string;
  token_version: number;
}

/** Lee el JWT exclusivamente desde la cookie `jwt`. */
export const extractJwtFromCookie = (req: Request): string | null => {
  const cookies = req?.cookies as Record<string, string> | undefined;
  const token = cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly rsaKeyService: RsaKeyService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractJwtFromCookie,
      ignoreExpiration: false,
      secretOrKey: rsaKeyService.getPublicKey(),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<SessionUser> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    // Única consulta a BD por validación: se trae el perfil completo para
    // responder la introspección sin un segundo query (SLA < 200 ms).
    const user = await this.prisma.user.findUnique({
      where: { uuid: payload.sub },
      select: {
        uuid: true,
        email: true,
        nombre: true,
        rut: true,
        rol: true,
        token_version: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('El usuario no existe o fue eliminado');
    }

    // Verificación de revocación de sesión (HU-B5 / HU-B8)
    if (user.token_version !== payload.token_version) {
      throw new UnauthorizedException('Sesión invalidada o revocada');
    }

    return user;
  }
}
