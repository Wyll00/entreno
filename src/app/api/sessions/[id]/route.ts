import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { parseWith, readJson, updateSessionSchema } from "@/lib/schemas.ts";
import { deleteSession, getSession, updateSession } from "@/lib/workouts.ts";

type Params = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => json({ session: getSession(getDb(), userId, (await params).id) }));
}

/** Cambia fecha, etiqueta, estado o ejercicio activo de la sesión. */
export function PATCH(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => {
    const patch = parseWith(updateSessionSchema, await readJson(request));
    return json({ session: updateSession(getDb(), userId, (await params).id, patch) });
  });
}

/** Borra la sesión con sus series. */
export function DELETE(request: Request, { params }: Params) {
  return withUser(request, async ({ userId }) => {
    deleteSession(getDb(), userId, (await params).id);
    return json({ deleted: true });
  });
}
