// ============================================================================
// modules/organizador/api.ts
// ----------------------------------------------------------------------------
// Todas las llamadas de este módulo pasan por el API Gateway, nunca
// directo al microservicio de organizador. El Gateway es quien enruta
// internamente la petición al servicio correcto según el path.
// ============================================================================

import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/organizador";

// Ejemplo de función — reemplacen/agreguen las que su módulo necesite.
export async function ejemploFetch() {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/`);
  if (!res.ok) {
    throw new Error("Error al conectar con el módulo de organizador a través del Gateway");
  }
  return res.json();
}
