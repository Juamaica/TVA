import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TVA NEXUS — Terminal de Variación Temporal",
    short_name: "TVA NEXUS",
    description: "Simulación inmersiva de la Time Variance Authority: mapa temporal 3D, variantes, podas y TemPad.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    orientation: "portrait",
    background_color: "#0a0b08",
    theme_color: "#0a0b08",
    lang: "es",
    categories: ["entertainment", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
