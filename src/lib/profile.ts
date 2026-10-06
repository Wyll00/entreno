// Datos del perfil: cómo vas. Todo se calcula a partir de las series
// guardadas; no hay tablas propias ni datos inventados.
import type { DatabaseSync } from "node:sqlite";
import { addDays } from "./dates.ts";
import { gramsToKg, type WeightMode } from "./units.ts";

export type Profile = {
  name: string;
  since: string | null;
  totals: { sessions: number; sets: number; reps: number };
  thisMonth: { sessions: number; sets: number };
  /** Semanas seguidas (lunes a domingo) con al menos un entreno. */
  streakWeeks: number;
  weekly: { weekStart: string; sets: number; sessions: number }[];
  muscles: { group: string; sets: number }[];
  records: ExerciseRecord[];
  progress: Progress | null;
};

export type ExerciseRecord = {
  exerciseId: string;
  name: string;
  weightMode: WeightMode;
  setCount: number;
  lastDate: string;
  best: { weightKg: string | null; reps: number; date: string };
  /** 1RM estimado (Epley) con series de hasta 12 repeticiones; solo con peso. */
  estimated1rmKg: string | null;
  /** Mejor serie de la primera sesión frente a la de la última. */
  first: { weightKg: string | null; reps: number; date: string };
  latest: { weightKg: string | null; reps: number; date: string };
};

export type Progress = {
  exerciseId: string;
  name: string;
  weightMode: WeightMode;
  /** Mejor serie de cada sesión (la de más peso; con peso corporal, la de más repeticiones). */
  points: { date: string; weightKg: string | null; reps: number }[];
};

type Row = {
  session_id: string;
  local_date: string;
  exercise_id: string;
  name: string;
  muscle_group: string | null;
  weight_grams: number | null;
  weight_mode: WeightMode;
  reps: number;
  created_at: string;
};

const WEEKS = 8;

export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/** La mejor serie: más peso (empate: más repeticiones); con peso corporal, más repeticiones. */
function better(a: Row, b: Row): Row {
  if (a.weight_mode === "bodyweight") return b.reps > a.reps ? b : a;
  const wa = a.weight_grams ?? 0;
  const wb = b.weight_grams ?? 0;
  return wb > wa || (wb === wa && b.reps > a.reps) ? b : a;
}

const kg = (grams: number | null) => (grams === null ? null : gramsToKg(grams));
const toSet = (r: Row) => ({ weightKg: kg(r.weight_grams), reps: r.reps, date: r.local_date });

function estimated1rm(rows: Row[]): string | null {
  let bestGrams = 0;
  for (const r of rows) {
    if (r.weight_grams === null || r.reps > 12) continue;
    bestGrams = Math.max(bestGrams, r.weight_grams * (1 + r.reps / 30));
  }
  if (bestGrams === 0) return null;
  return gramsToKg(Math.round(bestGrams / 500) * 500); // redondeo a 0,5 kg
}

/** Mejor serie por sesión, en orden de fecha. */
function bestPerSession(rows: Row[]): Row[] {
  const bySession = new Map<string, Row>();
  for (const r of rows) {
    const current = bySession.get(r.session_id);
    bySession.set(r.session_id, current ? better(current, r) : r);
  }
  return [...bySession.values()].sort(
    (a, b) => a.local_date.localeCompare(b.local_date) || a.created_at.localeCompare(b.created_at),
  );
}

export function getProfile(
  db: DatabaseSync,
  user: { id: string; name: string },
  options: { today: string; exerciseId?: string },
): Profile {
  const rows = db
    .prepare(
      `SELECT w.session_id, s.local_date, w.exercise_id, e.name, e.muscle_group, w.weight_grams, w.weight_mode,
              w.reps, w.created_at
       FROM workout_set w
       JOIN workout_session s ON s.id = w.session_id
       JOIN exercise e ON e.id = w.exercise_id
       WHERE s.user_id = ?
       ORDER BY s.local_date, w.created_at, w.position`,
    )
    .all(user.id) as Row[];

  const sessions = new Map<string, string>(); // id → fecha
  for (const r of rows) sessions.set(r.session_id, r.local_date);
  const month = options.today.slice(0, 7);

  // Semanas
  const thisWeek = weekStart(options.today);
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({
    weekStart: addDays(thisWeek, -7 * (WEEKS - 1 - i)),
    sets: 0,
    sessions: 0,
  }));
  const weekIndex = new Map(weekly.map((w, i) => [w.weekStart, i]));
  for (const r of rows) {
    const i = weekIndex.get(weekStart(r.local_date));
    if (i !== undefined) weekly[i].sets++;
  }
  const weeksWithTraining = new Set<string>();
  for (const [, date] of sessions) {
    const ws = weekStart(date);
    weeksWithTraining.add(ws);
    const i = weekIndex.get(ws);
    if (i !== undefined) weekly[i].sessions++;
  }
  // La semana en curso no rompe la racha mientras no haya terminado.
  let streakWeeks = 0;
  let cursor = weeksWithTraining.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (weeksWithTraining.has(cursor)) {
    streakWeeks++;
    cursor = addDays(cursor, -7);
  }

  // Músculos, últimos 30 días
  const from = addDays(options.today, -29);
  const muscleCount = new Map<string, number>();
  for (const r of rows) {
    if (r.local_date < from || r.local_date > options.today) continue;
    const group = r.muscle_group ?? "Otros";
    muscleCount.set(group, (muscleCount.get(group) ?? 0) + 1);
  }
  const muscles = [...muscleCount].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets);

  // Récords por ejercicio, con la convención de peso más reciente
  const byExercise = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exercise_id) ?? [];
    list.push(r);
    byExercise.set(r.exercise_id, list);
  }
  const records: ExerciseRecord[] = [];
  const progressFor = new Map<string, Progress>();
  for (const [exerciseId, all] of byExercise) {
    const mode = all[all.length - 1].weight_mode;
    const same = all.filter((r) => r.weight_mode === mode);
    const perSession = bestPerSession(same);
    const best = same.reduce(better);
    records.push({
      exerciseId,
      name: all[0].name,
      weightMode: mode,
      setCount: all.length,
      lastDate: all[all.length - 1].local_date,
      best: toSet(best),
      estimated1rmKg: mode === "bodyweight" ? null : estimated1rm(same),
      first: toSet(perSession[0]),
      latest: toSet(perSession[perSession.length - 1]),
    });
    progressFor.set(exerciseId, {
      exerciseId,
      name: all[0].name,
      weightMode: mode,
      points: perSession.slice(-30).map((r) => ({ date: r.local_date, weightKg: kg(r.weight_grams), reps: r.reps })),
    });
  }
  records.sort((a, b) => b.setCount - a.setCount || b.lastDate.localeCompare(a.lastDate));

  const selected = options.exerciseId && progressFor.has(options.exerciseId) ? options.exerciseId : records[0]?.exerciseId;

  return {
    name: user.name,
    since: rows[0]?.local_date ?? null,
    totals: { sessions: sessions.size, sets: rows.length, reps: rows.reduce((n, r) => n + r.reps, 0) },
    thisMonth: {
      sessions: [...sessions.values()].filter((d) => d.startsWith(month)).length,
      sets: rows.filter((r) => r.local_date.startsWith(month)).length,
    },
    streakWeeks,
    weekly,
    muscles,
    records,
    progress: selected ? (progressFor.get(selected) ?? null) : null,
  };
}
