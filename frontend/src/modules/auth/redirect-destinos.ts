/** Destinos de aplicaciones WEB, no URLs internas de microservicios Docker.
 * Nunca usamos una URL del querystring como destino externo.
 */
export type DestinosApps = {
  checkin?: string;
  organizador?: string;
  entradas?: string;
};

export function destinoParaRol(rol: string, origin: string, apps: DestinosApps): string | null {
  const destinos: Record<string, [string, string | undefined]> = {
    STAFF: ['/checkin', apps.checkin],
    ORGANIZADOR: ['/organizador', apps.organizador],
    COMPRADOR: ['/entradas', apps.entradas],
    USUARIO: ['/entradas', apps.entradas],
  };
  const opcion = destinos[rol.trim().toUpperCase()];
  if (!opcion) return null;
  const [rutaLocal, configurada] = opcion;
  if (!configurada?.trim()) return rutaLocal;

  // La URL configurada proviene de variables de entorno de compilación.
  // Evitar esquemas peligrosos, URLs con credenciales o protocolos relativos.
  const valor = configurada.trim();
  if (valor.startsWith('//') || valor.startsWith('\\\\')) return rutaLocal;
  try {
    const target = new URL(valor, origin);
    const origen = new URL(origin);
    const esLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(target.hostname);
    if (target.username || target.password) return rutaLocal;
    if (target.protocol !== 'https:' && !(target.protocol === 'http:' && esLocal)) return rutaLocal;

    // Configuración anterior de Panel apuntaba al home del mismo frontend.
    // No dejar al organizador en el mensaje 'Bienvenido a Plataforma de Eventos'.
    if (target.origin === origen.origin && target.pathname === '/' && !target.search && !target.hash) {
      return rutaLocal;
    }
    if (target.origin === origen.origin) return target.pathname + target.search + target.hash;
    return target.href;
  } catch {
    return rutaLocal;
  }
}
