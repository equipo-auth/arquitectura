import { Suspense } from "react";
import CrearClaveForm from "@/modules/auth/components/CrearClaveForm";

// Primer inicio Staff / Organizador (enlace /crear-clave?token=...)
export default function CrearClavePage() {
  return (
    <Suspense fallback={null}>
      <CrearClaveForm />
    </Suspense>
  );
}
