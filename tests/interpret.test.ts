import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCatalog } from "../src/lib/catalog.ts";
import { openDatabase } from "../src/lib/db.ts";
import { ensureCatalog, loadKnownExercises } from "../src/lib/exercises.ts";
import { interpret, type InterpretContext, type KnownExercise } from "../src/lib/interpret.ts";
import { migrateApp } from "../src/lib/migrations.ts";
import { parseSet } from "../src/lib/schemas.ts";
import { phraseKey, tokenize } from "../src/lib/text.ts";
import { createSession, saveDraft } from "../src/lib/workouts.ts";

const ME = "user-me";
let exercises: KnownExercise[];

beforeAll(() => {
  const db = openDatabase(":memory:");
  migrateApp(db);
  ensureCatalog(db, ME);
  exercises = loadKnownExercises(db, ME);
});

const ctx = (active: string | null = null): InterpretContext => {
  const found = active ? exercises.find((e) => e.name === active) : null;
  if (active && !found) throw new Error(`No existe ${active}`);
  return { exercises, activeExercise: found ? { id: found.id, name: found.name } : null };
};
const brief = (text: string, active: string | null = null) => {
  const r = interpret(text, ctx(active));
  return {
    status: r.status,
    label: r.label,
    sets: r.items.map((i) => `${i.exerciseName ?? "?"} | ${i.weightKg ?? "-"} | ${i.weightMode ?? "?"} | ${i.reps ?? "-"}`),
    questions: r.questions,
  };
};

describe("normalización", () => {
  it("convierte cifras dichas en palabras", () => {
    expect(tokenize("sesenta y dos coma cinco kilos")).toEqual(["62.5", "kilos"]);
    expect(tokenize("ciento veinte kilos")).toEqual(["120", "kilos"]);
    expect(tokenize("62,5 kg")).toEqual(["62.5", "kg"]);
    expect(tokenize("60x8")).toEqual(["60", "x", "8"]);
    expect(tokenize("veinte y medio")).toEqual(["20.5"]);
    expect(tokenize("una serie")).toEqual(["1", "serie"]);
    expect(tokenize("remo a una mano")).toEqual(["remo", "a", "una", "mano"]);
    expect(tokenize("Hice ocho. Luego siete")).toEqual(["hice", "8", "luego", "7"]);
  });

  it("el catálogo no asigna el mismo alias habitual a dos ejercicios", () => {
    const owners = new Map<string, string>();
    for (const entry of buildCatalog().filter((e) => e.featured)) {
      for (const phrase of [entry.name, ...entry.aliases]) {
        const key = phraseKey(phrase);
        expect(owners.get(key) ?? entry.name, `«${key}» repetido`).toBe(entry.name);
        owners.set(key, entry.name);
      }
    }
  });
});

describe("casos del plan", () => {
  it("«Hoy hice pecho…» → una serie, «pecho» es la etiqueta y no un ejercicio", () => {
    expect(brief("Hoy hice pecho. En press inclinado con barra levanté 60 kilos e hice ocho repeticiones")).toEqual({
      status: "ready",
      label: "Pecho",
      sets: ["Press Inclinado con Barra | 60 | total | 8"],
      questions: [],
    });
  });

  it("tres series de ocho con 60 → tres filas, sin añadir ninguna", () => {
    const r = brief("Tres series de ocho con 60 kilos en press inclinado");
    expect(r.status).toBe("ready");
    expect(r.sets).toEqual(Array(3).fill("Press Inclinado con Barra | 60 | total | 8"));
  });

  it("con el ejercicio activo confirmado: «otra con 60 y siete; bajé a 50 para diez» → dos series", () => {
    const r = brief(
      "Después hice otra con 60 kilos y siete repeticiones, y bajé a 50 kilos para hacer diez",
      "Press Inclinado con Barra",
    );
    expect(r.status).toBe("ready");
    expect(r.sets).toEqual(["Press Inclinado con Barra | 60 | total | 7", "Press Inclinado con Barra | 50 | total | 10"]);
  });

  it("«60 kilos y ocho» sin ejercicio activo → pregunta el ejercicio", () => {
    const r = brief("60 kilos y ocho");
    expect(r.status).toBe("needs_clarification");
    expect(r.sets).toEqual(["? | 60 | ? | 8"]);
    expect(r.questions.join(" ")).toMatch(/Qué ejercicio/);
  });

  it("ejercicio sin peso ni repeticiones → pregunta, no rellena", () => {
    const r = brief("Hice press inclinado");
    expect(r.status).toBe("needs_clarification");
    expect(r.sets).toEqual(["Press Inclinado con Barra | - | total | -"]);
    expect(r.questions).toEqual(["¿Con cuánto peso?", "¿Cuántas repeticiones?"]);
  });

  it("«hice tres series» no inventa pesos ni repeticiones", () => {
    const r = brief("hice tres series", "Press Inclinado con Barra");
    expect(r.status).toBe("needs_clarification");
    expect(r.sets).toHaveLength(1);
    expect(r.questions.join(" ")).toMatch(/3 series/);
  });

  it("«dos mancuernas de 20» es 20 por mancuerna, nunca 40", () => {
    const r = brief("press de banca con dos mancuernas de 20 kilos, 10 repeticiones");
    expect(r.sets).toEqual(["Press de Banca con Mancuerna | 20 | per_dumbbell | 10"]);
  });

  it("62,5 se conserva, dicho en cifras o en palabras", () => {
    expect(brief("Press inclinado con 62,5 kilos, ocho").sets).toEqual(["Press Inclinado con Barra | 62.5 | total | 8"]);
    expect(brief("press inclinado sesenta y dos coma cinco kilos ocho repeticiones").sets).toEqual([
      "Press Inclinado con Barra | 62.5 | total | 8",
    ]);
  });

  it("ruido o texto ajeno → ningún registro", () => {
    expect(brief("qué calor hace hoy en el gimnasio").status).toBe("no_workout");
    expect(brief("").status).toBe("no_workout");
  });

  it("una corrección no añade series", () => {
    const r = brief("no, me equivoqué, eran siete", "Press Inclinado con Barra");
    expect(r.status).toBe("needs_clarification");
    expect(r.sets).toEqual([]);
  });
});

