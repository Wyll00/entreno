import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { parseSet, parseWith, readJson, saveDraftSchema } from "@/lib/schemas.ts";
import { getSession, saveDraft } from "@/lib/workouts.ts";

/**
 * Guarda un borrador confirmado (una o varias series). Idempotente por
 * requestId: un reintento devuelve lo ya guardado sin duplicar.
 */
export function POST(request: Request) {
  return withUser(request, async ({ userId }) => {
    const body = parseWith(saveDraftSchema, await readJson(request));
    const items = body.items.map((item, i) => parseSet(item, body.items.length > 1 ? `La serie ${i + 1}` : "La serie"));
    const db = getDb();
    const result = saveDraft(db, userId, { requestId: body.requestId, sessionId: body.sessionId, items });
    return json({ ...result, session: getSession(db, userId, result.sessionId) }, result.replayed ? 200 : 201);
  });
}
