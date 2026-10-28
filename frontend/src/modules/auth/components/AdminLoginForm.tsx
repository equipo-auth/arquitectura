"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthApiError, getSession, loginAdmin, logout } from "@/modules/auth/api";
import { homeForRole, isValidEmail } from "@/modules/auth/validators";
import styles from "./AuthPlaceholder.module.css";

/** HU-F3: login exclusivo para Organizador / Staff / Admin en /admin/login. */
export default function AdminLoginForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const nextErrors: Record<string, string> = {};
    if (!isValidEmail(email)) nextErrors.email = "Ingresa un email válido.";
    if (!password) nextErrors.password = "Ingresa tu contraseña.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await loginAdmin({ email, password });

      // Primer inicio: se retiene el acceso al panel y se fuerza el cambio de clave.
      if (result.kind === "password_change") {
        router.replace(result.url);
        return;
      }

      // Se consulta el rol con la cookie recién emitida (HU-B6).
      const session = await getSession();
      const destino = session ? homeForRole(session.usuario.rol) : null;

      if (!destino) {
        // Defensa adicional: rol desconocido → se rechaza y se destruye la cookie.
        await logout();
        setMessage("Acceso no autorizado para esta área.");
        return;
      }

      router.replace(destino);
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 429) {
        setRateLimited(true);
      }
      setMessage(
        error instanceof AuthApiError
          ? error.message
          : "No fue posible iniciar sesión. Intenta nuevamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page} aria-labelledby="admin-login-title">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>Acceso administrativo</p>
          <h1 id="admin-login-title">Organizadores y Staff</h1>
          <p>Ingresa con la cuenta entregada por la plataforma.</p>
        </div>

        {message && (
          <div className={`${styles.alert} ${styles.alertError}`} role="status">
            {message}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="admin-email">Correo electrónico</label>
            <input
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="nombre@ticketu.cl"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "admin-email-error" : undefined}
            />
            {errors.email && (
              <span className={styles.errorText} id="admin-email-error">
                {errors.email}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="admin-password">Contraseña</label>
            <input
              className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "admin-password-error" : undefined}
            />
            {errors.password && (
              <span className={styles.errorText} id="admin-password-error">
                {errors.password}
              </span>
            )}
          </div>

          <p className={styles.linkRow}>
            <Link className={styles.link} href="/recuperar">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>

          <button className={styles.submit} type="submit" disabled={submitting || rateLimited}>
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </section>
  );
}
