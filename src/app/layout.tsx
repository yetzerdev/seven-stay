import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Tipografía del Portal del Huésped (/p/[codigo]).
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Marca "Seven Stay" (firma del footer).
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Seven Stay",
  description: "Portal del huésped y panel operativo para hoteles.",
  // PWA en iPhone/iPad: ícono, nombre y pantalla completa al abrir desde el inicio.
  // Cada sección declara su propio manifiesto (portal por habitación, panel).
  applicationName: "Seven Stay",
  appleWebApp: { capable: true, title: "Seven Stay", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/iconos/icono-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/iconos/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F8F9FA",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
