// ============================================================================
// modules/promociones/components/PromocionPlaceholder.tsx
// ----------------------------------------------------------------------------
// Grupo 9 — Promociones.
//
// Igual que DisponibilidadPlaceholder de Entradas: es un RESUMEN chico de
// solo lectura, pensado para insertarse dentro de la página de detalle de
// un evento (Catálogo, Grupo 2) — no es la interfaz completa de gestión
// de promociones (crear/editar/eliminar), que vive en su propia ruta
// /promociones. El Grupo 2 solo lo importa y lo posiciona; no debe
// modificar este archivo.
// ============================================================================

export default function PromocionPlaceholder({ eventoId }: { eventoId: string }) {
  return (
    <p>
      <strong>Promociones activas:</strong>{" "}
      <em>(reemplazar por las promociones reales del evento {eventoId})</em>
    </p>
  );
}
