import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rutasmorelia.vercel.app"),
  title: "ViaMorelia | Rutas de Transporte Público en Morelia",
  description: "Encuentra rutas de combis, camiones, paradas de transporte público y planea viajes en Morelia con facilidad y claridad.",
  keywords: ["Morelia", "transporte público", "rutas de combi", "camiones Morelia", "ViaMorelia", "movilidad urbana", "viajar en Morelia"],
  authors: [{ name: "ViaMorelia Team" }],
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "ViaMorelia | Rutas de Transporte Público en Morelia",
    description: "Encuentra rutas de combis, camiones, paradas de transporte público y planea viajes en Morelia con facilidad y claridad.",
    url: "https://rutasmorelia.vercel.app",
    siteName: "ViaMorelia",
    images: [
      {
        url: "/icon.svg",
        width: 512,
        height: 512,
        alt: "ViaMorelia App Icon",
      },
    ],
    locale: "es_MX",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ViaMorelia | Rutas de Transporte Público en Morelia",
    description: "Encuentra rutas de combis, camiones, paradas de transporte público y planea viajes en Morelia con facilidad y claridad.",
    images: ["/icon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-MX"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
