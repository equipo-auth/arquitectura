// Página de "Reseñas" de un evento — GRUPO 6
//
// ⚠️ IMPORTANTE: esta ruta vive DENTRO de la carpeta de Catálogo
// (app/catalogo/[eventoId]/resenas/) porque las reseñas pertenecen
// a un evento específico. Esto es solo la RUTA — la lógica y los
// componentes de reseñas NO van acá adentro, van en:
//
//     src/modules/resenas/
//
// Este archivo debe quedar corto: solo importa y usa componentes
// desde su propia carpeta de módulo. NO toquen nada fuera de
// src/app/catalogo/[eventoId]/resenas/ y src/modules/resenas/.

import ResenasPlaceholder from "@/modules/resenas/components/ResenasPlaceholder";

// Nota: esta sub-ruta (/catalogo/[eventoId]/resenas) es una página completa
// aparte, útil si en algún momento quieren una vista de "todas las reseñas"
// separada del detalle del evento. En el caso más común (reseñas mostradas
// directo en el detalle del evento) usarán el mismo componente
// ResenasPlaceholder importado en app/catalogo/[eventoId]/page.tsx — ver ese
// archivo para el ejemplo de composición.

export default function ResenasPage({
  params,
}: {
  params: { eventoId: string };
}) {
  return <ResenasPlaceholder eventoId={params.eventoId} />;
}