describe("reconocimiento del catálogo", () => {
  it("formas coloquiales", () => {
    expect(brief("banca 80 por 5").sets).toEqual(["Press de Banca con Barra | 80 | total | 5"]);
    expect(brief("jalón al pecho 55 kilos 12").sets).toEqual(["Jalón al pecho | 55 | total | 12"]);
    expect(brief("sentadilla 100 kilos 5 repeticiones").sets).toEqual(["Sentadilla con Barra | 100 | total | 5"]);
    expect(brief("prensa 200 kilos 10").sets).toEqual(["Prensa de Pierna | 200 | total | 10"]);
    expect(brief("curl martillo con 14 kilos 12 repeticiones").sets).toEqual(["Curl Martillo | 14 | per_dumbbell | 12"]);
    expect(brief("laterales 10 kilos 15 repeticiones").sets).toEqual([
      "Elevación Lateral con Mancuerna | 10 | per_dumbbell | 15",
    ]);
  });

  it("variante más concreta: con mancuernas no es con barra", () => {
    expect(brief("press inclinado con mancuernas 24 kilos 10").sets).toEqual([
      "Press Inclinado con Mancuerna | 24 | per_dumbbell | 10",
    ]);
  });

  it("tolera errores de dictado", () => {
    expect(brief("press inclinado con varra 60 kilos 8").sets).toEqual(["Press Inclinado con Barra | 60 | total | 8"]);
  });

  it("peso corporal sin carga", () => {
    const r = brief("dominadas 3 series de 10");
    expect(r.status).toBe("ready");
    expect(r.sets).toEqual(Array(3).fill("Dominadas | - | bodyweight | 10"));
  });

  it("peso corporal con kilos pide aclarar el tipo de peso", () => {
    const r = brief("dominadas con 10 kilos 6 repeticiones");
    expect(r.status).toBe("needs_clarification");
    expect(r.questions.join(" ")).toMatch(/lastre/);
  });

  it("dos ejercicios en una frase", () => {
    expect(brief("press banca 80 por 5 y luego remo con barra 70 por 8").sets).toEqual([
      "Press de Banca con Barra | 80 | total | 5",
      "Remo Inclinado con Barra | 70 | total | 8",
    ]);
    expect(brief("80 por 5 en banca y 70 por 8 en remo con barra").sets).toEqual([
      "Press de Banca con Barra | 80 | total | 5",
      "Remo Inclinado con Barra | 70 | total | 8",
    ]);
  });

  it("nombre genérico ambiguo → ofrece candidatos sin elegir", () => {
    const r = interpret("remo 60 por 8", ctx("Press Inclinado con Barra"));
    expect(r.status).toBe("needs_clarification");
    expect(r.items[0].exerciseId).toBeNull();
    expect(r.items[0].candidates.length).toBeGreaterThan(1);
    expect(r.items[0].candidates.every((c) => c.name.toLowerCase().includes("remo"))).toBe(true);
  });

  it("«ayer» no se apunta solo", () => {
    expect(brief("ayer hice banca 80 por 5").status).toBe("needs_clarification");
  });

  it("varias repeticiones con el mismo peso", () => {
    expect(brief("banca 80 kilos 5 repeticiones y luego 4", null).sets).toEqual([
      "Press de Banca con Barra | 80 | total | 5",
      "Press de Banca con Barra | 80 | total | 4",
    ]);
  });
});

