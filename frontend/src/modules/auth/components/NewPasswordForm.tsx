"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthApiError, validateResetToken } from "@/modules/auth/api";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@/modules/auth/validators";
import styles from "./AuthPlaceholder.module.css";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  submitLabel: string;
  successText: string;
  loginHref: string;
  onSubmit: (token: string, password: string) => Promise<void>;
};

const INVALID_LINK = "El enlace no es válido. Solicita uno nuevo.";

/**
 * Formulario reutilizable para definir una nueva contraseña a partir de un
 * token de un solo uso recibido por correo (/crear-clave y /restablecer).
 */
export default function NewPasswordForm({
  eyebrow,
  title,
  description,
  submitLabel,
  successText,
  loginHref,
  onSubmit,
}: Props) {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const value = searchParams.get("token");
    if (!value) {
      setMessage({ kind: "error", text: INVALID_LINK });
      setChecking(false);
      return;
    }
    // Quita el token de la barra de direcciones e historial.
    window.history.replaceState(null, "", window.location.pathname);

    // HU-F4: el enlace expirado o usado se informa al abrir la página.
    let active = true;
    validateResetToken(value).then((valido) => {
      if (!active) return;
      if (valido) {
        setToken(value);
      } else {
        setMessage({ kind: "error", text: INVALID_LINK });
      }
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    const nextErrors = validateNewPassword(password, confirmation);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(token, password);
      setDone(true);
      setMessage({ kind: "success", text: successText });
    } catch (error) {
      const text = error instanceof AuthApiError ? error.message : INVALID_LINK;
      setMessage({ kind: "error", text });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page} aria-labelledby="new-password-title">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id="new-password-title">{title}</h1>
          <p>{description}</p>
        </div>

        {message && (
          <div
            className={`${styles.alert} ${
              message.kind === "success" ? styles.alertSuccess : styles.alertError
            }`}
            role="status"
          >
            {message.text}
          </div>
        )}

        {checking ? (
          <p className={styles.helper}>Validando enlace...</p>
        ) : done || !token ? (
          <p className={styles.switchText}>
            <Link className={styles.link} href={done ? loginHref : "/recuperar"}>
              {done ? "Ir a iniciar sesión" : "Solicitar un nuevo enlace"}
            </Link>
          </p>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="new-password">Nueva contraseña</label>
              <input
                className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby="new-password-help"
              />
              <span
                className={errors.password ? styles.errorText : styles.helper}
                id="new-password-help"
              >
                {errors.password ?? `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
              </span>
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-password">Confirmar contraseña</label>
              <input
                className={`${styles.input} ${errors.confirmation ? styles.inputError : ""}`}
                id="confirm-password"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmation)}
                aria-describedby={errors.confirmation ? "confirm-password-error" : undefined}
              />
              {errors.confirmation && (
                <span className={styles.errorText} id="confirm-password-error">
                  {errors.confirmation}
                </span>
              )}
            </div>

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
