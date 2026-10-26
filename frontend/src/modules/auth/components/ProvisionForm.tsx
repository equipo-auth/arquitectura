"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthApiError,
  ProvisionResult,
  getSession,
  provisionAccount,
} from "@/modules/auth/api";
import { formatRut, isValidEmail, isValidRut } from "@/modules/auth/validators";
import styles from "./AuthPlaceholder.module.css";

type Status = "checking" | "allowed" | "denied";

/** HU-B4: formulario del ADMIN para crear cuentas ORGANIZADOR / STAFF. */
export default function ProvisionForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rutValue, setRutValue] = useState("");

  useEffect(() => {
    getSession()
      .then((session) => {
        if (!session) {
          router.replace("/admin/login");
          return;
        }
        setStatus(session.usuario.rol.toUpperCase() === "ADMIN" ? "allowed" : "denied");
      })
      .catch(() => setStatus("denied"));
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nombre = String(formData.get("nombre") ?? "").trim();
    const rut = String(formData.get("rut") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const rol = String(formData.get("rol") ?? "") as "ORGANIZADOR" | "STAFF";

    const nextErrors: Record<string, string> = {};
    if (!nombre) nextErrors.nombre = "Ingresa el nombre.";
    if (!isValidRut(rut)) nextErrors.rut = "Ingresa un RUT válido.";
    if (!isValidEmail(email)) nextErrors.email = "Ingresa un email válido.";
    if (rol !== "ORGANIZADOR" && rol !== "STAFF") nextErrors.rol = "Selecciona un rol.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const response = await provisionAccount({ nombre, rut, email, rol });
      setResult(response);
      form.reset();
      setRutValue("");
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setError(
        err instanceof AuthApiError
          ? err.message
          : "No fue posible crear la cuenta. Intenta nuevamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <section className={styles.page}>
        <div className={styles.card}>
          <p className={styles.helper}>Validando sesión...</p>
        </div>
      </section>
    );
  }

  if (status === "denied") {
    return (
      <section className={styles.page}>
        <div className={styles.card}>
          <div className={`${styles.alert} ${styles.alertError}`} role="status">
            No tienes permisos para crear cuentas.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="provision-title">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>Administración</p>
          <h1 id="provision-title">Crear cuenta de equipo</h1>
          <p>La persona recibirá un correo para crear su contraseña.</p>
        </div>

        {error && (
          <div className={`${styles.alert} ${styles.alertError}`} role="status">
            {error}
          </div>
        )}

        {result && (
          <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
            Cuenta {result.user.rol} creada para {result.user.email}.
            <ul className={styles.details}>
              <li>
                Correo de bienvenida:{" "}
                {result.notificacion.publicada ? "enviado a Notificaciones" : "no se pudo enviar"}
              </li>
              <li>
                Enlace válido hasta:{" "}
                {new Date(result.notificacion.enlace_expira_en).toLocaleString("es-CL")}
              </li>
            </ul>
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="prov-nombre">Nombre completo</label>
            <input
              className={`${styles.input} ${errors.nombre ? styles.inputError : ""}`}
              id="prov-nombre"
              name="nombre"
              type="text"
              autoComplete="off"
              aria-invalid={Boolean(errors.nombre)}
            />
            {errors.nombre && <span className={styles.errorText}>{errors.nombre}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="prov-rut">RUT</label>
            <input
              className={`${styles.input} ${errors.rut ? styles.inputError : ""}`}
              id="prov-rut"
              name="rut"
              type="text"
              inputMode="text"
              placeholder="12.345.678-5"
              value={rutValue}
              onChange={(e) => setRutValue(formatRut(e.target.value))}
              aria-invalid={Boolean(errors.rut)}
            />
            {errors.rut && <span className={styles.errorText}>{errors.rut}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="prov-email">Correo electrónico</label>
            <input
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              id="prov-email"
              name="email"
              type="email"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className={styles.errorText}>{errors.email}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="prov-rol">Rol</label>
            <select
              className={`${styles.input} ${styles.select} ${errors.rol ? styles.inputError : ""}`}
              id="prov-rol"
              name="rol"
              defaultValue=""
              aria-invalid={Boolean(errors.rol)}
            >
              <option value="" disabled>
                Selecciona un rol
              </option>
              <option value="STAFF">Staff</option>
              <option value="ORGANIZADOR">Organizador</option>
            </select>
            {errors.rol && <span className={styles.errorText}>{errors.rol}</span>}
          </div>

          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? "Creando..." : "Crear cuenta"}
          </button>
        </form>
      </div>
    </section>
  );
}
