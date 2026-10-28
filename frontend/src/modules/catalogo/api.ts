// ============================================================================
// modules/catalogo/api.ts
// ----------------------------------------------------------------------------
// Llamadas del módulo de Catálogo (Grupo 2), a través del API Gateway.
// Recordatorio de alcance: el catálogo SOLO busca/lista/consulta eventos.
// NO crea, modifica ni elimina eventos (eso es Panel organizador, Grupo 7).
// ============================================================================

import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/catalogo";

export async function buscarEventos(query?: string) {
  const url = query
    ? `${GATEWAY_URL}${BASE_PATH}/eventos?q=${encodeURIComponent(query)}`
    : `${GATEWAY_URL}${BASE_PATH}/eventos`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error al conectar con el módulo de catálogo");
  return res.json();
}

export async function obtenerEventoPorId(eventoId: string) {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/eventos/${eventoId}`);
  if (!res.ok) throw new Error("Error al obtener el evento del catálogo");
  return res.json();
}
