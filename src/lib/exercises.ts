// Catálogo de ejercicios en la base de datos: sincronización, alias,
// búsqueda y edición. Todo filtrado por usuario.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { buildCatalog, CATALOG_VERSION, MUSCLE_GROUPS, RETIRED_ALIASES, type MuscleGroup } from "./catalog.ts";
import { transaction } from "./db.ts";
import { AppError, badRequest, notFound } from "./errors.ts";
import { bestSimilarity, type KnownExercise } from "./interpret.ts";
import { cleanExerciseName } from "./schemas.ts";
import { phraseKey } from "./text.ts";
import { WEIGHT_MODES, type WeightMode } from "./units.ts";
import { normalizeExerciseName } from "./workouts.ts";

export type CatalogExercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  defaultWeightMode: WeightMode | null;
  aliases: string[];
  featured: boolean;
  source: "catalog" | "custom";
  setCount: number;
  lastDate: string | null;
};

/**
 * Copia el catálogo a los ejercicios del usuario. Es idempotente y solo se
 * ejecuta cuando cambia CATALOG_VERSION. No pisa lo que la persona haya
 * editado: rellena huecos y añade alias libres.
 */
export function ensureCatalog(db: DatabaseSync, userId: string): boolean {
  const metaKey = `catalog:${userId}`;
  const current = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(metaKey) as { value: string } | undefined;
  if (current?.value === String(CATALOG_VERSION)) return false;

  transaction(db, () => {
    const find = db.prepare("SELECT id FROM exercise WHERE user_id = ? AND normalized_name = ?");
    const insert = db.prepare(
      `INSERT INTO exercise (id, user_id, name, normalized_name, muscle_group, default_weight_mode, source, featured, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'catalog', ?, ?)`,
    );
    const update = db.prepare(
      `UPDATE exercise SET muscle_group = COALESCE(muscle_group, ?),
              default_weight_mode = COALESCE(default_weight_mode, ?),
              source = 'catalog', featured = MAX(featured, ?)
       WHERE id = ?`,
    );
    // Si el alias ya es de este ejercicio, solo se completa su forma legible.
    const alias = db.prepare(
      `INSERT INTO exercise_alias (user_id, alias, exercise_id, phrase) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, alias) DO UPDATE SET phrase = COALESCE(exercise_alias.phrase, excluded.phrase)
       WHERE exercise_alias.exercise_id = excluded.exercise_id`,
    );
    const stamp = new Date().toISOString();

    // Los habituales van primero: sus alias tienen prioridad sobre los nombres del resto.
    for (const entry of buildCatalog()) {
      const existing = find.get(userId, normalizeExerciseName(entry.name)) as { id: string } | undefined;
      let id = existing?.id;
      if (id) update.run(entry.group, entry.mode, entry.featured ? 1 : 0, id);
      else {
        id = randomUUID();
        insert.run(id, userId, entry.name, normalizeExerciseName(entry.name), entry.group, entry.mode, entry.featured ? 1 : 0, stamp);
      }
      for (const phrase of [entry.name, ...entry.aliases]) {
        const key = phraseKey(phrase);
        if (key) alias.run(userId, key, id, phrase);
      }
    }
    const retire = db.prepare(
      `DELETE FROM exercise_alias WHERE user_id = ? AND alias = ?
         AND exercise_id IN (SELECT id FROM exercise WHERE user_id = ? AND source = 'catalog' AND normalized_name <> ?)`,
    );
    for (const key of RETIRED_ALIASES) retire.run(userId, key, userId, key);
    // Ejercicios propios: que se reconozcan por su nombre.
    const own = db.prepare("SELECT id, name FROM exercise WHERE user_id = ?").all(userId) as { id: string; name: string }[];
    for (const e of own) {
      const key = phraseKey(e.name);
      if (key) alias.run(userId, key, e.id, e.name);
    }
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
      metaKey,
      String(CATALOG_VERSION),
    );
  });
  return true;
}

/** Sincroniza el catálogo de todas las cuentas (al arrancar). */
export function ensureCatalogForAllUsers(db: DatabaseSync): number {
  const users = db.prepare('SELECT id FROM "user"').all() as { id: string }[];
  return users.filter((u) => ensureCatalog(db, u.id)).length;
}

