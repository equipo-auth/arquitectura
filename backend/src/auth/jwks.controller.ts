import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RsaKeyService } from './rsa-key.service';

/** HU-B7: solo claves públicas. El secret/llave privada jamás abandona el servidor. */
@ApiTags('Llaves públicas')
@SkipThrottle()
@Controller()
export class JwksController {
  constructor(private readonly rsa: RsaKeyService) {}

  @Get(['.well-known/jwks.json', 'api/auth/.well-known/jwks.json'])
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'HU-B7: JWKS público para verificar firmas RS256' })
  @ApiResponse({ status: 200, description: 'JWK actual y opcionalmente anterior durante gracia de rotación' })
  getJwks() { return { keys: this.rsa.getPublishedPublicKeys().map(({ jwk }) => jwk) }; }
}
