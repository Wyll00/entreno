import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/lib/db.ts";
import { AppError } from "../src/lib/errors.ts";
import { migrateApp } from "../src/lib/migrations.ts";
import { parseSet } from "../src/lib/schemas.ts";
import { gramsToKg, kgToGrams } from "../src/lib/units.ts";
import {
  createSession,
  deleteSession,
  deleteSet,
  getOpenSession,
  getSession,
  listExercises,
  listHistory,
  saveDraft,
  updateSession,
  updateSet,
} from "../src/lib/workouts.ts";

const TZ = "Atlantic/Canary";
const ME = "user-me";
const OTHER = "user-other";

const set = (exerciseName: string, weightKg: string | null, reps: number, weightMode = "total") =>
  parseSet({ exerciseName, weightKg, weightMode, reps, sourceText: null });

function freshDb() {
  const db = openDatabase(":memory:");
  migrateApp(db);
  return db;
}

describe("unidades", () => {
  it("convierte kilos con coma o punto a gramos exactos", () => {
    expect(kgToGrams("62,5")).toBe(62500);
    expect(kgToGrams("62.5")).toBe(62500);
    expect(kgToGrams("0,125")).toBe(125);
    expect(kgToGrams(60)).toBe(60000);
    expect(gramsToKg(62500)).toBe("62.5");
    expect(gramsToKg(60000)).toBe("60");
  });

  it("rechaza formatos ambiguos o fuera de rango", () => {
    expect(kgToGrams("-5")).toBeNull();
    expect(kgToGrams("1.000,5")).toBeNull();
    expect(kgToGrams("62,5555")).toBeNull();
    expect(kgToGrams("abc")).toBeNull();
    expect(kgToGrams("1001")).toBeNull();
  });
});

describe("validación de series", () => {
  it("no inventa datos: peso, repeticiones o modalidad que faltan se rechazan", () => {
    expect(() => parseSet({ exerciseName: "Press inclinado", weightKg: null, weightMode: "total", reps: 8 })).toThrow(
      /falta el peso/,
    );
    expect(() => parseSet({ exerciseName: "Press inclinado", weightKg: "60", weightMode: "total", reps: null })).toThrow(
      /faltan las repeticiones/,
    );
    expect(() => parseSet({ exerciseName: "Press inclinado", weightKg: "60", weightMode: null, reps: 8 })).toThrow(
      /total, por mancuerna o peso corporal/,
    );
    expect(() => parseSet({ exerciseName: "  ", weightKg: "60", weightMode: "total", reps: 8 })).toThrow(
      /falta el ejercicio/,
    );
    expect(() => parseSet({ exerciseName: "Press", weightKg: "60", weightMode: "total", reps: 0 })).toThrow();
    expect(() => parseSet({ exerciseName: "Press", weightKg: "60", weightMode: "total", reps: 7.5 })).toThrow();
  });

  it("peso corporal se guarda sin carga (null), nunca como cero inventado", () => {
    const data = parseSet({ exerciseName: "Dominadas", weightKg: null, weightMode: "bodyweight", reps: 10 });
    expect(data.weightGrams).toBeNull();
    expect(() => parseSet({ exerciseName: "Dominadas", weightKg: "10", weightMode: "bodyweight", reps: 10 })).toThrow();
  });

  it("por mancuerna conserva el peso de una mancuerna, sin multiplicar", () => {
    expect(set("Press con mancuernas", "20", 10, "per_dumbbell").weightGrams).toBe(20000);
  });
});

