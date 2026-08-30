import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Request } from 'express';
import { RsaKeyService } from './rsa-key.service';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  rol: string;
  token_version: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly rsaKeyService: RsaKeyService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          let token: string | null = null;
          if (req && req.cookies) {
            token = req.cookies['auth_token'] || req.cookies['jwt'] || req.cookies['token'];
          }
          if (!token) {
            token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
          }
          return token;
        },
      ]),
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
        rol: true,
        token_version: true,
        cambio_obligatorio: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('El usuario no existe o fue eliminado');
    }

    // Verificación de revocación de sesión (HU-B8)
    if (user.token_version !== payload.token_version) {
      throw new UnauthorizedException('Sesión invalidada o revocada');
    }

    return user;
  }
}
