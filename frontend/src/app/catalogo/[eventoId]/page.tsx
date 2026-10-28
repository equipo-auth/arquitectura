// Página de detalle de UN evento — GRUPO 2 (Catálogo)
//
// Acá se muestra la info del evento (nombre, fecha, promociones,
// entradas disponibles). El link/sección de reseñas vive en la
// subcarpeta ./resenas — ESE archivo es del Grupo 6, no lo editen.

import DetalleEventoPlaceholder from "@/modules/catalogo/components/DetalleEventoPlaceholder";
import ResenasPlaceholder from "@/modules/resenas/components/ResenasPlaceholder";

// Ejemplo de cómo pueden coexistir Catálogo (Grupo 2) y Reseñas (Grupo 6)
// en la misma página: el Grupo 2 es dueño de este archivo page.tsx y
// decide DÓNDE se posiciona el bloque de reseñas, pero el CONTENIDO de
// ese bloque (ResenasPlaceholder) es 100% del Grupo 6. Si el Grupo 2
// necesita mover o quitar el bloque, es una conversación entre ambos
// grupos, no una edición unilateral del componente del otro.

export default function DetalleEventoPage({
  params,
}: {
  params: { eventoId: string };
}) {
  return (
    <div>
      <DetalleEventoPlaceholder eventoId={params.eventoId} />
      <ResenasPlaceholder eventoId={params.eventoId} />
    </div>
  );
}
