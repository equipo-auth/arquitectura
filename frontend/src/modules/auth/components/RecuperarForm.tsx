"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { requestPasswordRecovery } from "@/modules/auth/api";
import { isValidEmail } from "@/modules/auth/validators";
import styles from "./AuthPlaceholder.module.css";

const GENERIC_CONFIRMATION =
  "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";

/** HU-F4: solicitud de recuperación con respuesta siempre genérica. */
export default function RecuperarForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();

    if (!isValidEmail(email)) {
      setError("Ingresa un email válido.");
      return;
    }
    setError(null);
    setSubmitting(true);
    await requestPasswordRecovery(email);
    setSubmitting(false);
    setSent(true);
  }

  return (
    <section className={styles.page} aria-labelledby="recover-title">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>Recuperación de cuenta</p>
          <h1 id="recover-title">¿Olvidaste tu contraseña?</h1>
          <p>Te enviaremos un enlace para crear una nueva.</p>
        </div>

        {sent ? (
          <>
            <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
              {GENERIC_CONFIRMATION}
            </div>
            <p className={styles.switchText}>
              <Link className={styles.link} href="/auth">
                Volver a iniciar sesión
              </Link>
            </p>
          </>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="recover-email">Correo electrónico</label>
              <input
                className={`${styles.input} ${error ? styles.inputError : ""}`}
                id="recover-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="correo@ejemplo.cl"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "recover-email-error" : undefined}
              />
              {error && (
                <span className={styles.errorText} id="recover-email-error">
                  {error}
                </span>
              )}
            </div>

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar enlace"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
