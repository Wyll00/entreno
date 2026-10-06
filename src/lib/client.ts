// Utilidades del navegador: llamadas a la API y formato. No contiene secretos.
import type { WeightMode } from "./units.ts";
import type { SetView } from "./workouts.ts";

export type { ExerciseView, SessionView, SetView } from "./workouts.ts";
export { displayKg, WEIGHT_MODE_LABELS, WEIGHT_MODES } from "./units.ts";
export type { WeightMode } from "./units.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Sin conexión con el servidor.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (response.status === 401) {
    window.location.href = "/login";
  }
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "error", data.message ?? `Error ${response.status}.`);
  }
  return data as T;
}

/** UUID v4 también fuera de contexto seguro (crypto.randomUUID exige HTTPS). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function formatDate(localDate: string, options: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...options,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatSet(set: { weightKg: string | null; weightMode: WeightMode; reps: number }): string {
  if (set.weightMode === "bodyweight") return `Peso corporal × ${set.reps}`;
  const kg = (set.weightKg ?? "").replace(".", ",");
  return `${kg} kg × ${set.reps}`;
}

export const MODE_SHORT: Record<WeightMode, string> = {
  total: "total",
  per_dumbbell: "por mancuerna",
  bodyweight: "corporal",
};

/** Agrupa series consecutivas del mismo ejercicio. */
export function groupByExercise(sets: SetView[]): { name: string; sets: SetView[] }[] {
  const groups: { name: string; sets: SetView[] }[] = [];
  for (const set of sets) {
    const last = groups.at(-1);
    if (last && last.name === set.exerciseName) last.sets.push(set);
    else groups.push({ name: set.exerciseName, sets: [set] });
  }
  return groups;
}
