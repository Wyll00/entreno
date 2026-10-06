import { headers } from "next/headers";
import { auth } from "./auth.ts";
import { config } from "./config.ts";
import { AppError } from "./errors.ts";

export type Ctx = { userId: string; userName: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins(): Set<string> {
  return new Set([config.publicUrl, ...config.extraOrigins]);
}

/**
 * Envoltorio común de los endpoints de datos:
 * - las mutaciones solo se aceptan desde el origen de la propia app;
 * - siempre se exige una sesión válida (no basta con que exista la cookie);
 * - los errores conocidos se devuelven como JSON con su código HTTP.
 */
export async function withUser(request: Request, fn: (ctx: Ctx) => Promise<Response> | Response): Promise<Response> {
  try {
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.headers.get("origin");
      if (!origin || !allowedOrigins().has(origin.replace(/\/+$/, ""))) {
        throw new AppError(403, "bad_origin", "Origen de la petición no permitido.");
      }
    }
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new AppError(401, "unauthorized", "Inicia sesión para continuar.");
    return await fn({ userId: session.user.id, userName: session.user.name });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    console.error("Error no controlado en", request.method, new URL(request.url).pathname, error);
    return Response.json({ error: "internal", message: "Error interno. No se ha guardado nada nuevo." }, { status: 500 });
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
