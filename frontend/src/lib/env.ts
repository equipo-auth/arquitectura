// ============================================================================
// lib/env.ts
// ----------------------------------------------------------------------------
// El front NO conoce las URLs de los 9 microservicios individuales.
// Solo conoce UNA puerta de entrada: el API Gateway.
//
// El Gateway es responsable de enrutar cada petición al microservicio
// interno correcto (ej. /api/pagos/* -> servicio de Pagos), manejar CORS
// en un solo lugar, y centralizar cosas como autenticación o logging.
//
// El valor real se define en ".env.local" (ver ".env.example").
// ============================================================================

export const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";