describe("sesiones y series", () => {
  let db: ReturnType<typeof freshDb>;
  beforeEach(() => {
    db = freshDb();
  });

  it("guarda 62,5 kg sin pérdida y lo devuelve igual", () => {
    const s = createSession(db, ME, { timeZone: TZ, label: "Pecho" });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Press inclinado con barra", "62,5", 8)] });
    const view = getSession(db, ME, s.id);
    expect(view.sets[0]).toMatchObject({ exerciseName: "Press inclinado con barra", weightKg: "62.5", reps: 8 });
    expect(view.label).toBe("Pecho");
  });

  it("tres series del mismo ejercicio son tres filas ordenadas y fijan el ejercicio activo", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    const items = [1, 2, 3].map(() => set("Press inclinado", "60", 8));
    const result = saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items });
    expect(result.setIds).toHaveLength(3);
    const view = getSession(db, ME, s.id);
    expect(view.sets.map((x) => x.position)).toEqual([1, 2, 3]);
    expect(view.activeExercise?.name).toBe("Press inclinado");
  });

  it("el mismo requestId no duplica, ni tras reabrir la base de datos", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "entrenos-test-")), "w.sqlite");
    const first = openDatabase(file);
    migrateApp(first);
    const s = createSession(first, ME, { timeZone: TZ });
    const requestId = randomUUID();
    const items = [set("Sentadilla", "100", 5)];
    const a = saveDraft(first, ME, { requestId, sessionId: s.id, items });
    const b = saveDraft(first, ME, { requestId, sessionId: s.id, items });
    expect(b.replayed).toBe(true);
    expect(b.setIds).toEqual(a.setIds);
    first.close();

    const second = openDatabase(file); // «reinicio del servidor»
    const c = saveDraft(second, ME, { requestId, sessionId: s.id, items });
    expect(c.setIds).toEqual(a.setIds);
    expect(getSession(second, ME, s.id).sets).toHaveLength(1);
    second.close();
  });

  it("el mismo requestId con otro contenido es conflicto y no escribe", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    const requestId = randomUUID();
    saveDraft(db, ME, { requestId, sessionId: s.id, items: [set("Sentadilla", "100", 5)] });
    expect(() => saveDraft(db, ME, { requestId, sessionId: s.id, items: [set("Sentadilla", "100", 6)] })).toThrow(
      AppError,
    );
    expect(getSession(db, ME, s.id).sets).toHaveLength(1);
  });

  it("un reintento antiguo no recrea una serie borrada", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    const requestId = randomUUID();
    const items = [set("Remo", "50", 10)];
    const { setIds } = saveDraft(db, ME, { requestId, sessionId: s.id, items });
    deleteSet(db, ME, setIds[0]);
    saveDraft(db, ME, { requestId, sessionId: s.id, items });
    expect(getSession(db, ME, s.id).sets).toHaveLength(0);
  });

  it("una serie idéntica con otro requestId es una serie legítima nueva", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10)] });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10)] });
    expect(getSession(db, ME, s.id).sets).toHaveLength(2);
  });

  it("un fallo a mitad del borrador no deja series sueltas", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    const bad = { ...set("Remo", "50", 10), reps: -1 }; // la CHECK de la tabla lo rechaza
    expect(() =>
      saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10), bad] }),
    ).toThrow();
    expect(getSession(db, ME, s.id).sets).toHaveLength(0);
  });

  it("editar cambia solo la serie elegida y borrar solo la confirmada", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    const { setIds } = saveDraft(db, ME, {
      requestId: randomUUID(),
      sessionId: s.id,
      items: [set("Press inclinado", "60", 8), set("Press inclinado", "60", 8), set("Press inclinado", "50", 10)],
    });
    updateSet(db, ME, setIds[0], set("Press inclinado", "60", 7));
    deleteSet(db, ME, setIds[2]);
    const sets = getSession(db, ME, s.id).sets;
    expect(sets.map((x) => [x.weightKg, x.reps])).toEqual([
      ["60", 7],
      ["60", 8],
    ]);
  });

  it("press plano e inclinado son ejercicios distintos; mayúsculas y tildes no", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    saveDraft(db, ME, {
      requestId: randomUUID(),
      sessionId: s.id,
      items: [set("Press plano", "70", 8), set("Press inclinado", "60", 8), set("press  INCLINADO", "60", 7)],
    });
    expect(listExercises(db, ME).map((e) => e.name)).toEqual(["Press inclinado", "Press plano"]);
  });

  it("crear otra sesión cierra la abierta y limpia su contexto", () => {
    const first = createSession(db, ME, { timeZone: TZ, localDate: "2026-10-03" });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: first.id, items: [set("Remo", "50", 10)] });
    const second = createSession(db, ME, { timeZone: TZ, localDate: "2026-10-04" });
    expect(getSession(db, ME, first.id)).toMatchObject({ status: "closed", activeExercise: null });
    expect(getOpenSession(db, ME)?.id).toBe(second.id);
    expect(second.activeExercise).toBeNull();
    const history = listHistory(db, ME);
    expect(history.map((h) => h.localDate)).toEqual(["2026-10-04", "2026-10-03"]);
    expect(history[1].sets).toHaveLength(1);
  });

  it("cerrar una sesión limpia el ejercicio activo", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10)] });
    expect(updateSession(db, ME, s.id, { status: "closed" })).toMatchObject({ status: "closed", activeExercise: null });
    expect(getOpenSession(db, ME)).toBeNull();
  });

  it("el historial por ejercicio solo trae ese ejercicio", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    saveDraft(db, ME, {
      requestId: randomUUID(),
      sessionId: s.id,
      items: [set("Remo", "50", 10), set("Curl", "12", 12, "per_dumbbell")],
    });
    const remo = listExercises(db, ME).find((e) => e.name === "Remo")!;
    const history = listHistory(db, ME, { exerciseId: remo.id });
    expect(history[0].sets.map((x) => x.exerciseName)).toEqual(["Remo"]);
  });

  it("otro usuario no puede leer, guardar, editar ni borrar mis datos", () => {
    const s = createSession(db, ME, { timeZone: TZ });
    const { setIds } = saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10)] });
    expect(() => getSession(db, OTHER, s.id)).toThrow(/no encontrad/);
    expect(() =>
      saveDraft(db, OTHER, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10)] }),
    ).toThrow(/no encontrad/);
    expect(() => updateSet(db, OTHER, setIds[0], set("Remo", "99", 1))).toThrow(/no encontrad/);
    expect(() => deleteSet(db, OTHER, setIds[0])).toThrow(/no encontrad/);
    expect(() => updateSession(db, OTHER, s.id, { status: "closed" })).toThrow(/no encontrad/);
    expect(listHistory(db, OTHER)).toEqual([]);
    expect(getSession(db, ME, s.id).sets[0]).toMatchObject({ weightKg: "50", reps: 10 });
  });
});

