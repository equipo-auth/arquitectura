"use client";

import { setInitialPassword } from "@/modules/auth/api";
import NewPasswordForm from "./NewPasswordForm";

/** Primer inicio Staff / Organizador (enlace de bienvenida HU-B4 o login HU-F3). */
export default function CrearClaveForm() {
  return (
    <NewPasswordForm
      eyebrow="Acceso administrativo"
      title="Crea tu contraseña"
      description="Define la contraseña con la que ingresarás al sistema de gestión."
      submitLabel="Guardar contraseña"
      successText="Tu contraseña fue creada. Ya puedes iniciar sesión."
      loginHref="/admin/login"
      onSubmit={setInitialPassword}
    />
  );
}
