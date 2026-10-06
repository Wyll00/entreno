import { json, withUser } from "@/lib/api.ts";
import { config } from "@/lib/config.ts";
import { getDb } from "@/lib/db.ts";
import { loadKnownExercises } from "@/lib/exercises.ts";
import { interpret } from "@/lib/interpret.ts";
import { logSchema, parseSet, parseWith, readJson } from "@/lib/schemas.ts";
import { createSession, getOpenSession, getSession, saveDraft, updateSession } from "@/lib/workouts.ts";

/**
 * Frase dictada o escrita → series. Si está completa y sin ambigüedad se
 * apunta sola (idempotente por requestId) y el cliente ofrece «Deshacer»;
 * si no, devuelve el borrador y las preguntas sin escribir nada.
 */
export function POST(request: Request) {
  return withUser(request, async ({ userId }) => {
    const body = parseWith(logSchema, await readJson(request));
    const db = getDb();
    // Sin sesión abierta se crea la de hoy: hablar ya es empezar a entrenar.
    let session = getOpenSession(db, userId) ?? createSession(db, userId, { timeZone: config.timeZone });

    const result = interpret(body.text, {
      exercises: loadKnownExercises(db, userId),
      activeExercise: session.activeExercise,
    });

    if (result.label && !session.label) {
      session = updateSession(db, userId, session.id, { label: result.label });
    }

    if (result.status !== "ready") {
      return json({ saved: false, interpretation: result, session });
    }

    const items = result.items.map((item) =>
      parseSet({
        exerciseName: item.exerciseName,
        weightKg: item.weightKg,
        weightMode: item.weightMode,
        reps: item.reps,
        sourceText: body.text,
      }),
    );
    const saved = saveDraft(db, userId, { requestId: body.requestId, sessionId: session.id, items });
    return json({ saved: true, setIds: saved.setIds, interpretation: result, session: getSession(db, userId, session.id) });
  });
}
