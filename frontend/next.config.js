/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compatibilidad con las URL existentes en invitaciones y recuperaciones de Auth.
  // Next.js conserva el query string (token) al aplicar estas rutas internas.
  async rewrites() {
    return [
      { source: '/auth/crear-clave', destination: '/crear-clave' },
      { source: '/auth/restablecer', destination: '/restablecer' },
    ];
  },
};

module.exports = nextConfig;
