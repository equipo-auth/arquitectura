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
