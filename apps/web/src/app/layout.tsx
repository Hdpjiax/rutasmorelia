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
  title: "MoreliVía | Rutas de Transporte Público en Morelia",
  description: "Encuentra rutas de combis, camiones, paradas de transporte público y planea viajes en Morelia con facilidad y claridad.",
  keywords: ["Morelia", "transporte público", "rutas de combi", "camiones Morelia", "MoreliVía", "movilidad urbana", "viajar en Morelia"],
  authors: [{ name: "MoreliVía Team" }],
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "MoreliVía | Rutas de Transporte Público en Morelia",
    description: "Encuentra rutas de combis, camiones, paradas de transporte público y planea viajes en Morelia con facilidad y claridad.",
    url: "https://rutasmorelia.vercel.app",
    siteName: "MoreliVía",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "MoreliVía App Icon",
      },
    ],
    locale: "es_MX",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MoreliVía | Rutas de Transporte Público en Morelia",
    description: "Encuentra rutas de combis, camiones, paradas de transporte público y planea viajes en Morelia con facilidad y claridad.",
    images: ["/icon.png"],
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
