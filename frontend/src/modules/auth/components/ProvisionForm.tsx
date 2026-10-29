"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthApiError,
  ProvisionResult,
  getSession,
  provisionAccount,
} from "@/modules/auth/api";
import { isValidEmail } from "@/modules/auth/validators";
import styles from "./AuthPlaceholder.module.css";

type Status = "checking" | "allowed" | "denied";

/** HU-B4: reflejar una cuenta creada MANUALMENTE en Keycloak por el ADMIN. */
export default function ProvisionForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    getSession().then((session) => {
      if (!session) return router.replace("/admin/login");
      setStatus(session.usuario.rol.toUpperCase() === "ADMIN" ? "allowed" : "denied");
    }).catch(() => setStatus("denied"));
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setError("Ingresa un email válido.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await provisionAccount({ email: normalized });
      setResult(response);
      setEmail("");
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof AuthApiError ? err.message : "No se pudo sincronizar la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") return <section className={styles.page}><div className={styles.card}><p>Validando sesión...</p></div></section>;
  if (status === "denied") return <section className={styles.page}><div className={styles.card}><p>No tienes permisos para sincronizar cuentas.</p></div></section>;

  return (
    <section className={styles.page} aria-labelledby="provision-title">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>Administración</p>
          <h1 id="provision-title">Sincronizar usuario de Keycloak</h1>
          <p>Primero crea el usuario en la consola de Keycloak, asigna el realm role STAFF u ORGANIZADOR y completa nombre y atributo rut. Luego ingresa su correo aquí para crear el espejo en PostgreSQL y publicar la invitación.</p>
        </div>
        {error && <div className={`${styles.alert} ${styles.alertError}`} role="alert">{error}</div>}
        {result && (
          <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
            Cuenta {result.user.rol} sincronizada: {result.user.email} (UUID {result.user.uuid}).
            <ul className={styles.details}>
              <li>Evento cuenta_staff: {result.notificacion.publicada ? "publicado" : "no publicado; solicitar reenvío interno"}</li>
              <li>Invitación válida hasta: {new Date(result.notificacion.enlace_expira_en).toLocaleString("es-CL")}</li>
            </ul>
          </div>
        )}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="prov-email">Correo electrónico creado en Keycloak</label>
            <input className={styles.input} id="prov-email" type="email" name="email"
              autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? "Sincronizando..." : "Sincronizar y enviar invitación"}
          </button>
        </form>
      </div>
    </section>
  );
}
