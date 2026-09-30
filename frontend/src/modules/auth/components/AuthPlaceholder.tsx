"use client";

import { FormEvent, useState } from "react";
import { AuthApiError, loginBuyer, registerBuyer } from "@/modules/auth/api";
import { formatRut, isValidEmail, isValidRut } from "@/modules/auth/validators";
import styles from "./AuthPlaceholder.module.css";

type Mode = "login" | "register";
type FieldErrors = Record<string, string>;

export default function AuthPlaceholder() {
  const [mode, setMode] = useState<Mode>("login");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [rutValue, setRutValue] = useState("");

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setErrors({});
    setMessage(null);
    setRateLimited(false);
    setRutValue("");
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nombre = String(formData.get("nombre") ?? "").trim();
    const rut = String(formData.get("rut") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const nextErrors: FieldErrors = {};
    if (!nombre) nextErrors.nombre = "Ingresa tu nombre.";
    if (!isValidRut(rut)) nextErrors.rut = "Ingresa un RUT válido.";
    if (!isValidEmail(email)) nextErrors.email = "Ingresa un email válido.";
    if (password.length < 8) {
      nextErrors.password = "La contraseña debe tener al menos 8 caracteres.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await registerBuyer({ nombre, rut, email, password });
      form.reset();
      setRutValue("");
      setErrors({});
      setMessage({
        kind: "success",
        text: "Cuenta creada correctamente. Ya puedes iniciar sesión.",
      });
    } catch (error) {
      const text =
        error instanceof AuthApiError
          ? error.message
          : "No fue posible completar el registro. Intenta nuevamente.";
      setMessage({ kind: "error", text });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const nextErrors: FieldErrors = {};
    if (!isValidEmail(email)) nextErrors.email = "Ingresa un email válido.";
    if (!password) nextErrors.password = "Ingresa tu contraseña.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await loginBuyer({ email, password });
      form.reset();
      setErrors({});
      setMessage({
        kind: "success",
        text: `Sesión iniciada correctamente${result.user?.nombre ? `, ${result.user.nombre}` : ""}.`,
      });
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 429) {
        setRateLimited(true);
      }

      const text =
        error instanceof AuthApiError
          ? error.message
          : "No fue posible iniciar sesión. Intenta nuevamente.";
      setMessage({ kind: "error", text });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page} aria-labelledby="auth-title">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>Acceso compradores</p>
          <h1 id="auth-title">
            {mode === "login" ? "Iniciar sesión" : "Crear una cuenta"}
          </h1>
          <p>
            {mode === "login"
              ? "Ingresa tus datos para continuar."
              : "Completa tus datos para registrarte en la plataforma."}
          </p>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Opciones de autenticación">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}
            onClick={() => changeMode("login")}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`${styles.tab} ${mode === "register" ? styles.tabActive : ""}`}
            onClick={() => changeMode("register")}
          >
            Registrarse
          </button>
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

        {mode === "login" ? (
          <form className={styles.form} onSubmit={handleLogin} noValidate>
            <div className={styles.field}>
              <label htmlFor="login-email">Correo electrónico</label>
              <input
                className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="correo@ejemplo.cl"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "login-email-error" : undefined}
              />
              {errors.email && (
                <span className={styles.errorText} id="login-email-error">
                  {errors.email}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="login-password">Contraseña</label>
              <input
                className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "login-password-error" : undefined}
              />
              {errors.password && (
                <span className={styles.errorText} id="login-password-error">
                  {errors.password}
                </span>
              )}
            </div>

            <button
              className={styles.submit}
              type="submit"
              disabled={submitting || rateLimited}
            >
              {submitting
                ? "Ingresando..."
                : rateLimited
                  ? "Espera antes de volver a intentar"
                  : "Ingresar"}
            </button>

            <p className={styles.switchText}>
              ¿No tienes cuenta?{" "}
              <button type="button" onClick={() => changeMode("register")}>
                Regístrate aquí
              </button>
            </p>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleRegister} noValidate>
            <div className={styles.field}>
              <label htmlFor="register-name">Nombre completo</label>
              <input
                className={`${styles.input} ${errors.nombre ? styles.inputError : ""}`}
                id="register-name"
                name="nombre"
                type="text"
                autoComplete="name"
                placeholder="Ej. Camila Soto"
                aria-invalid={Boolean(errors.nombre)}
              />
              {errors.nombre && <span className={styles.errorText}>{errors.nombre}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor="register-rut">RUT</label>
              <input
                className={`${styles.input} ${errors.rut ? styles.inputError : ""}`}
                id="register-rut"
                name="rut"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="12.345.678-5"
                value={rutValue}
                onChange={(event) => setRutValue(formatRut(event.target.value))}
                aria-invalid={Boolean(errors.rut)}
                aria-describedby={errors.rut ? "register-rut-error" : undefined}
              />
              {errors.rut && (
                <span className={styles.errorText} id="register-rut-error">
                  {errors.rut}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="register-email">Correo electrónico</label>
              <input
                className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="correo@ejemplo.cl"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <span className={styles.errorText}>{errors.email}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor="register-password">Contraseña</label>
              <input
                className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password ? (
                <span className={styles.errorText}>{errors.password}</span>
              ) : (
                <span className={styles.helper}>Debe tener al menos 8 caracteres.</span>
              )}
            </div>

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "Creando cuenta..." : "Crear cuenta"}
            </button>

            <p className={styles.switchText}>
              ¿Ya tienes cuenta?{" "}
              <button type="button" onClick={() => changeMode("login")}>
                Inicia sesión
              </button>
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
