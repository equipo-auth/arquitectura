// ⚠️ ARCHIVO COMPARTIDO ENTRE LOS 9 GRUPOS ⚠️
//
// Este Header aparece en TODAS las páginas de la plataforma.
// NO lo modifiquen por su cuenta desde su módulo: el diseño final
// (logo, links de navegación, estilo) se define en conjunto entre
// los 9 grupos y cualquier cambio se hace vía Pull Request revisado
// por el equipo Platform.
//
// Por ahora este es un placeholder funcional para que puedan probar
// su propia página mientras se define el diseño final del header.

export default function Header() {
  return (
    <header style={{ padding: "1rem 2rem", borderBottom: "1px solid #e5e5e5" }}>
      <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
        <strong>Plataforma de Eventos</strong>
        {/* TODO (equipo Platform + 9 grupos): definir logo y links finales */}
      </nav>
    </header>
  );
}
