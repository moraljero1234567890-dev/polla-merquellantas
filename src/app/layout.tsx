import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Polla Mundialista · Merquellantas (juego promocional gratuito)",
  description:
    "Portal oficial de la Polla Mundialista de Merquellantas, un juego promocional gratuito para clientes. No solicitamos datos de pago ni claves bancarias; el acceso es solo con la cédula/NIT del cliente.",
  // Set GOOGLE_SITE_VERIFICATION in Vercel (the token Search Console gives
  // you, e.g. "abc123…") to verify ownership for the Safe Browsing review.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
