"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GATEWAY_URL } from "@/lib/env";
import styles from "./MisNotificaciones.module.css";

type Aviso = {
  id_notificacion: string;
  tipo: string;
  mensaje: string;
  estado_lectura: string;
  created_at: string;
};

type Estado =
  | { tipo: "cargando" }
  | { tipo: "sin-sesion" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; avisos: Aviso[] };

export default function MisNotificaciones() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [recarga, setRecarga] = useState(0);
  const actualizar = useCallback(() => setRecarga(n => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const consultar = async () => {
      setEstado({ tipo: "cargando" });
      try {
        const respuesta = await fetch(`${GATEWAY_URL.replace(/\/$/, "")}/api/auth/mis-notificaciones`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (respuesta.status === 401) { setEstado({ tipo: "sin-sesion" }); return; }
        if (!respuesta.ok) {
          setEstado({ tipo: "error", mensaje: respuesta.status === 404
            ? "La ruta de notificaciones no está disponible en el Gateway."
            : "No pudimos cargar tus notificaciones. Puedes volver a intentarlo." });
          return;
        }
        const avisos: unknown = await respuesta.json();
        if (!Array.isArray(avisos)) throw new Error("Formato inesperado");
        setEstado({ tipo: "listo", avisos: avisos as Aviso[] });
      } catch {
        if (!controller.signal.aborted) {
          setEstado({ tipo: "error", mensaje: "No se pudo conectar con el centro de notificaciones." });
        }
      }
    };
    void consultar();
    return () => controller.abort();
  }, [recarga]);

  return (
    <section className={styles.page} aria-labelledby="mis-notificaciones-title">
      <div className={styles.content}>
        <Link href="/auth" className={styles.back}>Autenticación</Link>
        <h1 id="mis-notificaciones-title">Mis notificaciones</h1>
        <p className={styles.intro}>Consulta los avisos de tu cuenta sin volver a iniciar sesión ni copiar tokens.</p>
        {estado.tipo === "cargando" && <p role="status">Consultando Notificaciones mediante el API Gateway…</p>}
        {estado.tipo === "sin-sesion" && (
          <div className={styles.notice} role="status">
            Tu sesión no está activa. <Link href="/auth?volver=%2Fauth%2Fnotificaciones">Iniciar sesión</Link>
          </div>
        )}
        {estado.tipo === "error" && <div className={styles.notice} role="alert">{estado.mensaje}</div>}
        {estado.tipo === "listo" && (
          estado.avisos.length === 0
            ? <div className={styles.notice} role="status">No tienes notificaciones pendientes en este momento.</div>
            : <ul className={styles.list}>
                {estado.avisos.map((aviso, i) => (
                  <li className={styles.item} key={`${aviso.id_notificacion}-${i}`}>
                    <div className={styles.itemHeading}>
                      <strong>{aviso.tipo}</strong>
                      <small>{aviso.estado_lectura === "LEIDA" ? "Leída" : "No leída"}</small>
                    </div>
                    <p>{aviso.mensaje}</p>
                    {aviso.created_at && <small>{new Date(aviso.created_at).toLocaleString("es-CL")}</small>}
                  </li>
                ))}
              </ul>
        )}
        <button type="button" onClick={actualizar} className={styles.refresh} disabled={estado.tipo === "cargando"}>
          Actualizar notificaciones
        </button>
      </div>
    </section>
  );
}
