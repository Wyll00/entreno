import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/lib/db.ts";
import { migrateApp } from "../src/lib/migrations.ts";
import { getProfile, weekStart } from "../src/lib/profile.ts";
import { parseSet } from "../src/lib/schemas.ts";
import { createSession, saveDraft } from "../src/lib/workouts.ts";

const ME = { id: "user-me", name: "William" };
const TZ = "Atlantic/Canary";

function seed(days: { date: string; sets: [string, string | null, number, string?][] }[]) {
  const db = openDatabase(":memory:");
  migrateApp(db);
  for (const day of days) {
    const s = createSession(db, ME.id, { timeZone: TZ, localDate: day.date });
    saveDraft(db, ME.id, {
      requestId: randomUUID(),
      sessionId: s.id,
      items: day.sets.map(([exerciseName, weightKg, reps, weightMode = "total"]) =>
        parseSet({ exerciseName, weightKg, weightMode, reps }),
      ),
    });
  }
  return db;
}

describe("perfil", () => {
  it("semanas de lunes a domingo", () => {
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // domingo
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // lunes
  });

  it("totales, mes, racha y series por semana", () => {
    const db = seed([
      { date: "2026-09-15", sets: [["Sentadilla", "100", 5]] },
      { date: "2026-09-22", sets: [["Sentadilla", "100", 5]] },
      { date: "2026-09-29", sets: [["Sentadilla", "105", 5], ["Sentadilla", "105", 4]] },
      { date: "2026-10-01", sets: [["Press banca", "60", 8]] },
    ]);
    const p = getProfile(db, ME, { today: "2026-10-04" });
    expect(p.name).toBe("William");
    expect(p.since).toBe("2026-09-15");
    expect(p.totals).toEqual({ sessions: 4, sets: 5, reps: 27 });
    expect(p.thisMonth).toEqual({ sessions: 1, sets: 1 });
    expect(p.streakWeeks).toBe(3); // semanas del 14, 21 y 28 de septiembre
    expect(p.weekly).toHaveLength(8);
    expect(p.weekly.at(-1)).toEqual({ weekStart: "2026-09-28", sets: 3, sessions: 2 });
  });

  it("la semana en curso sin entrenar no rompe la racha; una semana vacía sí", () => {
    const db = seed([
      { date: "2026-09-08", sets: [["Remo", "50", 10]] },
      { date: "2026-09-22", sets: [["Remo", "50", 10]] },
    ]);
    expect(getProfile(db, ME, { today: "2026-09-30" }).streakWeeks).toBe(1);
    expect(getProfile(db, ME, { today: "2026-10-08" }).streakWeeks).toBe(0);
  });

  it("récords y progreso: mejor serie, primera frente a última, 1RM estimado", () => {
    const db = seed([
      { date: "2026-09-01", sets: [["Press banca", "60", 8], ["Press banca", "62,5", 6]] },
      { date: "2026-09-08", sets: [["Press banca", "65", 5], ["Press banca", "65", 6]] },
      { date: "2026-09-15", sets: [["Press banca", "70", 3]] },
    ]);
    const p = getProfile(db, ME, { today: "2026-09-20" });
    const r = p.records[0];
    expect(r.best).toEqual({ weightKg: "70", reps: 3, date: "2026-09-15" });
    expect(r.first).toEqual({ weightKg: "62.5", reps: 6, date: "2026-09-01" });
    expect(r.latest.weightKg).toBe("70");
    expect(r.estimated1rmKg).toBe("78"); // 65 × (1 + 6/30) = 78
    expect(p.progress?.points.map((x) => `${x.weightKg}×${x.reps}`)).toEqual(["62.5×6", "65×6", "70×3"]);
  });

  it("peso corporal: el récord son las repeticiones y no hay 1RM", () => {
    const db = seed([
      { date: "2026-09-01", sets: [["Dominadas", null, 6, "bodyweight"]] },
      { date: "2026-09-08", sets: [["Dominadas", null, 9, "bodyweight"]] },
    ]);
    const r = getProfile(db, ME, { today: "2026-09-10" }).records[0];
    expect(r.best).toMatchObject({ weightKg: null, reps: 9 });
    expect(r.estimated1rmKg).toBeNull();
  });

  it("sin entrenos, perfil vacío sin errores", () => {
    const db = openDatabase(":memory:");
    migrateApp(db);
    const p = getProfile(db, ME, { today: "2026-10-04" });
    expect(p.totals.sessions).toBe(0);
    expect(p.progress).toBeNull();
    expect(p.streakWeeks).toBe(0);
  });
});
