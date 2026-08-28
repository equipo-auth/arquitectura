// ============================================================================
// modules/catalogo/components/DetalleEventoPlaceholder.tsx
// ----------------------------------------------------------------------------
// Grupo 2 — Detalle de un evento específico dentro del catálogo.
//
// Este componente muestra datos generales del evento y, además, inserta
// tres bloques de OTROS módulos (cada uno responsable de su propio
// contenido y lógica interna):
//   - Disponibilidad de entradas -> modules/entradas/  (Grupo 3)
//   - Promociones activas        -> modules/promociones/ (Grupo 9)
//   - Reseñas del evento         -> ruta anidada /catalogo/[eventoId]/resenas (Grupo 6)
//
// El Grupo 2 decide DÓNDE se posicionan estos bloques en la página; el
// contenido y comportamiento de cada uno es responsabilidad de su propio
// grupo. Ver README.md sección 4/5 para más detalle sobre estas integraciones.
// ============================================================================

import DisponibilidadPlaceholder from "@/modules/entradas/components/DisponibilidadPlaceholder";
import PromocionPlaceholder from "@/modules/promociones/components/PromocionPlaceholder";

export default function DetalleEventoPlaceholder({ eventoId }: { eventoId: string }) {
  return (
    <div>
      <h1>Detalle del evento {eventoId}</h1>
      <p>Información general del evento.</p>
      <p><em>Reemplacen este contenido por el detalle real del evento.</em></p>

      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <DisponibilidadPlaceholder eventoId={eventoId} />
        <PromocionPlaceholder eventoId={eventoId} />
      </div>

      {/* El bloque de Reseñas NO se importa acá: vive en su propia ruta
          anidada /catalogo/[eventoId]/resenas (Grupo 6), no como componente
          embebido, porque incluye un formulario de creación/edición completo. */}
    </div>
  );
}
