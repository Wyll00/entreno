import type { MetadataRoute } from "next";

// Permite «Añadir a pantalla de inicio»: se abre como una app, sin barra del navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Entrenos",
    short_name: "Entrenos",
    description: "Registro personal de entrenamientos por voz",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c1a3a",
    theme_color: "#1c1a3a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // El icono es a sangre y la mancuerna queda dentro de la zona segura: vale como «maskable».
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
