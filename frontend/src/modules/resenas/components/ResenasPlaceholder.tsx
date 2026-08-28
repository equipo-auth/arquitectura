// ============================================================================
// modules/resenas/components/ResenasPlaceholder.tsx
// ----------------------------------------------------------------------------
// Grupo 6 — Reseñas de un evento (crear, modificar, eliminar).
//
// Este componente se muestra DENTRO de la página de detalle de un evento
// (que pertenece a Catálogo, Grupo 2), pero la lógica y el estado de este
// componente son 100% responsabilidad del Grupo 6. El Grupo 2 solo lo
// importa y lo posiciona en su página — no debe modificar este archivo.
// ============================================================================

export default function ResenasPlaceholder({ eventoId }: { eventoId: string }) {
  return (
    <section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px dashed #ccc" }}>
      <h2>Reseñas del evento {eventoId}</h2>
      <p><em>Reemplacen este contenido por el listado y formulario real de reseñas.</em></p>
    </section>
  );
}
