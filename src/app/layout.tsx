import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TVA NEXUS",
  description: "Terminal privada de simulación temporal · Time Variance Authority",
  manifest: "/manifest.webmanifest",
  applicationName: "TVA NEXUS",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TVA NEXUS" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0b08",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-tva-bg text-tva-cream antialiased">{children}</body>
    </html>
  );
}
