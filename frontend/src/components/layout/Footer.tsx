// ⚠️ ARCHIVO COMPARTIDO ENTRE LOS 9 GRUPOS ⚠️
//
// Igual que el Header: aparece en TODAS las páginas. Se define en
// conjunto entre los 9 grupos y se modifica solo vía Pull Request.
//
// Placeholder funcional mientras se define el diseño final.

export default function Footer() {
  return (
    <footer style={{ padding: "1.5rem 2rem", borderTop: "1px solid #e5e5e5", marginTop: "3rem" }}>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        © {new Date().getFullYear()} Plataforma de Eventos — Proyecto universitario
        {/* TODO (equipo Platform + 9 grupos): definir contenido final */}
      </p>
    </footer>
  );
}
