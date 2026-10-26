"use client";

import { resetPassword } from "@/modules/auth/api";
import NewPasswordForm from "./NewPasswordForm";

/** HU-F4: restablecimiento para compradores. */
export default function RestablecerForm() {
  return (
    <NewPasswordForm
      eyebrow="Recuperación de cuenta"
      title="Restablecer contraseña"
      description="Ingresa tu nueva contraseña."
      submitLabel="Restablecer contraseña"
      successText="Tu contraseña fue actualizada. Por seguridad, se cerraron todas tus sesiones activas."
      loginHref="/auth"
      onSubmit={resetPassword}
    />
  );
}
