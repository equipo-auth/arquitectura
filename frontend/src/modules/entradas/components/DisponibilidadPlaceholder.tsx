// ============================================================================
// modules/entradas/components/DisponibilidadPlaceholder.tsx
// ----------------------------------------------------------------------------
// Grupo 3 — Entradas/Inventario.
//
// Este componente es un RESUMEN chico (solo lectura) pensado para
// insertarse dentro de la página de detalle de un evento, que pertenece a
// Catálogo (Grupo 2) — ver modules/catalogo/components/DetalleEventoPlaceholder.tsx.
//
// Es distinto a una página de gestión completa de entradas: acá solo se
// muestra "cuántas quedan", no se editan ni se venden entradas desde este
// componente. El Grupo 2 solo lo importa y lo posiciona en su página; no
// debe modificar este archivo.
// ============================================================================

export default function DisponibilidadPlaceholder({ eventoId }: { eventoId: string }) {
  return (
    <p>
      <strong>Entradas disponibles:</strong>{" "}
      <em>(reemplazar por el dato real del evento {eventoId})</em>
    </p>
  );
}
