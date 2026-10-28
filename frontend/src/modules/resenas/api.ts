// ============================================================================
// modules/resenas/api.ts
// ----------------------------------------------------------------------------
// Llamadas del módulo de Reseñas (Grupo 6), a través del API Gateway.
//
// IMPORTANTE: aunque las reseñas se muestran DENTRO de la página de
// detalle de un evento (que pertenece a Catálogo), este archivo usa un
// path distinto (/api/resenas), nunca el de catálogo. El Gateway es quien
// internamente sabe que ese path va al microservicio de Reseñas.
// ============================================================================

import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/resenas";

export async function obtenerResenasDeEvento(eventoId: string) {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/eventos/${eventoId}/resenas`);
  if (!res.ok) throw new Error("Error al obtener las reseñas del evento");
  return res.json();
}

export async function crearResena(eventoId: string, data: unknown) {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/eventos/${eventoId}/resenas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error al crear la reseña");
  return res.json();
}
