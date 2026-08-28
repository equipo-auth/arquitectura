// ============================================================================
// components/ui/Button.tsx
// ----------------------------------------------------------------------------
// Ejemplo de componente genérico compartido (no pertenece a ningún módulo
// de negocio). Si un grupo necesita un botón, input, card, etc. reutilizable
// por todos, va acá — previa coordinación, igual que header/footer.
// ============================================================================

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

export default function Button({ children, onClick, variant = "primary" }: ButtonProps) {
  const style =
    variant === "primary"
      ? { background: "#111", color: "#fff" }
      : { background: "#eee", color: "#111" };

  return (
    <button
      onClick={onClick}
      style={{ ...style, padding: "0.5rem 1rem", border: "none", borderRadius: 6, cursor: "pointer" }}
    >
      {children}
    </button>
  );
}
