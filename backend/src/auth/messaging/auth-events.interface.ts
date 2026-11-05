/** Contrato Auth ↔ Notificaciones v1.0 — Evento 1 */
export interface RecuperacionCuentaEvent {
  Id_usuario: string;
  email_destino: string;
  url: string;
}

/** Contrato Auth ↔ Notificaciones v1.0 — Evento 2 */
export interface CuentaStaffEvent {
  email_destino: string;
  url: string;
}

/** HU-B9: evento posterior a configurar la contraseña en Keycloak. */
export interface StaffActivationEvent {
  Id_usuario: string;
  email_destino: string;
}
