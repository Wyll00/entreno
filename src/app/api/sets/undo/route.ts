import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { parseWith, readJson, undoSchema } from "@/lib/schemas.ts";
import { undoSets } from "@/lib/workouts.ts";

/** «Deshacer» de un apunte por voz: borra esas series y recoloca el ejercicio activo. */
export function POST(request: Request) {
  return withUser(request, async ({ userId }) => {
    const { setIds } = parseWith(undoSchema, await readJson(request));
    return json({ session: undoSets(getDb(), userId, setIds) });
  });
}
