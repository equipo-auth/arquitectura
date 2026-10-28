// ============================================================================
// modules/entradas/api.ts
// ----------------------------------------------------------------------------
// Llamadas del módulo de Entradas/Inventario (Grupo 3), a través del API Gateway.
// ============================================================================

import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/entradas";

// Ejemplo de función — reemplacen/agreguen las que su módulo necesite.
export async function ejemploFetch() {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/`);
  if (!res.ok) {
    throw new Error("Error al conectar con el módulo de entradas a través del Gateway");
  }
  return res.json();
}

// Usada por Catálogo (Grupo 2) para mostrar disponibilidad en el detalle
// de un evento. Ver modules/entradas/components/DisponibilidadPlaceholder.tsx
export async function obtenerDisponibilidad(eventoId: string) {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/eventos/${eventoId}/disponibilidad`);
  if (!res.ok) throw new Error("Error al obtener la disponibilidad de entradas");
  return res.json();
}
