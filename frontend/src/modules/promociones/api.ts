// ============================================================================
// modules/promociones/api.ts
// ----------------------------------------------------------------------------
// Llamadas del módulo de Promociones (Grupo 9), a través del API Gateway.
// ============================================================================

import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/promociones";

// Ejemplo de función — reemplacen/agreguen las que su módulo necesite.
export async function ejemploFetch() {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/`);
  if (!res.ok) {
    throw new Error("Error al conectar con el módulo de promociones a través del Gateway");
  }
  return res.json();
}

// Usada por Catálogo (Grupo 2) para mostrar promociones activas en el
// detalle de un evento. Ver modules/promociones/components/PromocionPlaceholder.tsx
export async function obtenerPromocionesDeEvento(eventoId: string) {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/eventos/${eventoId}/promociones`);
  if (!res.ok) throw new Error("Error al obtener las promociones del evento");
  return res.json();
}