describe("hábito del usuario", () => {
  it("la convención de peso usada la última vez manda sobre la del catálogo", () => {
    const db = openDatabase(":memory:");
    migrateApp(db);
    ensureCatalog(db, ME);
    const session = createSession(db, ME, { timeZone: "Atlantic/Canary" });
    // El catálogo dice «total» para el pullover; esta persona lo apunta por mancuerna.
    saveDraft(db, ME, {
      requestId: randomUUID(),
      sessionId: session.id,
      items: [parseSet({ exerciseName: "Pullover Brazos Rectos con Mancuerna", weightKg: "20", weightMode: "per_dumbbell", reps: 10 })],
    });
    const r = interpret("pullover 22 kilos 10", { exercises: loadKnownExercises(db, ME), activeExercise: null });
    expect(r.items[0]).toMatchObject({ weightMode: "per_dumbbell", modeSource: "habit" });
  });

  it("sincronizar el catálogo dos veces no duplica nada", () => {
    const db = openDatabase(":memory:");
    migrateApp(db);
    expect(ensureCatalog(db, ME)).toBe(true);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM exercise").get() as { n: number }).n;
    expect(ensureCatalog(db, ME)).toBe(false);
    expect((db.prepare("SELECT COUNT(*) AS n FROM exercise").get() as { n: number }).n).toBe(count);
    expect(count).toBeGreaterThan(780);
  });
});

describe("sugerencias cuando no reconoce el ejercicio", () => {
  const names = (text: string, active: string | null = null) =>
    interpret(text, ctx(active)).items.flatMap((i) => i.candidates.map((c) => c.name));

  it("nombre mal dictado → propone el parecido y no apunta", () => {
    const r = interpret("hip trast 100 kilos 12", ctx());
    expect(r.status).toBe("needs_clarification");
    expect(r.items[0]).toMatchObject({ exerciseId: null, weightKg: "100", reps: 12, heardName: "hip trast" });
    expect(r.items[0].candidates[0].name).toMatch(/^Hip Thrust/);
    expect(r.questions[0]).toMatch(/«hip trast»/);
  });

  it("palabras de más junto al nombre → pregunta en vez de apuntar otro ejercicio", () => {
    expect(interpret("jalon tras nuca 50 kilos 10", ctx()).status).toBe("needs_clarification");
    expect(names("curl femoral acostado 40 kilos 12")[0]).toBe("Curl femoral tumbado");
    expect(names("extension de triceps con soga 25 kilos 15")[0]).toBe("Extensión de tríceps en polea");
  });

  it("no habla de un ejercicio → usa el activo o no apunta nada; nunca sugiere por sugerir", () => {
    expect(brief("venga, ahora 70 por 6", "Press Inclinado con Barra").sets).toEqual([
      "Press Inclinado con Barra | 70 | total | 6",
    ]);
    expect(brief("qué calor hace hoy en el gimnasio").status).toBe("no_workout");
    expect(brief("me duele un poco el hombro").status).toBe("no_workout");
    expect(brief("el entrenador dice que mañana descanso").status).toBe("no_workout");
  });

  it("los músculos son la etiqueta, no ejercicios", () => {
    expect(brief("hoy toca tríceps y bíceps")).toMatchObject({ status: "no_workout", label: "Tríceps y bíceps" });
  });
});

describe("sugerencias al escribir", () => {
  it("contiene lo escrito, después lo parecido; sin texto, lo habitual", async () => {
    const { suggestExercises } = await import("../src/lib/exercises.ts");
    const db = openDatabase(":memory:");
    migrateApp(db);
    ensureCatalog(db, ME);
    expect(suggestExercises(db, ME, "press incl").map((s) => s.name)).toContain("Press Inclinado con Barra");
    expect(suggestExercises(db, ME, "hip trast")[0].name).toMatch(/^Hip Thrust/);
    expect(suggestExercises(db, ME, "")).toHaveLength(6);
    expect(suggestExercises(db, ME, "zzzz qqqq")).toEqual([]);
  });

  it("no se puede borrar un ejercicio con series", async () => {
    const { deleteExercise } = await import("../src/lib/exercises.ts");
    const db = openDatabase(":memory:");
    migrateApp(db);
    ensureCatalog(db, ME);
    const s = createSession(db, ME, { timeZone: "Atlantic/Canary" });
    saveDraft(db, ME, { requestId: randomUUID(), sessionId: s.id, items: [parseSet({ exerciseName: "Remo en T", weightKg: "40", weightMode: "total", reps: 10 })] });
    const remo = loadKnownExercises(db, ME).find((e) => e.name === "Remo en T")!;
    expect(() => deleteExercise(db, ME, remo.id)).toThrow(/tiene 1 series/);
    const unused = loadKnownExercises(db, ME).find((e) => e.name === "Remo en Máquina")!;
    deleteExercise(db, ME, unused.id);
    expect(loadKnownExercises(db, ME).some((e) => e.id === unused.id)).toBe(false);
  });
});
