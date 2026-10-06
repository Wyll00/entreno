import { json, withUser } from "@/lib/api.ts";
import { getDb } from "@/lib/db.ts";
import { createExercise, listCatalog, suggestExercises } from "@/lib/exercises.ts";
import { exerciseSchema, parseWith, readJson } from "@/lib/schemas.ts";
import { listExercises } from "@/lib/workouts.ts";

/**
 * ?scope=suggest&q=… → hasta 6 sugerencias para el campo «Ejercicio» (contiene o se parece).
 * ?scope=catalog&q=… → catálogo (habituales, propios y usados; con q, búsqueda).
 * Sin scope → solo los ejercicios con series (historial y sugerencias).
 */
export function GET(request: Request) {
  return withUser(request, ({ userId }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("scope") === "suggest") {
      return json({ suggestions: suggestExercises(getDb(), userId, url.searchParams.get("q") ?? "") });
    }
    if (url.searchParams.get("scope") === "catalog") {
      return json({ exercises: listCatalog(getDb(), userId, url.searchParams.get("q") ?? "") });
    }
    return json({ exercises: listExercises(getDb(), userId) });
  });
}

export function POST(request: Request) {
  return withUser(request, async ({ userId }) => {
    const input = parseWith(exerciseSchema, await readJson(request));
    return json({ exercise: createExercise(getDb(), userId, input) }, 201);
  });
}