describe("saludo", async () => {
  const { greeting } = await import("../src/lib/greeting.ts");
  it("saluda por el nombre según la hora de Canarias", () => {
    // 09:00 UTC = 10:00 en Canarias (horario de verano)
    expect(greeting("William", "Atlantic/Canary", new Date("2026-10-04T09:00:00Z"))).toBe("Buenos días, William");
    expect(greeting("William González", "Atlantic/Canary", new Date("2026-10-04T15:00:00Z"))).toBe("Buenas tardes, William");
    expect(greeting("William", "Atlantic/Canary", new Date("2026-10-04T22:30:00Z"))).toBe("Buenas noches, William");
    expect(greeting("", "Atlantic/Canary", new Date("2026-10-04T09:00:00Z"))).toBe("Buenos días");
  });
});

describe("borrar sesión", () => {
  it("borra la sesión y sus series, solo del propietario", () => {
    const db = openDatabase(":memory:");
    migrateApp(db);
    const s = createSession(db, ME, { timeZone: TZ });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [set("Remo", "50", 10)] });
    expect(() => deleteSession(db, OTHER, s.id)).toThrow(/no encontrad/);
    deleteSession(db, ME, s.id);
    expect(() => getSession(db, ME, s.id)).toThrow(/no encontrad/);
    expect((db.prepare("SELECT COUNT(*) AS n FROM workout_set").get() as { n: number }).n).toBe(0);
  });
});