/** Lo que necesita el intérprete: ejercicios, alias y hábitos de uso. */
export function loadKnownExercises(db: DatabaseSync, userId: string): KnownExercise[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.name, e.default_weight_mode, e.featured, a.alias
       FROM exercise e JOIN exercise_alias a ON a.exercise_id = e.id
       WHERE e.user_id = ?`,
    )
    .all(userId) as { id: string; name: string; default_weight_mode: WeightMode | null; featured: number; alias: string }[];
  const usage = db
    .prepare(
      `SELECT w.exercise_id,
              MAX(s.local_date) AS last_date,
              (SELECT w2.weight_mode FROM workout_set w2 JOIN workout_session s2 ON s2.id = w2.session_id
               WHERE w2.exercise_id = w.exercise_id
               ORDER BY s2.local_date DESC, w2.created_at DESC, w2.position DESC LIMIT 1) AS last_mode
       FROM workout_set w JOIN workout_session s ON s.id = w.session_id
       WHERE s.user_id = ?
       GROUP BY w.exercise_id`,
    )
    .all(userId) as { exercise_id: string; last_date: string; last_mode: WeightMode }[];
  const used = new Map(usage.map((u) => [u.exercise_id, u]));

  const byId = new Map<string, KnownExercise>();
  for (const row of rows) {
    let known = byId.get(row.id);
    if (!known) {
      known = {
        id: row.id,
        name: row.name,
        aliases: [],
        defaultWeightMode: row.default_weight_mode,
        lastWeightMode: used.get(row.id)?.last_mode ?? null,
        lastDate: used.get(row.id)?.last_date ?? null,
        featured: row.featured === 1,
      };
      byId.set(row.id, known);
    }
    known.aliases.push(row.alias.split(" "));
  }
  return [...byId.values()];
}

const CATALOG_SELECT = `
  SELECT e.id, e.name, e.muscle_group, e.default_weight_mode, e.featured, e.source,
         (SELECT group_concat(COALESCE(a.phrase, a.alias), '|') FROM exercise_alias a
          WHERE a.exercise_id = e.id) AS aliases,
         (SELECT COUNT(*) FROM workout_set w WHERE w.exercise_id = e.id) AS set_count,
         (SELECT MAX(s.local_date) FROM workout_set w JOIN workout_session s ON s.id = w.session_id
          WHERE w.exercise_id = e.id) AS last_date
  FROM exercise e`;

type CatalogRow = {
  id: string;
  name: string;
  muscle_group: string | null;
  default_weight_mode: WeightMode | null;
  featured: number;
  source: "catalog" | "custom";
  aliases: string | null;
  set_count: number;
  last_date: string | null;
};

const toCatalogExercise = (r: CatalogRow): CatalogExercise => ({
  id: r.id,
  name: r.name,
  muscleGroup: r.muscle_group,
  defaultWeightMode: r.default_weight_mode,
  aliases: r.aliases ? r.aliases.split("|").filter((a) => phraseKey(a) !== phraseKey(r.name)) : [],
  featured: r.featured === 1,
  source: r.source,
  setCount: r.set_count,
  lastDate: r.last_date,
});

/**
 * Sin búsqueda: los habituales, los propios y los ya usados.
 * Con búsqueda: cualquier ejercicio cuyo nombre o alias contenga el texto.
 */
export function listCatalog(db: DatabaseSync, userId: string, query = ""): CatalogExercise[] {
  const q = phraseKey(query);
  const rows = (
    q
      ? db
          .prepare(
            `${CATALOG_SELECT}
             WHERE e.user_id = ? AND EXISTS (SELECT 1 FROM exercise_alias a WHERE a.exercise_id = e.id AND a.alias LIKE ?)
             ORDER BY e.featured DESC, e.name COLLATE NOCASE LIMIT 60`,
          )
          .all(userId, `%${q}%`)
      : db
          .prepare(
            `${CATALOG_SELECT}
             WHERE e.user_id = ? AND (e.featured = 1 OR e.source = 'custom'
               OR EXISTS (SELECT 1 FROM workout_set w WHERE w.exercise_id = e.id))
             ORDER BY e.name COLLATE NOCASE`,
          )
          .all(userId)
  ) as CatalogRow[];
  return rows.map(toCatalogExercise);
}

export function getCatalogExercise(db: DatabaseSync, userId: string, id: string): CatalogExercise {
  const row = db.prepare(`${CATALOG_SELECT} WHERE e.user_id = ? AND e.id = ?`).get(userId, id) as CatalogRow | undefined;
  if (!row) throw notFound("Ejercicio");
  return toCatalogExercise(row);
}

export type ExerciseInput = {
  name: string;
  muscleGroup: string | null;
  defaultWeightMode: WeightMode | null;
  aliases: string[];
};

function validate(input: ExerciseInput): ExerciseInput {
  const name = cleanExerciseName(input.name);
  if (!name || name.length > 80) throw badRequest("El nombre debe tener entre 1 y 80 caracteres.");
  if (input.muscleGroup !== null && !MUSCLE_GROUPS.includes(input.muscleGroup as MuscleGroup)) {
    throw badRequest("Grupo muscular no válido.");
  }
  if (input.defaultWeightMode !== null && !WEIGHT_MODES.includes(input.defaultWeightMode)) {
    throw badRequest("Tipo de peso no válido.");
  }
  if (input.aliases.length > 20) throw badRequest("Como máximo 20 alias.");
  return { ...input, name };
}

/** Sustituye los alias de un ejercicio. Si uno ya es de otro ejercicio, conflicto. */
function setAliases(db: DatabaseSync, userId: string, exerciseId: string, name: string, aliases: string[]) {
  const phrases = new Map<string, string>();
  for (const phrase of [name, ...aliases]) {
    const key = phraseKey(phrase);
    if (key && !phrases.has(key)) phrases.set(key, phrase.trim());
  }
  const keys = [...phrases.keys()];
  for (const key of keys) {
    const owner = db
      .prepare(
        `SELECT e.name FROM exercise_alias a JOIN exercise e ON e.id = a.exercise_id
         WHERE a.user_id = ? AND a.alias = ? AND a.exercise_id <> ?`,
      )
      .get(userId, key, exerciseId) as { name: string } | undefined;
    if (owner) {
      throw new AppError(409, "alias_taken", `«${phrases.get(key)}» ya sirve para reconocer «${owner.name}».`);
    }
  }
  db.prepare("DELETE FROM exercise_alias WHERE exercise_id = ?").run(exerciseId);
  const insert = db.prepare("INSERT INTO exercise_alias (user_id, alias, exercise_id, phrase) VALUES (?, ?, ?, ?)");
  for (const key of keys) insert.run(userId, key, exerciseId, phrases.get(key) ?? key);
}

export function createExercise(db: DatabaseSync, userId: string, raw: ExerciseInput): CatalogExercise {
  const input = validate(raw);
  const id = randomUUID();
  transaction(db, () => {
    const dup = db
      .prepare("SELECT name FROM exercise WHERE user_id = ? AND normalized_name = ?")
      .get(userId, normalizeExerciseName(input.name)) as { name: string } | undefined;
    if (dup) throw new AppError(409, "exists", `Ya existe «${dup.name}».`);
    db.prepare(
      `INSERT INTO exercise (id, user_id, name, normalized_name, muscle_group, default_weight_mode, source, featured, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'custom', 1, ?)`,
    ).run(id, userId, input.name, normalizeExerciseName(input.name), input.muscleGroup, input.defaultWeightMode, new Date().toISOString());
    setAliases(db, userId, id, input.name, input.aliases);
  });
  return getCatalogExercise(db, userId, id);
}

export function updateExercise(db: DatabaseSync, userId: string, id: string, raw: ExerciseInput): CatalogExercise {
  const input = validate(raw);
  transaction(db, () => {
    getCatalogExercise(db, userId, id);
    const dup = db
      .prepare("SELECT name FROM exercise WHERE user_id = ? AND normalized_name = ? AND id <> ?")
      .get(userId, normalizeExerciseName(input.name), id) as { name: string } | undefined;
    if (dup) throw new AppError(409, "exists", `Ya existe «${dup.name}».`);
    db.prepare(
      `UPDATE exercise SET name = ?, normalized_name = ?, muscle_group = ?, default_weight_mode = ?, featured = 1
       WHERE id = ? AND user_id = ?`,
    ).run(input.name, normalizeExerciseName(input.name), input.muscleGroup, input.defaultWeightMode, id, userId);
    setAliases(db, userId, id, input.name, input.aliases);
  });
  return getCatalogExercise(db, userId, id);
}

export type ExerciseSuggestion = { id: string; name: string; weightMode: WeightMode | null };

/**
 * Sugerencias al escribir un ejercicio: primero los que contienen lo escrito,
 * después los de nombre parecido («hip trast» → Hip Thrust). Sin texto, los
 * más usados últimamente y los habituales.
 */
export function suggestExercises(db: DatabaseSync, userId: string, query: string, limit = 6): ExerciseSuggestion[] {
  const known = loadKnownExercises(db, userId);
  const toSuggestion = (e: KnownExercise) => ({ id: e.id, name: e.name, weightMode: e.lastWeightMode ?? e.defaultWeightMode });
  const byUse = (a: KnownExercise, b: KnownExercise) =>
    (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, "es");

  const key = phraseKey(query);
  if (!key) return known.filter((e) => e.lastDate || e.featured).sort(byUse).slice(0, limit).map(toSuggestion);

  const words = key.split(" ");
  const contains = known
    .map((e) => {
      const name = phraseKey(e.name);
      const hit = e.aliases.some((a) => words.every((w) => a.some((t) => t.startsWith(w))));
      const rank = name === key ? 0 : name.startsWith(key) ? 1 : hit ? 2 : 3;
      return { e, rank };
    })
    .filter((x) => x.rank < 3)
    .sort((a, b) => a.rank - b.rank || byUse(a.e, b.e))
    .map((x) => x.e);
  if (contains.length >= limit) return contains.slice(0, limit).map(toSuggestion);

  const seen = new Set(contains.map((e) => e.id));
  const similar = known
    .filter((e) => !seen.has(e.id))
    .map((e) => ({ e, score: bestSimilarity(words, e) }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score || byUse(a.e, b.e))
    .map((x) => x.e);
  return [...contains, ...similar].slice(0, limit).map(toSuggestion);
}

/** Borra un ejercicio del catálogo propio. Solo si no tiene series (no se pierde historial). */
export function deleteExercise(db: DatabaseSync, userId: string, id: string): void {
  transaction(db, () => {
    const exercise = getCatalogExercise(db, userId, id);
    if (exercise.setCount > 0) {
      throw new AppError(
        409,
        "has_sets",
        `«${exercise.name}» tiene ${exercise.setCount} series guardadas. Cámbiales el ejercicio o bórralas antes.`,
      );
    }
    db.prepare("DELETE FROM exercise WHERE id = ? AND user_id = ?").run(id, userId);
  });
}
