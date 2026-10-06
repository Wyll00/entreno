// Configuración leída del entorno. Solo se usa en el servidor: nada de esto
// lleva prefijo NEXT_PUBLIC_ y por tanto nunca llega al navegador.
import path from "node:path";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** `next build` evalúa los módulos sin secretos ni base de datos real. */
export const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

export const config = {
  get databasePath(): string {
    if (isBuildPhase) return ":memory:";
    return optional("DATABASE_PATH") ?? path.join(process.cwd(), "data", "workouts.sqlite");
  },
  get timeZone(): string {
    return optional("APP_TIME_ZONE") ?? "Atlantic/Canary";
  },
  /** URL pública con la que se abre la app (https en el servidor). */
  get publicUrl(): string {
    return (optional("BETTER_AUTH_URL") ?? "http://localhost:3210").replace(/\/+$/, "");
  },
  /** Orígenes adicionales aceptados en mutaciones (p. ej. pruebas en la LAN). */
  get extraOrigins(): string[] {
    return (optional("TRUSTED_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean);
  },
  get authSecret(): string | undefined {
    return optional("BETTER_AUTH_SECRET");
  },
};
