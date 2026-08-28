import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import type { ReactNode } from "react";

// Este layout envuelve TODAS las páginas automáticamente (así funciona
// Next.js App Router). Por eso el Header y el Footer se importan UNA
// sola vez, acá, y no hay que repetirlos en cada página de cada grupo.
//
// Los 9 grupos no deberían necesitar tocar este archivo.

export const metadata = {
  title: "Plataforma de Eventos",
  description: "Proyecto universitario — plataforma de gestión de eventos",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Header />
        <main style={{ minHeight: "70vh", padding: "1rem 2rem" }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
