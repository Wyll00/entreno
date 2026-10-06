import { z } from "zod";
import { isValidLocalDate } from "./dates.ts";
import { badRequest } from "./errors.ts";
import { kgToGrams, WEIGHT_MODES, type WeightMode } from "./units.ts";

/** Serie completa y validada, lista para escribir. */
export type SetData = {
  exerciseName: string;
  weightGrams: number | null;
  weightMode: WeightMode;
  reps: number;
  sourceText: string | null;
};

const rawSet = z.object({
  exerciseName: z.string().max(80),
  weightKg: z.union([z.string().max(12), z.number()]).nullable(),
  weightMode: z.enum(WEIGHT_MODES).nullable(),
  reps: z.number().nullable(),
  sourceText: z.string().max(4000).nullable().optional(),
});

export function cleanExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Comprueba que una serie está completa. Un dato desconocido nunca se
 * convierte en cero: si falta, se rechaza con un mensaje que lo explica.
 */
export function parseSet(input: unknown, label = "La serie"): SetData {
  const parsed = rawSet.safeParse(input);
  if (!parsed.success) throw badRequest(`${label} tiene un formato no válido.`);
  const raw = parsed.data;

  const exerciseName = cleanExerciseName(raw.exerciseName);
  if (!exerciseName) throw badRequest(`${label}: falta el ejercicio.`);
  if (!raw.weightMode) throw badRequest(`${label}: indica si el peso es total, por mancuerna o peso corporal.`);
  if (raw.reps === null) throw badRequest(`${label}: faltan las repeticiones.`);
  if (!Number.isInteger(raw.reps) || raw.reps < 1 || raw.reps > 1000) {
    throw badRequest(`${label}: las repeticiones deben ser un número entero mayor que cero.`);
  }

  let weightGrams: number | null = null;
  if (raw.weightMode === "bodyweight") {
    if (raw.weightKg !== null && String(raw.weightKg).trim() !== "") {
      throw badRequest(`${label}: con peso corporal no se indica carga externa.`);
    }
  } else {
    if (raw.weightKg === null || String(raw.weightKg).trim() === "") {
      throw badRequest(`${label}: falta el peso.`);
    }
    weightGrams = kgToGrams(raw.weightKg);
    if (weightGrams === null) {
      throw badRequest(`${label}: el peso debe ser un número de 0 a 1000 kg con hasta 3 decimales.`);
    }
  }

  const sourceText = raw.sourceText?.trim() || null;
  return { exerciseName, weightGrams, weightMode: raw.weightMode, reps: raw.reps, sourceText };
}

export const saveDraftSchema = z.object({
  requestId: z.uuid(),
  sessionId: z.string().min(1).max(64),
  items: z.array(z.unknown()).min(1).max(30),
});

export const createSessionSchema = z.object({
  localDate: z.string().refine(isValidLocalDate, "Fecha no válida.").optional(),
  label: z.string().max(60).nullable().optional(),
});

export const updateSessionSchema = z.object({
  localDate: z.string().refine(isValidLocalDate, "Fecha no válida.").optional(),
  label: z.string().max(60).nullable().optional(),
  status: z.enum(["open", "closed"]).optional(),
  activeExerciseId: z.string().max(64).nullable().optional(),
});

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("El cuerpo de la petición no es JSON válido.");
  }
}

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? "Datos no válidos.");
  }
  return result.data;
}

export const logSchema = z.object({
  requestId: z.uuid(),
  text: z.string().max(500),
});

export const undoSchema = z.object({
  setIds: z.array(z.string().min(1).max(64)).min(1).max(30),
});

export const exerciseSchema = z.object({
  name: z.string().max(80),
  muscleGroup: z.string().max(30).nullable(),
  defaultWeightMode: z.enum(WEIGHT_MODES).nullable(),
  aliases: z.array(z.string().max(60)).max(20),
});
